import { skillFilterMatch } from '../skillFilter.js';
import { classifyOpportunity } from '../classify.js';
import { selectTopOpportunitiesByCap } from '../selectByCap.js';
import { generateCoverLetterAndResume, generateReply } from '../contentGenerator.js';
import { logAI } from '../../logs/index.js';

const PLATFORM_CAP = 10;

// Note: Basic filtering (isForHirePost, keyword matching) already done in fetcher-helpers.js
// This only applies additional Reddit-specific hard rules
export function applyHardRuleFilters(posts) {
  return posts.filter(post => {
    const title = (post.title || '').toLowerCase();
    const content = (post.content || '').toLowerCase();
    const text = `${title} ${content}`;
    
    // Additional Reddit-specific rejections (beyond what filters/reddit.js already checks)
    if (text.includes('advice') || text.includes('should i') || text.includes('what should')) return false;
    if (text.includes('salary') && (text.includes('?') || text.includes('ask'))) return false;
    if (text.includes('validation') || text.includes('opinion')) return false;
    if (text.includes('discussion') && !text.includes('hiring') && !text.includes('looking for')) return false;
    
    return true;
  });
}

export async function processRedditPosts(posts) {
  const stats = {
    keywordAccepted: 0,
    aiClassified: 0,
    capAccepted: 0
  };
  
  const hardRuleFiltered = applyHardRuleFilters(posts);
  logAI(`[REDDIT] After hard rules: ${hardRuleFiltered.length}`);
  
  if (hardRuleFiltered.length === 0) {
    return { posts: [], stats };
  }
  
  const skillFiltered = [];
  for (const post of hardRuleFiltered) {
    const fullText = `Title: ${post.title}\n\nContent: ${post.content}`;
    const keep = await skillFilterMatch(fullText, post.postId, 'reddit');
    if (keep) {
      skillFiltered.push(post);
    }
  }
  
  stats.keywordAccepted = skillFiltered.length;
  logAI(`[REDDIT] After skill filter: ${skillFiltered.length}`);
  
  if (skillFiltered.length === 0) {
    return { posts: [], stats };
  }
  
  for (const post of skillFiltered) {
    const fullText = `Title: ${post.title}\n\nContent: ${post.content}`;
    const classification = await classifyOpportunity(fullText, post.postId, 'reddit', post.sourceContext || '');
    post.classification = classification;
    post.opportunityScore = classification.opportunityScore;
  }
  
  const valid = skillFiltered.filter(p => p.classification?.valid && p.opportunityScore >= 50);
  stats.aiClassified = valid.length;
  logAI(`[REDDIT] After classification: ${valid.length} valid`);
  
  if (valid.length === 0) {
    return { posts: [], stats };
  }
  
  const selected = await selectTopOpportunitiesByCap(valid, 'reddit', PLATFORM_CAP);
  stats.capAccepted = selected.length;
  logAI(`[REDDIT] After cap selection: ${selected.length}`);
  
  for (const post of selected) {
    const category = post.classification?.category || 'collab';
    
    if (category === 'job') {
      try {
        const { coverLetter, resume } = await generateCoverLetterAndResume(post.title, post.content, category);
        post.replyText = coverLetter;
        post.resumeJSON = resume;
        post.actionDecision = 'reply_plus_resume';
      } catch (error) {
        logAI(`[REDDIT] Resume generation failed for ${post.postId}, skipping`);
        post.actionDecision = 'skip';
      }
    } else {
      try {
        post.replyText = await generateReply(post.title, post.content, category);
        post.actionDecision = 'reply_only';
      } catch (error) {
        logAI(`[REDDIT] Reply generation failed for ${post.postId}, skipping`);
        post.actionDecision = 'skip';
      }
    }
  }
  
  return { posts: selected.filter(p => p.actionDecision !== 'skip'), stats };
}

