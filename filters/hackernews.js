import { isForHirePost, matchesKeywords } from './common.js';
import { HACKERNEWS_TARGET_PATTERNS } from '../utils/constants.js';

export function matchesHiringTitle(title) {
  if (!title) return false;
  
  const titleLower = title.toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim();
  
  return HACKERNEWS_TARGET_PATTERNS.some(pattern => titleLower.includes(pattern));
}

export function shouldIncludeHackerNewsPost(title, content, requireTechKeyword = false) {
  if (!title && !content) {
    return false;
  }
  
  if (isForHirePost(title) || (content && isForHirePost(content))) {
    return false;
  }
  
  const titleMatch = matchesKeywords(title, requireTechKeyword);
  const bodyMatch = content ? matchesKeywords(content, requireTechKeyword) : false;
  
  return titleMatch || bodyMatch;
}

