import { searchIssues } from './api.js';
import { buildGitHubSearchQueries } from '../../filters/github.js';
import { bucketByRecency, processBatchesWithEarlyStop } from '../../utils/utils.js';
import { addToClassificationBuffer } from '../../db/buffer.js';
import { 
  generateRunId, 
  logPlatformStart, 
  logPlatformComplete, 
  logPlatformSummary,
  logPlatformFetching,
  stopPlatformFetching,
  logInfo,
  logError,
  logPipelineState,
  formatISTTime
} from '../../logs/index.js';
import { calculateBatchSize } from '../../utils/utils.js';
import { connectDB } from '../../db/connection.js';
import { markPlatformIngestionComplete, getDailyDeliveryState } from '../../db/state.js';
import { loadResumeSkills, groupIssuesByRepo, selectBestIssuePerRepo, processGitHubIssue } from './helpers.js';




export async function scrapeGitHub() {
  const runId = generateRunId('github');
  
  logPlatformStart('github', runId);
  logPlatformFetching('github');
  
  const stats = {
    scraped: 0,
    skillFiltered: 0,
    aiClassified: 0,
    opportunities: 0,
    errors: 0,
    reposDetected: new Map(),
    dedupCounts: {
      already_sent: 0,
      already_in_queue: 0,
      already_classified: 0,
      already_in_buffer: 0
    }
  };
  
  try {
    const skills = loadResumeSkills();
    logInfo(`Loaded ${skills.length} skills from resume`, { runId });
    
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const dateStr = oneDayAgo.toISOString().split('T')[0];
    
    logInfo(`Searching for issues created after ${dateStr} (last 24 hours)`, { runId });
    
    const queries = buildGitHubSearchQueries(dateStr);
    
    const allIssues = [];
    const seenIssueIds = new Set();
    
    for (const query of queries) {
      try {
        const response = await searchIssues(query, 'created', 'desc', 50);
        
        if (response && response.items && response.items.length > 0) {
          for (const issue of response.items) {
            if (!seenIssueIds.has(issue.id)) {
              seenIssueIds.add(issue.id);
              allIssues.push(issue);
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        if (error.message.includes('rate limit')) {
          logError(`GitHub rate limit hit. Waiting before retry...`, { runId });
          await new Promise(resolve => setTimeout(resolve, 60000));
          continue;
        }
        stats.errors++;
        logError(`Error executing query "${query}": ${error.message}`, { runId });
      }
    }
    
    if (allIssues.length === 0) {
      logInfo('No issues found across all queries', { runId });
      logPlatformComplete('github', runId);
      return stats;
    }
    
    logInfo(`Found ${allIssues.length} unique issues before filtering`, { runId });
    
    const repoGroups = groupIssuesByRepo(allIssues);
    const bestIssuesPerRepo = selectBestIssuePerRepo(repoGroups);
    
    stats.scraped = bestIssuesPerRepo.length;
    logInfo(`Selected ${stats.scraped} best issues (1 per repo) from ${Object.keys(repoGroups).length} repos`, { runId });
    
    const buckets = bucketByRecency(bestIssuesPerRepo);
    
    const processBucket = async (issues, bucketName) => {
      if (issues.length === 0) return 0;
      
      let validOpportunities = 0;
      
      for (const issue of issues) {
        const result = await processGitHubIssue(issue, skills);
        
        if (!result.shouldProcess) {
          if (result.reason === 'non_tech_issue' || result.reason === 'skill_filter') {
            stats.skillFiltered++;
          } else if (result.reason === 'already_classified') {
            stats.dedupCounts.already_classified++;
          }
          continue;
        }
        
        const repoCount = stats.reposDetected.get(result.normalized.repoFullName) || 0;
        stats.reposDetected.set(result.normalized.repoFullName, repoCount + 1);
        
        const bufferResult = await addToClassificationBuffer({
          postId: result.normalized.id,
          sourcePlatform: 'github',
          sourceContext: result.normalized.repoFullName,
          title: result.normalized.title,
          content: result.normalized.selftext || '',
          author: result.normalized.author,
          permalink: result.normalized.permalink,
          createdAt: new Date(result.normalized.created_utc * 1000)
        });
        
        if (!bufferResult.buffered) {
          if (bufferResult.reason === 'already_processed') {
            stats.dedupCounts.already_sent++;
          } else if (bufferResult.reason === 'already_in_buffer') {
            stats.dedupCounts.already_in_buffer++;
          }
        } else {
          validOpportunities++;
        }
      }
      
      return validOpportunities;
    };
    
    await processBatchesWithEarlyStop(buckets, processBucket, { log: () => {} });
    
    const totalDedup = Object.values(stats.dedupCounts).reduce((a, b) => a + b, 0);
    
    stopPlatformFetching('github');
    logPlatformSummary('github', runId, {
      dateFilter: dateStr,
      collection: 'github_ingestion',
      totalFetched: stats.scraped,
      afterKeywordFilter: stats.scraped - stats.skillFiltered
    });
    
    
    const db = await connectDB();
    const bufferSize = await db.collection('classification_buffer').countDocuments({ classified: false });
    const queuePending = await db.collection('delivery_queue').countDocuments({ sent: false });
    const nextQueueItem = await db.collection('delivery_queue')
      .findOne({ sent: false }, { sort: { earliestSendAt: 1 } });
    
    const { batchSize, estimatedBatches } = calculateBatchSize(bufferSize, 5);
    
    logPipelineState({
      ingestionComplete: true,
      bufferSize,
      batchSize,
      estimatedBatches,
      queuePending,
      nextSend: nextQueueItem ? formatISTTime(nextQueueItem.earliestSendAt) : 'N/A'
    });
    
    logPlatformComplete('github', runId);
    
    const allIngestionDone = await markPlatformIngestionComplete('github');
    if (allIngestionDone) {
      const dailyState = await getDailyDeliveryState();
      const bufferSizeAfter = await db.collection('classification_buffer').countDocuments({ classified: false });
      
      if (bufferSizeAfter === 0) {
        logInfo('Ingestion complete. No items eligible for classification today.');
      } else {
        logInfo(`Ingestion complete. Waiting for classification to finish... (${bufferSizeAfter} items in buffer)`);
      }
    }
    
    return stats;
  } catch (error) {
    stats.errors++;
    logError(`Error scraping GitHub: ${error.message}`, { runId });
    return stats;
  }
}

