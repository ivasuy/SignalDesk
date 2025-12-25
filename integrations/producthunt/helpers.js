import { generateContentHash } from '../../db/ingestion.js';
import { shouldIncludeProductHuntPost } from '../../filters/producthunt.js';
import { checkIngestionExists, saveIngestionRecord } from '../../db/ingestion.js';

export function normalizeProductHuntPost(post) {
  const fullText = `${post.name}\n\n${post.tagline || ''}\n\n${post.description || ''}`;
  return {
    postId: `ph-${post.id}`,
    sourcePlatform: 'producthunt',
    sourceContext: 'producthunt',
    title: post.name,
    content: fullText.trim(),
    author: 'unknown',
    permalink: post.url,
    createdAt: new Date(post.createdAt)
  };
}

export function isPostTooOld(post, maxDays = 14) {
  const postAge = new Date() - new Date(post.createdAt);
  const daysOld = postAge / (1000 * 60 * 60 * 24);
  return daysOld > maxDays;
}

export async function processProductHuntPost(post) {
  const normalizedPostId = `ph-${post.id}`;
  const contentHash = generateContentHash(post.name, post.description || post.tagline || '');
  
  const ingestionCheck = await checkIngestionExists('producthunt_ingestion', normalizedPostId, contentHash);
  if (ingestionCheck.exists) {
    return { shouldProcess: false, reason: 'already_classified' };
  }
  
  if (isPostTooOld(post)) {
    return { shouldProcess: false, reason: 'too_old' };
  }
  
  if (!shouldIncludeProductHuntPost(post.name, post.tagline, post.description)) {
    return { shouldProcess: false, reason: 'keyword_filter' };
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
  
  return {
    shouldProcess: true,
    normalized: normalizeProductHuntPost(post)
  };
}

