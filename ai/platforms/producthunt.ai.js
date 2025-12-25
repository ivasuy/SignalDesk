import { skillFilterMatch } from '../skillFilter.js';
import { classifyOpportunity } from '../classify.js';
import { generateReply } from '../contentGenerator.js';
import { logAI } from '../../logs/index.js';

// Note: shouldExcludeProductHunt() already checked in filters/producthunt.js
// This only applies additional ProductHunt-specific hard rules
export function applyHardRuleFilters(posts) {
  return posts.filter(post => {
    const title = (post.title || '').toLowerCase();
    const content = (post.content || '').toLowerCase();
    const text = `${title} ${content}`;
    
    // Additional ProductHunt-specific rejections (beyond what filters/producthunt.js already checks)
    if (text.includes('marketing') && !text.includes('developer') && !text.includes('engineer')) {
      return false;
    }
    
    return true;
  });
}

export async function processProductHuntPosts(posts) {
  const stats = {
    keywordAccepted: 0,
    aiClassified: 0,
    capAccepted: 0
  };
  
  const hardRuleFiltered = applyHardRuleFilters(posts);
  logAI(`[PRODUCTHUNT] After hard rules: ${hardRuleFiltered.length}`);
  
  if (hardRuleFiltered.length === 0) {
    return { posts: [], stats };
  }
  
  const skillFiltered = [];
  for (const post of hardRuleFiltered) {
    const fullText = `Title: ${post.title}\n\nContent: ${post.content}`;
    const keep = await skillFilterMatch(fullText, post.postId, 'producthunt');
    if (keep) {
      skillFiltered.push(post);
    }
  }
  
  stats.keywordAccepted = skillFiltered.length;
  logAI(`[PRODUCTHUNT] After skill filter: ${skillFiltered.length}`);
  
  if (skillFiltered.length === 0) {
    return { posts: [], stats };
  }
  
  for (const post of skillFiltered) {
    const fullText = `Title: ${post.title}\n\nContent: ${post.content}`;
    const classification = await classifyOpportunity(fullText, post.postId, 'producthunt', post.sourceContext || '');
    post.classification = classification;
    post.opportunityScore = classification.opportunityScore;
  }
  
  const valid = skillFiltered.filter(p => p.classification?.valid && p.opportunityScore >= 50);
  stats.aiClassified = valid.length;
  logAI(`[PRODUCTHUNT] After classification: ${valid.length} valid`);
  
  if (valid.length === 0) {
    return { posts: [], stats };
  }
  
  // ProductHunt has no cap, so all valid posts are cap accepted
  stats.capAccepted = valid.length;
  
  for (const post of valid) {
    const category = post.classification?.category || 'collab';
    
    try {
      post.replyText = await generateReply(post.title, post.content, category);
      post.actionDecision = 'reply_only';
      post.resumeJSON = null;
    } catch (error) {
      logAI(`[PRODUCTHUNT] Reply generation failed for ${post.postId}, skipping`);
      post.actionDecision = 'skip';
    }
  }
  
  return { posts: valid.filter(p => p.actionDecision !== 'skip'), stats };
}

