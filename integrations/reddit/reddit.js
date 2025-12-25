import { redditRequest } from './api.js';
import { SUBREDDITS } from '../../utils/config.js';
import { 
  checkIngestionExists,
  saveIngestionRecord,
  generateContentHash
} from '../../db/ingestion.js';
import { isForHirePost, matchesKeywords } from '../../utils/utils.js';
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
  formatISTTime
} from '../../logs/index.js';
import { calculateBatchSize } from '../../utils/utils.js';
import { connectDB } from '../../db/connection.js';

export async function fetchNewPosts(subreddit) {
  const data = await redditRequest(`/r/${subreddit}/new.json?limit=25`);
  const now = Date.now() / 1000;
  const fiveHoursAgo = now - (5 * 60 * 60);
  
  return data.data.children
    .map(child => ({
      id: child.data.id,
      title: child.data.title,
      selftext: child.data.selftext,
      permalink: child.data.permalink,
      created_utc: child.data.created_utc,
      author: child.data.author
    }))
    .filter(post => post.created_utc >= fiveHoursAgo);
}

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
          const normalizedPostId = `reddit-${post.id}`;
          const contentHash = generateContentHash(post.title, post.selftext || '');
          const ingestionCheck = await checkIngestionExists('reddit_ingestion', normalizedPostId, contentHash);
          if (ingestionCheck.exists) {
            stats.dedupCounts.already_classified++;
            continue;
          }
          
          if (isForHirePost(post.title) || (post.selftext && isForHirePost(post.selftext))) {
            await saveIngestionRecord('reddit_ingestion', {
              postId: normalizedPostId,
              contentHash,
              keywordMatched: false,
              metadata: {
                subreddit,
                author: post.author || 'unknown',
                title: post.title
              }
            });
            continue;
          }
          
          const titleMatch = matchesKeywords(post.title);
          const bodyMatch = post.selftext ? matchesKeywords(post.selftext) : false;
          
          if (!titleMatch && !bodyMatch) {
            await saveIngestionRecord('reddit_ingestion', {
              postId: normalizedPostId,
              contentHash,
              keywordMatched: false,
              metadata: {
                subreddit,
                author: post.author || 'unknown',
                title: post.title
              }
            });
            continue;
          }

          await saveIngestionRecord('reddit_ingestion', {
            postId: normalizedPostId,
            contentHash,
            keywordMatched: true,
            metadata: {
              subreddit,
              author: post.author || 'unknown',
              title: post.title
            }
          });
          
          keywordFiltered++;
          stats.subreddits[subreddit].keywordFiltered++;
          stats.total.keywordFiltered++;
          
          const bufferResult = await addToClassificationBuffer({
            postId: normalizedPostId,
            sourcePlatform: 'reddit',
            sourceContext: subreddit,
            title: post.title,
            content: post.selftext || '',
            author: post.author || 'unknown',
            permalink: `https://reddit.com${post.permalink}`,
            createdAt: new Date(post.created_utc * 1000)
          });
          
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
    
    return stats;
  } catch (error) {
    stats.errors++;
    logError(`Reddit scraping error: ${error.message}`, { runId });
    return stats;
  }
}

