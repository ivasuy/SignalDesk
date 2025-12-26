import { fetchProductHuntPosts } from './api.js';
import { processProductHuntPost } from './helpers.js';
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
import { connectDB } from '../../db/connection.js';
import { calculateBatchSize } from '../../utils/utils.js';
import { markPlatformIngestionComplete, getDailyDeliveryState } from '../../db/state.js';



export async function scrapeProductHunt() {
  const runId = generateRunId('producthunt');
  const fetchStartTime = Date.now();
  
  logPlatformStart('producthunt', runId);
  logPlatformFetching('producthunt');
  
  const stats = {
    scraped: 0,
    keywordFiltered: 0,
    buildIdeasKept: 0,
    collabPostsKept: 0,
    errors: 0,
    dedupCounts: {
      already_sent: 0,
      already_in_queue: 0,
      already_classified: 0,
      already_in_buffer: 0
    }
  };
  
  try {
    const posts = await fetchProductHuntPosts();
    
    if (posts.length === 0) {
      logInfo('No posts found. Exiting.', { runId });
      logPlatformComplete('producthunt', runId);
      return stats;
    }
    
    stats.scraped = posts.length;
    
    const keywordFilterStart = Date.now();
    
    for (const post of posts) {
      const result = await processProductHuntPost(post);
      
      if (!result.shouldProcess) {
        if (result.reason === 'already_classified') {
          stats.dedupCounts.already_classified++;
        }
        continue;
      }
      
      stats.keywordFiltered++;
      
      const bufferResult = await addToClassificationBuffer(result.normalized);
      
      if (!bufferResult.buffered) {
        if (bufferResult.reason === 'already_processed') {
          stats.dedupCounts.already_sent++;
        } else if (bufferResult.reason === 'already_in_buffer') {
          stats.dedupCounts.already_in_buffer++;
        }
      } else {
        stats.buildIdeasKept++;
        stats.collabPostsKept++;
      }
    }
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const totalDedup = Object.values(stats.dedupCounts).reduce((a, b) => a + b, 0);
    
    stopPlatformFetching('producthunt');
    logPlatformSummary('producthunt', runId, {
      dateFilter: dateStr,
      collection: 'producthunt_ingestion',
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
    
    logPlatformComplete('producthunt', runId);
    
    const allIngestionDone = await markPlatformIngestionComplete('producthunt');
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
    logError(`Error scraping Product Hunt: ${error.message}`, { runId });
    return stats;
  }
}

