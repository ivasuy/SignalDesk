import { getJobStories, getItem } from './api.js';
import { 
  checkIngestionExists,
  saveIngestionRecord,
  generateContentHash
} from '../../db/ingestion.js';
import { matchesKeywords, isForHirePost, filterByTimeBuckets, processBatchesSequentially } from '../../utils/utils.js';
import { cleanHTML, cleanTitle } from '../../utils/html-cleaner.js';
import { addToClassificationBuffer } from '../../db/buffer.js';
import { 
  logPlatformStart, 
  logPlatformSummary,
  logPlatformFetching,
  stopPlatformFetching,
  logError,
  logPipelineState,
  formatISTTime
} from '../../logs/index.js';
import { calculateBatchSize } from '../../utils/utils.js';
import { connectDB } from '../../db/connection.js';

function normalizeJob(job) {
  const cleanedTitle = cleanTitle(job.title || 'Hacker News Job');
  const cleanedText = cleanHTML(job.text || '');
  
  return {
    id: `hn-job-${job.id}`,
    title: cleanedTitle,
    selftext: cleanedText,
    permalink: job.url || `https://news.ycombinator.com/item?id=${job.id}`,
    created_utc: job.time,
    author: job.by || 'unknown',
    source: 'hackernews-jobs',
    jobUrl: job.url
  };
}

async function fetchJobDescription(job) {
  if (!job.url || !job.url.includes('ycombinator.com')) {
    return job.text || '';
  }
  
  try {
    const response = await fetch(job.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HN-Scraper/1.0)'
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) return job.text || '';
    
    const html = await response.text();
    
    const patterns = [
      /<div[^>]*class="job-description"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    ];
    
    for (const pattern of patterns) {
      const textMatch = html.match(pattern);
      if (textMatch) {
        const text = textMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length > 50) {
          return text.substring(0, 2000);
        }
      }
    }
    
    return job.text || '';
  } catch (error) {
    return job.text || '';
  }
}

export async function scrapeJobs() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const runId = `hackernews-jobs-${year}${month}${day}-${hour}`;
  
  logPlatformStart('hackernews', runId);
  logPlatformFetching('hackernews');
  
  const stats = {
    scraped: 0,
    keywordFiltered: 0,
    aiClassified: 0,
    opportunities: 0,
    highValue: 0,
    errors: 0,
    dedupCounts: {
      already_classified: 0,
      already_sent: 0,
      already_in_buffer: 0
    }
  };
  
  try {
    
    const jobIds = await getJobStories();
    
    const jobs = [];
    for (const jobId of jobIds) {
      const job = await getItem(jobId);
      if (!job || !job.title || !job.time) continue;
      jobs.push(job);
    }
    
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - (24 * 60 * 60);
    
    const recentJobs = jobs.filter(job => job.time >= oneDayAgo);
    
    const processJobs = async (jobBatch, batchName) => {
      for (const job of jobBatch) {
        stats.scraped++;
        
        if (isForHirePost(job.title) || (job.text && isForHirePost(job.text))) {
          continue;
        }
        
        const jobDescription = await fetchJobDescription(job);
        const jobWithDescription = {
          ...job,
          text: jobDescription || job.text || ''
        };
        const normalized = normalizeJob(jobWithDescription);
        
        const contentHash = generateContentHash(normalized.title, normalized.selftext);
        
        const ingestionCheck = await checkIngestionExists('hackernews_jobs_ingestion', normalized.id, contentHash);
        if (ingestionCheck.exists) {
          stats.dedupCounts.already_classified++;
          continue;
        }
        
        const titleMatch = matchesKeywords(normalized.title, false);
        const bodyMatch = matchesKeywords(normalized.selftext, false);
        
        if (!titleMatch && !bodyMatch) {
          await saveIngestionRecord('hackernews_jobs_ingestion', {
            postId: normalized.id,
            contentHash,
            keywordMatched: false,
            metadata: {
              author: normalized.author,
              title: normalized.title
            }
          });
          continue;
        }
        
        await saveIngestionRecord('hackernews_jobs_ingestion', {
          postId: normalized.id,
          contentHash,
          keywordMatched: true,
          metadata: {
            author: normalized.author,
            title: normalized.title
          }
        });
        
        stats.keywordFiltered++;
        
        const bufferResult = await addToClassificationBuffer({
          postId: normalized.id,
          sourcePlatform: 'hn',
          sourceContext: 'jobs',
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
        }
      }
    };
    
    const timeBuckets = {
      last24h: recentJobs,
      oneToTwoDays: [],
      twoToSevenDays: []
    };
    
    await processBatchesSequentially(timeBuckets, processJobs);
    
    const totalDedup = Object.values(stats.dedupCounts).reduce((a, b) => a + b, 0);
    
    stopPlatformFetching('hackernews');
    logPlatformSummary('hackernews', runId, {
      dateFilter: 'last 24 hours',
      collection: 'hackernews_jobs_ingestion',
      totalFetched: stats.scraped,
      afterKeywordFilter: stats.keywordFiltered
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
    
    return stats;
  } catch (error) {
    stats.errors++;
    logError(`Error scraping Jobs: ${error.message}`);
    logPlatformComplete('hackernews', runId);
    return stats;
  }
}

