import { generateContentHash } from '../../db/ingestion.js';
import { shouldIncludeRedditPost } from '../../filters/reddit.js';
import { checkIngestionExists, saveIngestionRecord } from '../../db/ingestion.js';

export function normalizeRedditPost(post, subreddit) {
  return {
    postId: `reddit-${post.id}`,
    sourcePlatform: 'reddit',
    sourceContext: subreddit,
    title: post.title,
    content: post.selftext || '',
    author: post.author || 'unknown',
    permalink: `https://reddit.com${post.permalink}`,
    createdAt: new Date(post.created_utc * 1000)
  };
}

export async function processRedditPost(post, subreddit) {
  const normalizedPostId = `reddit-${post.id}`;
  const contentHash = generateContentHash(post.title, post.selftext || '');
  
  const ingestionCheck = await checkIngestionExists('reddit_ingestion', normalizedPostId, contentHash);
  if (ingestionCheck.exists) {
    return { shouldProcess: false, reason: 'already_classified' };
  }
  
  if (!shouldIncludeRedditPost(post.title, post.selftext || '')) {
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
    return { shouldProcess: false, reason: 'keyword_filter' };
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
  
  return {
    shouldProcess: true,
    normalized: normalizeRedditPost(post, subreddit)
  };
}

