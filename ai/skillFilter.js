import { groqRequest } from './api.js';
import { loadResumeData, truncateText, parseTitleAndContent } from './helpers.js';
import { logError } from '../logs/index.js';
import { REDDIT_SKILL_FILTER_PROMPT } from './platforms/prompts/reddit.prompts.js';
import { GITHUB_SKILL_FILTER_PROMPT } from './platforms/prompts/github.prompts.js';
import { HACKERNEWS_SKILL_FILTER_PROMPT } from './platforms/prompts/hackernews.prompts.js';
import { PRODUCTHUNT_SKILL_FILTER_PROMPT } from './platforms/prompts/producthunt.prompts.js';

function getSkillFilterPrompt(platform) {
  switch (platform) {
    case 'reddit':
      return REDDIT_SKILL_FILTER_PROMPT;
    case 'github':
      return GITHUB_SKILL_FILTER_PROMPT;
    case 'hackernews':
      return HACKERNEWS_SKILL_FILTER_PROMPT;
    case 'producthunt':
      return PRODUCTHUNT_SKILL_FILTER_PROMPT;
    default:
      return REDDIT_SKILL_FILTER_PROMPT;
  }
}

export async function skillFilterMatch(postText, postId = null, platform = 'reddit') {
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
    
    const promptTemplate = getSkillFilterPrompt(platform);
    let prompt = promptTemplate
      .replace('{resume}', truncateText(resumeSummary, 1500))
      .replace('{title}', title)
      .replace('{content}', content);
    
    if (platform === 'producthunt') {
      prompt = prompt.replace('{tagline}', '');
    }
    
    const result = await groqRequest(
      [{ role: 'user', content: prompt }],
      { model: 'llama-3.1-8b-instant', temperature: 0, top_p: 0.9, max_tokens: 50 },
      'skillFilter'
    );
    
    try {
      const cleanedResult = result.replace(/[\x00-\x1F\x7F]/g, '').trim();
      const firstBrace = cleanedResult.indexOf('{');
      const lastBrace = cleanedResult.lastIndexOf('}');
      
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return false;
      }
      
      const jsonStr = cleanedResult.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      
      return parsed.keep === true;
    } catch (error) {
      logError(`Skill filter parse error: ${error.message}`, {
        platform: 'ai',
        stage: 'skill_filter_parsing',
        postId: postId || 'unknown',
        action: 'skip'
      });
      return false;
    }
  } catch (error) {
    logError(`Skill filter error: ${error.message}`, {
      platform: 'ai',
      stage: 'skill_filter',
      postId: postId || 'unknown',
      action: 'skip'
    });
    return false;
  }
}

