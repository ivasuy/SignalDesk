import { checkProcessedToday } from './db-helpers.js';
import { logAI } from '../../logs/index.js';

// ============================================================================
// FILTERING HELPERS
// ============================================================================

export function filterValidPosts(posts) {
  return posts.filter(post => {
    const title = (post.title || '').toLowerCase();
    const content = (post.content || '').toLowerCase();
    return title.length > 0 || content.length > 0;
  });
}

// ============================================================================
// PROCESSING HELPERS
// ============================================================================

export async function filterNotProcessedToday(posts) {
  const notProcessed = [];
  
  for (const post of posts) {
    if (!(await checkProcessedToday(post.postId))) {
      notProcessed.push(post);
    }
  }
  
  return notProcessed;
}

