import { skillFilterMatch } from '../skillFilter.js';
import { classifyOpportunity } from '../classify.js';
import { selectTopOpportunitiesByCap } from '../selectByCap.js';
import { logAI } from '../../logs/index.js';
import { getAICallCounts } from '../api.js';

const PLATFORM_CAP = 5;

// Note: isNonTechIssue() already checked in integrations/github/helpers.js and filters/github.js
// No additional hard rule filtering needed for GitHub at this stage
export function applyHardRuleFilters(posts) {
  return posts;
}

export async function processGitHubPosts(posts) {
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
  logAI(`[GITHUB] After hard rules: ${hardRuleFiltered.length}`);
  
  if (hardRuleFiltered.length === 0) {
    return { posts: [], stats };
  }
  
  const skillFiltered = [];
  for (const post of hardRuleFiltered) {
    const fullText = `Title: ${post.title}\n\nContent: ${post.content}`;
    const keep = await skillFilterMatch(fullText, post.postId, 'github');
    if (keep) {
      skillFiltered.push(post);
    }
  }
  
  const afterSkillFilter = getAICallCounts();
  stats.aiCalls.skillFilter = afterSkillFilter.skillFilter - initialCounts.skillFilter;
  stats.keywordAccepted = skillFiltered.length;
  logAI(`[GITHUB] After skill filter: ${skillFiltered.length}`);
  
  if (skillFiltered.length === 0) {
    return { posts: [], stats };
  }
  
  for (const post of skillFiltered) {
    const fullText = `Title: ${post.title}\n\nContent: ${post.content}`;
    const classification = await classifyOpportunity(fullText, post.postId, 'github', post.sourceContext || '');
    
    if (classification.category === 'job') {
      classification.category = 'freelance';
      logAI(`[GITHUB] Category corrected: job → freelance (GitHub cannot be job category)`);
    }
    
    post.classification = classification;
    post.opportunityScore = classification.opportunityScore;
  }
  
  const afterClassification = getAICallCounts();
  stats.aiCalls.classification = afterClassification.classification - initialCounts.classification;
  const valid = skillFiltered.filter(p => p.classification?.valid && p.opportunityScore >= 50);
  stats.aiClassified = valid.length;
  logAI(`[GITHUB] After classification: ${valid.length} valid`);
  
  if (valid.length === 0) {
    return { posts: [], stats };
  }
  
  const selected = await selectTopOpportunitiesByCap(valid, 'github', PLATFORM_CAP);
  const afterCapSelection = getAICallCounts();
  stats.aiCalls.capSelection = afterCapSelection.capSelection - initialCounts.capSelection;
  stats.capAccepted = selected.length;
  logAI(`[GITHUB] After cap selection: ${selected.length}`);
  
  for (const post of selected) {
    post.actionDecision = 'listing_only';
    post.replyText = '';
    post.resumeJSON = null;
  }
  
  return { posts: selected, stats };
}

