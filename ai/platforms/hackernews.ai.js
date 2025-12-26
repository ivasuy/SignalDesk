import { skillFilterMatch } from '../skillFilter.js';
import { classifyOpportunity } from '../classify.js';
import { generateCoverLetterAndResume, generateReply } from '../contentGenerator.js';
import { logAI } from '../../logs/index.js';
import { getAICallCounts } from '../api.js';

// Note: Basic filtering (isForHirePost, keyword matching) already done in fetcher-helpers.js
// This only applies additional HackerNews-specific hard rules
export function applyHardRuleFilters(posts) {
  return posts.filter(post => {
    const title = (post.title || '').toLowerCase();
    const content = (post.content || '').toLowerCase();
    const text = `${title} ${content}`;
    
    // Additional HackerNews-specific rejections (beyond what filters/hackernews.js already checks)
    if (text.includes('discussion') && !text.includes('hiring') && !text.includes('looking for')) {
      return false;
    }
    
    return true;
  });
}

export async function processHackerNewsPosts(posts) {
  const stats = {
    keywordAccepted: 0,
    aiClassified: 0,
    capAccepted: 0,
    aiCalls: {
      skillFilter: 0,
      classification: 0,
      capSelection: 0,
      reply: 0,
      coverLetter: 0,
      resume: 0
    }
  };
  
  const initialCounts = getAICallCounts();
  
  const hardRuleFiltered = applyHardRuleFilters(posts);
  logAI(`[HACKERNEWS] After hard rules: ${hardRuleFiltered.length}`);
  
  if (hardRuleFiltered.length === 0) {
    return { posts: [], stats };
  }
  
  const skillFiltered = [];
  for (const post of hardRuleFiltered) {
    const fullText = `Title: ${post.title}\n\nContent: ${post.content}`;
    const keep = await skillFilterMatch(fullText, post.postId, 'hackernews');
    if (keep) {
      skillFiltered.push(post);
    }
  }
  
  const afterSkillFilter = getAICallCounts();
  stats.aiCalls.skillFilter = afterSkillFilter.skillFilter - initialCounts.skillFilter;
  stats.keywordAccepted = skillFiltered.length;
  logAI(`[HACKERNEWS] After skill filter: ${skillFiltered.length}`);
  
  if (skillFiltered.length === 0) {
    return { posts: [], stats };
  }
  
  for (const post of skillFiltered) {
    const fullText = `Title: ${post.title}\n\nContent: ${post.content}`;
    const classification = await classifyOpportunity(fullText, post.postId, 'hackernews', post.sourceContext || '');
    post.classification = classification;
    post.opportunityScore = classification.opportunityScore;
  }
  
  const afterClassification = getAICallCounts();
  stats.aiCalls.classification = afterClassification.classification - initialCounts.classification;
  const valid = skillFiltered.filter(p => p.classification?.valid && p.opportunityScore >= 50);
  stats.aiClassified = valid.length;
  logAI(`[HACKERNEWS] After classification: ${valid.length} valid`);
  
  if (valid.length === 0) {
    return { posts: [], stats };
  }
  
  // HackerNews has no cap, so all valid posts are cap accepted
  stats.capAccepted = valid.length;
  
  for (const post of valid) {
    const category = post.classification?.category || 'collab';
    
    if (category === 'job') {
      try {
        const { coverLetter, resume } = await generateCoverLetterAndResume(post.title, post.content, category);
        post.replyText = coverLetter;
        post.resumeJSON = resume;
        post.actionDecision = 'reply_plus_resume';
      } catch (error) {
        logAI(`[HACKERNEWS] Resume generation failed for ${post.postId}, skipping`);
        post.actionDecision = 'skip';
      }
    } else {
      try {
        post.replyText = await generateReply(post.title, post.content, category);
        post.actionDecision = 'reply_only';
      } catch (error) {
        logAI(`[HACKERNEWS] Reply generation failed for ${post.postId}, skipping`);
        post.actionDecision = 'skip';
      }
    }
  }
  
  const finalCounts = getAICallCounts();
  stats.aiCalls.reply = finalCounts.reply - initialCounts.reply;
  stats.aiCalls.coverLetter = finalCounts.coverLetter - initialCounts.coverLetter;
  stats.aiCalls.resume = finalCounts.resume - initialCounts.resume;
  
  return { posts: valid.filter(p => p.actionDecision !== 'skip'), stats };
}

