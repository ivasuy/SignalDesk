import { getJobStories, getItem, fetchJobDescription } from './api.js';
import { filterByTimeBuckets, processBatchesSequentially } from '../../utils/utils.js';
import { processHackerNewsJob } from './helpers.js';
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
        
        const result = await processHackerNewsJob(job, fetchJobDescription);
        
        if (!result.shouldProcess) {
          if (result.reason === 'already_classified') {
            stats.dedupCounts.already_classified++;
          }
          continue;
        }
        
        stats.keywordFiltered++;
        
        const bufferResult = await addToClassificationBuffer({
          postId: result.normalized.id,
          sourcePlatform: 'hn',
          sourceContext: 'jobs',
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

