import { isForHirePost, matchesKeywords } from './common.js';

export function shouldIncludeRedditPost(title, content) {
  if (!title && !content) {
    return false;
  }
  
  if (isForHirePost(title) || (content && isForHirePost(content))) {
    return false;
  }
  
  const titleMatch = matchesKeywords(title);
  const bodyMatch = content ? matchesKeywords(content) : false;
  
  return titleMatch || bodyMatch;
}

