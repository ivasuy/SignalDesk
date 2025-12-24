import { getNewStories, getTopStories, getItem, getUserSubmissions } from './api.js';
import { 
  checkIngestionExists,
  saveIngestionRecord,
  generateContentHash
} from '../../db/ingestion.js';
import { matchesKeywords, matchesHiringTitle, filterByTimeBuckets, processBatchesSequentially} from '../../utils/utils.js';
import { cleanHTML, cleanTitle } from '../../utils/html-cleaner.js';
import { addToClassificationBuffer } from '../../db/buffer.js';
import { 
  logPlatformStart, 
  logPlatformComplete, 
  logPlatformSummary,
  logError,
  logPipelineState,
  formatISTTime
} from '../../logs/index.js';
import { calculateBatchSize } from '../../utils/utils.js';
import { connectDB } from '../../db/connection.js';

async function findLatestHiringPost() {
  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
  
  try {
    const whoishiringSubmissions = await getUserSubmissions('whoishiring');
    
    for (const storyId of whoishiringSubmissions.slice(0, 30)) {
      const story = await getItem(storyId);
      
      if (!story || !story.title || !story.time) continue;
      
      if (story.time < ninetyDaysAgo) continue;
      
      if (matchesHiringTitle(story.title)) {
        return story;
      }
    }
  } catch (error) {
    logError(`Error fetching whoishiring submissions: ${error.message}`);
  }
  
  const [newStoryIds, topStoryIds] = await Promise.all([
    getNewStories(),
    getTopStories()
  ]);
  
  const allStoryIds = [...new Set([...newStoryIds, ...topStoryIds])].slice(0, 500);
  
  for (const storyId of allStoryIds) {
    const story = await getItem(storyId);
    
    if (!story || !story.title || !story.time) continue;
    
    if (story.time < ninetyDaysAgo) continue;
    
    if (matchesHiringTitle(story.title)) {
      // Found hiring post - no logging needed (handled in main scraper)
      return story;
    }
  }
  
  return null;
}

async function getTopLevelComments(postId) {
  const post = await getItem(postId);
  if (!post || !post.kids) return [];
  
  const comments = await Promise.all(
    post.kids.slice(0, 100).map(kidId => getItem(kidId))
  );
  
  return comments.filter(comment => 
    comment && 
    !comment.deleted && 
    !comment.dead &&
    comment.text
  );
}

function normalizeComment(comment, parentPost) {
  const cleanedText = cleanHTML(comment.text);
  const title = cleanTitle(cleanedText.split('\n')[0] || cleanedText.substring(0, 200));
  
  return {
    id: `hn-${comment.id}`,
    title: title || 'Hacker News Comment',
    selftext: cleanedText,
    permalink: `https://news.ycombinator.com/item?id=${comment.id}`,
    created_utc: comment.time,
    author: comment.by || 'unknown',
    source: 'hackernews-ask-hiring',
    parentPostTitle: parentPost.title
  };
}

export async function scrapeAskHiring() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const runId = `hackernews-hiring-${year}${month}${day}-${hour}`;
  
  logPlatformStart('hackernews', runId);
  
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
    const hiringPost = await findLatestHiringPost();
    if (!hiringPost) {
      logPlatformComplete('hackernews', runId);
      return stats;
    }
    
    const comments = await getTopLevelComments(hiringPost.id);
    stats.scraped = comments.length;
    
    const timeBuckets = filterByTimeBuckets(comments, 'time');
    
    const processComments = async (commentBatch, batchName) => {
      for (const comment of commentBatch) {
        const normalized = normalizeComment(comment, hiringPost);
        
        const contentHash = generateContentHash(normalized.title, normalized.selftext);
        
        const ingestionCheck = await checkIngestionExists('hackernews_hiring_ingestion', normalized.id, contentHash);
        if (ingestionCheck.exists) {
          stats.dedupCounts.already_classified++;
          continue;
        }
        
        const titleMatch = matchesKeywords(normalized.title);
        const bodyMatch = matchesKeywords(normalized.selftext);
        
        if (!titleMatch && !bodyMatch) {
          await saveIngestionRecord('hackernews_hiring_ingestion', {
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
        
        await saveIngestionRecord('hackernews_hiring_ingestion', {
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
          sourceContext: 'ask-hiring',
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
    
    await processBatchesSequentially(timeBuckets, processComments);
    
    const totalDedup = Object.values(stats.dedupCounts).reduce((a, b) => a + b, 0);
    
    logPlatformSummary('hackernews', runId, {
      dateFilter: 'last 7 days',
      collection: 'hackernews_hiring_ingestion',
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
    
    logPlatformComplete('hackernews', runId);
    
    return stats;
  } catch (error) {
    stats.errors++;
    logError(`Error scraping Ask Hiring: ${error.message}`);
    logPlatformComplete('hackernews', runId);
    return stats;
  }
}

