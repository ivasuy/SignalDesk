import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { checkIngestionExists, generateContentHash } from '../../db/ingestion.js';
import { shouldIncludeRedditPost } from '../../filters/reddit.js';
import { shouldIncludeHackerNewsPost } from '../../filters/hackernews.js';
import { shouldIncludeProductHuntPost } from '../../filters/producthunt.js';
import { shouldIncludeGitHubIssue } from '../../filters/github.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function loadResumeSkills() {
  try {
    const resumePath = join(__dirname, '..', '..', 'resume.json');
    const resumeData = JSON.parse(readFileSync(resumePath, 'utf8'));
    
    const skills = [];
    if (resumeData.skills?.languages) {
      skills.push(...resumeData.skills.languages.map(s => s.toLowerCase()));
    }
    if (resumeData.skills?.frameworks_and_libraries) {
      skills.push(...resumeData.skills.frameworks_and_libraries.map(s => s.toLowerCase()));
    }
    if (resumeData.skills?.databases) {
      skills.push(...resumeData.skills.databases.map(s => s.toLowerCase()));
    }
    if (resumeData.skills?.other) {
      skills.push(...resumeData.skills.other.map(s => s.toLowerCase()));
    }
    
    return [...new Set(skills)];
  } catch (error) {
    return [];
  }
}

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

export async function shouldProcessRedditPost(post, subreddit) {
  const normalizedPostId = `reddit-${post.id}`;
  const contentHash = generateContentHash(post.title, post.selftext || '');
  const ingestionCheck = await checkIngestionExists('reddit_ingestion', normalizedPostId, contentHash);
  
  if (ingestionCheck.exists) {
    return { shouldProcess: false };
  }
  
  if (!shouldIncludeRedditPost(post.title, post.selftext || '')) {
    return { shouldProcess: false };
  }
  
  return { 
    shouldProcess: true,
    normalized: normalizeRedditPost(post, subreddit)
  };
}

export function normalizeHackerNewsPost(normalized) {
  return {
    postId: normalized.id,
    sourcePlatform: 'hackernews',
    sourceContext: 'jobs',
    title: normalized.title,
    content: normalized.selftext,
    author: normalized.author,
    permalink: normalized.permalink,
    createdAt: new Date(normalized.created_utc * 1000)
  };
}

export async function shouldProcessHackerNewsPost(normalized) {
  const contentHash = generateContentHash(normalized.title, normalized.selftext);
  const ingestionCheck = await checkIngestionExists('hackernews_jobs_ingestion', normalized.id, contentHash);
  
  if (ingestionCheck.exists) {
    return { shouldProcess: false };
  }
  
  if (!shouldIncludeHackerNewsPost(normalized.title, normalized.selftext, false)) {
    return { shouldProcess: false };
  }
  
  return {
    shouldProcess: true,
    normalized: normalizeHackerNewsPost(normalized)
  };
}

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

export function isProductHuntPostTooOld(post, maxDays = 14) {
  const postAge = new Date() - new Date(post.createdAt);
  const daysOld = postAge / (1000 * 60 * 60 * 24);
  return daysOld > maxDays;
}

export async function shouldProcessProductHuntPost(post) {
  const normalizedPostId = `ph-${post.id}`;
  const contentHash = generateContentHash(post.name, post.description || post.tagline || '');
  const ingestionCheck = await checkIngestionExists('producthunt_ingestion', normalizedPostId, contentHash);
  
  if (ingestionCheck.exists) {
    return { shouldProcess: false };
  }
  
  if (isProductHuntPostTooOld(post)) {
    return { shouldProcess: false };
  }
  
  if (!shouldIncludeProductHuntPost(post.name, post.tagline, post.description)) {
    return { shouldProcess: false };
  }
  
  return {
    shouldProcess: true,
    normalized: normalizeProductHuntPost(post)
  };
}

export function normalizeGitHubPost(normalized) {
  return {
    postId: normalized.id,
    sourcePlatform: 'github',
    sourceContext: normalized.repoFullName,
    title: normalized.title,
    content: normalized.selftext,
    author: normalized.author,
    permalink: normalized.permalink,
    createdAt: new Date(normalized.created_utc * 1000)
  };
}

export async function shouldProcessGitHubPost(normalized, skills) {
  const contentHash = generateContentHash(normalized.title, normalized.selftext);
  const ingestionCheck = await checkIngestionExists('github_ingestion', normalized.id, contentHash);
  
  if (ingestionCheck.exists) {
    return { shouldProcess: false };
  }
  
  if (!shouldIncludeGitHubIssue(normalized.title, normalized.selftext, skills)) {
    return { shouldProcess: false };
  }
  
  return {
    shouldProcess: true,
    normalized: normalizeGitHubPost(normalized)
  };
}

