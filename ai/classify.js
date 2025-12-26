import { groqRequest } from './api.js';
import { loadResumeData, truncateText, parseTitleAndContent } from './helpers.js';
import { logError, logAI } from '../logs/index.js';
import { REDDIT_CLASSIFICATION_PROMPT } from './platforms/prompts/reddit.prompts.js';
import { GITHUB_CLASSIFICATION_PROMPT } from './platforms/prompts/github.prompts.js';
import { HACKERNEWS_CLASSIFICATION_PROMPT } from './platforms/prompts/hackernews.prompts.js';
import { PRODUCTHUNT_CLASSIFICATION_PROMPT } from './platforms/prompts/producthunt.prompts.js';

function getClassificationPrompt(platform) {
  switch (platform) {
    case 'reddit':
      return REDDIT_CLASSIFICATION_PROMPT;
    case 'github':
      return GITHUB_CLASSIFICATION_PROMPT;
    case 'hackernews':
      return HACKERNEWS_CLASSIFICATION_PROMPT;
    case 'producthunt':
      return PRODUCTHUNT_CLASSIFICATION_PROMPT;
    default:
      return REDDIT_CLASSIFICATION_PROMPT;
  }
}

export async function classifyOpportunity(postText, postId = null, platform = 'reddit', context = '') {
  try {
    const resumeData = loadResumeData();
    const truncatedText = truncateText(postText, 1000);
    
    const resumeSummary = JSON.stringify({
      profile: resumeData.profile,
      experience: resumeData.experience,
      projects: resumeData.projects,
      skills: resumeData.skills
    }, null, 2);
    
    const { title, content } = parseTitleAndContent(truncatedText);
    
    const promptTemplate = getClassificationPrompt(platform);
    let prompt = promptTemplate
      .replace('{resume}', truncateText(resumeSummary, 1500))
      .replace('{platform}', platform)
      .replace('{context}', context || 'N/A')
      .replace('{title}', title)
      .replace('{content}', content);
    
    if (platform === 'producthunt') {
      prompt = prompt.replace('{tagline}', '');
    }
    
    const result = await groqRequest(
      [{ role: 'user', content: prompt }],
      { model: 'llama-3.1-8b-instant', temperature: 0, top_p: 0.9, max_tokens: 200 },
      'classification'
    );
    
    try {
      const cleanedResult = result.replace(/[\x00-\x1F\x7F]/g, '').trim();
      
      let jsonStr = cleanedResult;
      const firstBrace = cleanedResult.indexOf('{');
      const lastBrace = cleanedResult.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = cleanedResult.substring(firstBrace, lastBrace + 1);
      }
      
      const parsed = JSON.parse(jsonStr);
      
      const categoryMap = {
        'HIRING': 'job',
        'FREELANCE': 'freelance',
        'COLLABORATION': 'collab',
        'COLLAB': 'collab',
      };
      
      let normalizedCategory = parsed.category 
        ? (categoryMap[parsed.category.toUpperCase()] || parsed.category.toLowerCase())
        : null;
      
      if (platform === 'github' && normalizedCategory === 'job') {
        normalizedCategory = 'freelance';
        logAI(`[AI] GitHub category corrected: job → freelance (GitHub cannot be job category)`);
      }
      
      const score = parsed.opportunityScore || (parsed.valid ? 50 : 0);
      const finalScore = Math.max(0, Math.min(100, score));
      const isValid = parsed.valid === true && finalScore >= 50;
      
      return {
        valid: isValid,
        category: normalizedCategory,
        opportunityScore: finalScore,
        reasoning: parsed.reasoning || ''
      };
    } catch (error) {
      logError(`Parse error: ${error.message}`, {
        platform: 'ai',
        stage: 'classification_parsing',
        postId: postId || 'unknown',
        action: 'skip'
      });
      logAI(`[AI] Raw response (first 200 chars): ${result.substring(0, 200)}`);
      
      return { valid: false, category: null, opportunityScore: 0, reasoning: 'Invalid JSON response' };
    }
  } catch (error) {
    const isNetworkError = error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout');
    const isRateLimit = error.message.includes('429') || error.message.includes('rate limit');
    
    if (isNetworkError || isRateLimit) {
      logError(`Classification error: ${error.message}`, {
        platform: 'ai',
        stage: 'classification',
        postId: postId || 'unknown',
        action: 'retry'
      });
      throw error;
    }
    
    logError(`Classification error: ${error.message}`, {
      platform: 'ai',
      stage: 'classification',
      postId: postId || 'unknown',
      action: 'skip'
    });
    return { valid: false, category: null, opportunityScore: 0, reasoning: `Error: ${error.message}` };
  }
}

