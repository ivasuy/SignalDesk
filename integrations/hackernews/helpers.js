import { generateContentHash } from '../../db/ingestion.js';
import { shouldIncludeHackerNewsPost } from '../../filters/hackernews.js';
import { checkIngestionExists, saveIngestionRecord } from '../../db/ingestion.js';
import { normalizeJob, normalizeComment } from './api.js';
import { cleanHTML, cleanTitle } from '../../utils/html-cleaner.js';


export function normalizeHackerNewsComment(comment, parentPost) {
  return normalizeComment(comment, parentPost, cleanTitle, cleanHTML);
}

export async function processHackerNewsJob(job, fetchJobDescription) {
  const jobDescription = await fetchJobDescription(job);
  const jobWithDescription = {
    ...job,
    text: jobDescription || job.text || ''
  };
  const normalized = normalizeJob(jobWithDescription, cleanTitle, cleanHTML);
  
  const contentHash = generateContentHash(normalized.title, normalized.selftext);
  const ingestionCheck = await checkIngestionExists('hackernews_jobs_ingestion', normalized.id, contentHash);
  
  if (ingestionCheck.exists) {
    return { shouldProcess: false, reason: 'already_classified' };
  }
  
  if (!shouldIncludeHackerNewsPost(normalized.title, normalized.selftext, false)) {
    await saveIngestionRecord('hackernews_jobs_ingestion', {
      postId: normalized.id,
      contentHash,
      keywordMatched: false,
      metadata: {
        author: normalized.author,
        title: normalized.title
      }
    });
    return { shouldProcess: false, reason: 'keyword_filter' };
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
  
  return {
    shouldProcess: true,
    normalized
  };
}

export async function processHackerNewsComment(comment, parentPost) {
  const normalized = normalizeHackerNewsComment(comment, parentPost);
  
  const contentHash = generateContentHash(normalized.title, normalized.selftext);
  const ingestionCheck = await checkIngestionExists('hackernews_hiring_ingestion', normalized.id, contentHash);
  
  if (ingestionCheck.exists) {
    return { shouldProcess: false, reason: 'already_classified' };
  }
  
  if (!shouldIncludeHackerNewsPost(normalized.title, normalized.selftext, false)) {
    await saveIngestionRecord('hackernews_hiring_ingestion', {
      postId: normalized.id,
      contentHash,
      keywordMatched: false,
      metadata: {
        author: normalized.author,
        title: normalized.title
      }
    });
    return { shouldProcess: false, reason: 'keyword_filter' };
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
  
  return {
    shouldProcess: true,
    normalized
  };
}

