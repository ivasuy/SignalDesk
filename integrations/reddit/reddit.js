import { fetchNewPosts } from './api.js';
import { SUBREDDITS } from '../../utils/constants.js';
import { processRedditPost } from './helpers.js';
import { addToClassificationBuffer } from '../../db/buffer.js';
import { 
  generateRunId, 
  logPlatformStart, 
  logPlatformComplete, 
  logPlatformSummary,
  logPlatformFetching,
  stopPlatformFetching,
  logError,
  logPipelineState,
  formatISTTime,
  logInfo
} from '../../logs/index.js';
import { calculateBatchSize } from '../../utils/utils.js';
import { connectDB } from '../../db/connection.js';
import { markPlatformIngestionComplete, getDailyDeliveryState } from '../../db/state.js';

export async function scrapeReddit() {
  const runId = generateRunId('reddit');
  const fetchStartTime = Date.now();
  
  logPlatformStart('reddit', runId);
  logPlatformFetching('reddit');
  
  const stats = {
    subreddits: {},
    total: {
      scraped: 0,
      keywordFiltered: 0,
      aiClassified: 0,
      opportunities: 0,
      highValue: 0
    },
    errors: 0,
    dedupCounts: {
      already_sent: 0,
      already_in_queue: 0,
      already_classified: 0,
      already_in_buffer: 0
    }
  };
  
  try {
    for (const subreddit of SUBREDDITS) {
      stats.subreddits[subreddit] = {
        scraped: 0,
        keywordFiltered: 0,
        aiClassified: 0,
        opportunities: 0,
        highValue: 0
      };
      
      try {
        const posts = await fetchNewPosts(subreddit);
        stats.subreddits[subreddit].scraped = posts.length;
        stats.total.scraped += posts.length;
        
        let keywordFiltered = 0;
        
        for (const post of posts) {
          const result = await processRedditPost(post, subreddit);
          
          if (!result.shouldProcess) {
            if (result.reason === 'already_classified') {
              stats.dedupCounts.already_classified++;
            }
            continue;
          }
          
          keywordFiltered++;
          stats.subreddits[subreddit].keywordFiltered++;
          stats.total.keywordFiltered++;
          
          const bufferResult = await addToClassificationBuffer(result.normalized);
          
          if (!bufferResult.buffered) {
            if (bufferResult.reason === 'already_processed') {
              stats.dedupCounts.already_sent++;
            } else if (bufferResult.reason === 'already_in_buffer') {
              stats.dedupCounts.already_in_buffer++;
            }
          }
        }
      } catch (error) {
        stats.errors++;
        logError(`Error processing r/${subreddit}: ${error.message}`, { runId, subreddit });
      }
    }
    
    const dateFilter = 'last 5 hours';
    const totalDedup = Object.values(stats.dedupCounts).reduce((a, b) => a + b, 0);
    const sentToBuffer = stats.total.keywordFiltered - stats.dedupCounts.already_sent - stats.dedupCounts.already_in_buffer;
    
    stopPlatformFetching('reddit');
    logPlatformSummary('reddit', runId, {
      dateFilter,
      collection: 'reddit_ingestion',
      totalFetched: stats.total.scraped,
      afterKeywordFilter: stats.total.keywordFiltered
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
    
    logPlatformComplete('reddit', runId);
    
    const allIngestionDone = await markPlatformIngestionComplete('reddit');
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
    logError(`Reddit scraping error: ${error.message}`, { runId });
    return stats;
  }
}

