import { productHuntRequest } from './api.js';
import { 
  checkIngestionExists,
  saveIngestionRecord,
  generateContentHash
} from '../../db/ingestion.js';
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
import { calculateBatchSize, matchesProductHuntCollabFilter, shouldExcludeProductHunt } from '../../utils/utils.js';

const POSTS_QUERY = `
  query Posts($postedAfter: DateTime!, $first: Int!) {
    posts(postedAfter: $postedAfter, first: $first, order: VOTES) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          votesCount
          createdAt
          topics {
            edges {
              node {
                name
              }
            }
          }
        }
      }
    }
  }
`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchProductHuntPosts() {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const dateStr = yesterday.toISOString();
    
    const data = await productHuntRequest(POSTS_QUERY, {
      postedAfter: dateStr,
      first: 50
    });
    
    if (!data || !data.posts || !data.posts.edges) {
      logError('Invalid response structure from Product Hunt API - missing posts.edges');
      return [];
    }
    
    if (data.posts.edges.length === 0) {
      return [];
    }
    
    const posts = data.posts.edges.map(edge => ({
      id: edge.node.id,
      name: edge.node.name,
      tagline: edge.node.tagline,
      description: edge.node.description,
      url: edge.node.url,
      votesCount: edge.node.votesCount,
      createdAt: edge.node.createdAt,
      topics: edge.node.topics?.edges?.map(t => t.node.name) || []
    }));
    
    return posts;
  } catch (error) {
    logError(`Error fetching Product Hunt posts: ${error.message}`);
    return [];
  }
}


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
      const normalizedPostId = `ph-${post.id}`;
      const contentHash = generateContentHash(post.name, post.description || post.tagline || '');
      
      const ingestionCheck = await checkIngestionExists('producthunt_ingestion', normalizedPostId, contentHash);
      if (ingestionCheck.exists) {
        stats.dedupCounts.already_classified++;
        continue;
      }
      
      const fullText = `${post.name}\n\n${post.tagline || ''}\n\n${post.description || ''}`;
      const content = fullText.trim();
      
      const postAge = new Date() - new Date(post.createdAt);
      const daysOld = postAge / (1000 * 60 * 60 * 24);
      
      if (daysOld > 14) {
        continue;
      }
      
      if (shouldExcludeProductHunt(post.description)) {
        continue;
      }
      
      if (!matchesProductHuntCollabFilter(post.name, post.tagline, post.description)) {
        continue;
      }
      
      await saveIngestionRecord('producthunt_ingestion', {
        postId: normalizedPostId,
        contentHash,
        keywordMatched: true,
        metadata: {
          name: post.name,
          tagline: post.tagline,
          url: post.url
        }
      });
      
      stats.keywordFiltered++;
      
      const bufferResult = await addToClassificationBuffer({
        postId: normalizedPostId,
        sourcePlatform: 'producthunt',
        sourceContext: 'producthunt',
        title: post.name,
        content: content,
        author: 'unknown',
        permalink: post.url,
        createdAt: new Date(post.createdAt)
      });
      
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
    
    return stats;
  } catch (error) {
    stats.errors++;
    logError(`Error scraping Product Hunt: ${error.message}`, { runId });
    return stats;
  }
}

