import { groqRequest } from './api.js';
import { loadResumeData, truncateText } from './helpers.js';
import { logError, logAI } from '../logs/index.js';
import { REDDIT_CAP_SELECTION_PROMPT } from './platforms/prompts/reddit.prompts.js';
import { GITHUB_CAP_SELECTION_PROMPT } from './platforms/prompts/github.prompts.js';

export async function selectTopOpportunitiesByCap(posts, platform, maxCount) {
  if (posts.length === 0 || maxCount === Infinity) {
    return posts;
  }
  
  if (posts.length <= maxCount) {
    return posts;
  }
  
  try {
    const resumeData = loadResumeData();
    const resumeSummary = JSON.stringify({
      profile: resumeData.profile,
      experience: resumeData.experience,
      projects: resumeData.projects,
      skills: resumeData.skills
    }, null, 2);
    
    const postsList = posts.map((post, idx) => {
      const title = post.title || '';
      const content = post.content || '';
      const score = post.opportunityScore || 0;
      return `${idx + 1}. [ID: ${post.postId}] Title: ${title.substring(0, 100)} | Score: ${score}`;
    }).join('\n');
    
    let promptTemplate;
    if (platform === 'reddit') {
      promptTemplate = REDDIT_CAP_SELECTION_PROMPT;
    } else if (platform === 'github') {
      promptTemplate = GITHUB_CAP_SELECTION_PROMPT;
    } else {
      return posts.slice(0, maxCount);
    }
    
    const prompt = promptTemplate
      .replace('{resume}', truncateText(resumeSummary, 1500))
      .replace('{posts}', postsList);
    
    const result = await groqRequest(
      [{ role: 'user', content: prompt }],
      { model: 'llama-3.1-8b-instant', temperature: 0, top_p: 0.9, max_tokens: 500 },
      'capSelection'
    );
    
    try {
      const cleanedResult = result.replace(/[\x00-\x1F\x7F]/g, '').trim();
      const firstBrace = cleanedResult.indexOf('{');
      const lastBrace = cleanedResult.lastIndexOf('}');
      
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        logError(`Platform cap selection parse error: no JSON found`, {
          platform: 'ai',
          stage: 'platform_cap_selection',
          action: 'fallback'
        });
        return posts.slice(0, maxCount);
      }
      
      const jsonStr = cleanedResult.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      
      if (!parsed.selectedPostIds || !Array.isArray(parsed.selectedPostIds)) {
        return posts.slice(0, maxCount);
      }
      
      const selectedMap = new Set(parsed.selectedPostIds);
      const selected = posts.filter(post => selectedMap.has(post.postId));
      
      if (selected.length === 0) {
        return posts.slice(0, maxCount);
      }
      
      return selected.slice(0, maxCount);
    } catch (error) {
      logError(`Platform cap selection parse error: ${error.message}`, {
        platform: 'ai',
        stage: 'platform_cap_selection',
        action: 'fallback'
      });
      return posts.slice(0, maxCount);
    }
  } catch (error) {
    logError(`Platform cap selection error: ${error.message}`, {
      platform: 'ai',
      stage: 'platform_cap_selection',
      action: 'fallback'
    });
    return posts.slice(0, maxCount);
  }
}

