import { searchIssues } from './api.js';
import { 
  checkIngestionExists,
  saveIngestionRecord,
  generateContentHash
} from '../../db/ingestion.js';
import { buildGitHubSearchQueries } from '../../utils/utils.js';
import { matchesSkillFilter, bucketByRecency, processBatchesWithEarlyStop } from '../../utils/utils.js';
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
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadResumeSkills() {
  try {
    const resumePath = join(__dirname, '..', '..', 'resume.json');
    const resumeData = JSON.parse(readFileSync(resumePath, 'utf8'));
    
    const skills = [];
    
    if (resumeData.skills?.languages) {
      skills.push(...resumeData.skills.languages.map(s => s.toLowerCase()));
    }
    
    if (resumeData.skills?.frameworks_and_libraries) {
      skills.push(...resumeData.skills.frameworks_and_libraries.map(s => s.toLowerCase()));
    }
    
    if (resumeData.skills?.databases) {
      skills.push(...resumeData.skills.databases.map(s => s.toLowerCase()));
    }
    
    if (resumeData.skills?.other) {
      skills.push(...resumeData.skills.other.map(s => s.toLowerCase()));
    }
    
    return [...new Set(skills)];
  } catch (error) {
    throw new Error(`Failed to load resume.json: ${error.message}`);
  }
}

function normalizeIssue(issue) {
  const repoFullName = issue.repository_url ? issue.repository_url.split('/repos/')[1] : 'unknown';
  return {
    id: `github-${issue.id}`,
    title: issue.title,
    selftext: issue.body || '',
    permalink: issue.html_url,
    created_utc: Math.floor(new Date(issue.created_at).getTime() / 1000),
    author: issue.user?.login || 'unknown',
    source: 'github',
    repoFullName: repoFullName
  };
}


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
    
    const repoGroups = {};
    for (const issue of allIssues) {
      const repoFullName = issue.repository_url ? issue.repository_url.split('/repos/')[1] : 'unknown';
      if (!repoGroups[repoFullName]) {
        repoGroups[repoFullName] = [];
      }
      repoGroups[repoFullName].push(issue);
    }
    
    const bestIssuesPerRepo = [];
    for (const [repo, issues] of Object.entries(repoGroups)) {
      issues.sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return dateB - dateA;
      });
      bestIssuesPerRepo.push(issues[0]);
    }
    
    stats.scraped = bestIssuesPerRepo.length;
    logInfo(`Selected ${stats.scraped} best issues (1 per repo) from ${Object.keys(repoGroups).length} repos`, { runId });
    
    const buckets = bucketByRecency(bestIssuesPerRepo);
    
    const processBucket = async (issues, bucketName) => {
      if (issues.length === 0) return 0;
      
      let validOpportunities = 0;
      
      for (const issue of issues) {
        const normalized = normalizeIssue(issue);
        
        const contentHash = generateContentHash(normalized.title, normalized.selftext);
        
        const ingestionCheck = await checkIngestionExists('github_ingestion', normalized.id, contentHash);
        if (ingestionCheck.exists) {
          stats.dedupCounts.already_classified++;
          continue;
        }
        
        const titleMatch = matchesSkillFilter(normalized.title, normalized.selftext, skills.length > 0 ? skills : []);
        if (!titleMatch) {
          stats.skillFiltered++;
          await saveIngestionRecord('github_ingestion', {
            postId: normalized.id,
            contentHash,
            keywordMatched: false,
            metadata: {
              repoFullName: normalized.repoFullName,
              author: normalized.author,
              title: normalized.title
            }
          });
          continue;
        }
        
        await saveIngestionRecord('github_ingestion', {
          postId: normalized.id,
          contentHash,
          keywordMatched: true,
          metadata: {
            repoFullName: normalized.repoFullName,
            author: normalized.author,
            title: normalized.title
          }
        });
        
        const repoCount = stats.reposDetected.get(normalized.repoFullName) || 0;
        stats.reposDetected.set(normalized.repoFullName, repoCount + 1);
        
        const bufferResult = await addToClassificationBuffer({
          postId: normalized.id,
          sourcePlatform: 'github',
          sourceContext: normalized.repoFullName,
          title: normalized.title,
          content: normalized.selftext || '',
          author: normalized.author,
          permalink: normalized.permalink,
          createdAt: new Date(normalized.created_utc * 1000)
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
    
    return stats;
  } catch (error) {
    stats.errors++;
    logError(`Error scraping GitHub: ${error.message}`, { runId });
    return stats;
  }
}

