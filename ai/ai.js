import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CLASSIFICATION_PROMPT, HIGH_VALUE_PROMPT, REPLY_PROMPT, COVER_LETTER_PROMPT, RESUME_PROMPT} from './prompts.js';
import { groqRequest } from './api.js';
import { generateResumePDF } from '../pdf/resume-builder.js';
import { logAI, logError } from '../logs/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function truncateText(text, maxLength = 1000) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function loadResumeData() {
  try {
    const resumePath = join(__dirname, '..', 'resume.json');
    const resumeData = readFileSync(resumePath, 'utf8');
    return JSON.parse(resumeData);
  } catch (error) {
    throw new Error(`Failed to load resume.json: ${error.message}`);
  }
}

export async function classifyOpportunity(postText, postId = null, platform = 'unknown', context = '') {
  try {
    const resumeData = loadResumeData();
    const truncatedText = truncateText(postText, 1000);
    
    const resumeSummary = JSON.stringify({
      profile: resumeData.profile,
      experience: resumeData.experience,
      projects: resumeData.projects,
      skills: resumeData.skills
    }, null, 2);
    
    const titleMatch = truncatedText.match(/^Title:\s*(.+?)(?:\n|$)/i);
    const contentMatch = truncatedText.match(/(?:Content:|$)([\s\S]*)/i);
    const title = titleMatch ? titleMatch[1].trim() : truncatedText.split('\n')[0].substring(0, 200);
    const content = contentMatch ? contentMatch[1].trim() : truncatedText.substring(title.length).trim();
    
    const prompt = CLASSIFICATION_PROMPT
      .replace('{resume}', truncateText(resumeSummary, 1500))
      .replace('{platform}', platform)
      .replace('{context}', context || 'N/A')
      .replace('{title}', title)
      .replace('{content}', content);
    
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
      
      const normalizedCategory = parsed.category 
        ? (categoryMap[parsed.category.toUpperCase()] || parsed.category.toLowerCase())
        : null;
      
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

export async function evaluateHighValue(postText, category) {
  const categoryUpper = category?.toUpperCase() || '';
  if (!['HIRING', 'FREELANCE', 'COLLABORATION', 'JOB', 'COLLAB'].includes(categoryUpper)) {
    return false;
  }
  
  try {
    const titleMatch = postText.match(/^Title:\s*(.+?)(?:\n|$)/i);
    const contentMatch = postText.match(/(?:Content:|$)([\s\S]*)/i);
    const title = titleMatch ? titleMatch[1].trim() : postText.split('\n')[0].substring(0, 200);
    const content = contentMatch ? contentMatch[1].trim() : postText.substring(title.length).trim();
    
    const prompt = HIGH_VALUE_PROMPT
      .replace('{title}', truncateText(title, 200))
      .replace('{content}', truncateText(content, 1000));
    
    const result = await groqRequest(
      [{ role: 'user', content: prompt }],
      { model: 'llama-3.1-8b-instant', temperature: 0, top_p: 0.9, max_tokens: 10 },
      'classification'
    );
    
    return result.toUpperCase().trim() === 'YES';
  } catch (error) {
    logError(`High value error: ${error.message}`, {
      platform: 'ai',
      stage: 'high_value_evaluation',
      action: 'skip'
    });
    return false;
  }
}

export async function generateReply(title, content, category, persona = 'engineer', tone = 'professional') {
  try {
    const resumeData = loadResumeData();
    const truncatedContent = truncateText(content, 500);
    
    const resumeSummary = JSON.stringify({
      profile: resumeData.profile,
      experience: resumeData.experience,
      projects: resumeData.projects,
      skills: resumeData.skills
    }, null, 2);
    
    const prompt = REPLY_PROMPT
      .replace('{resume}', truncateText(resumeSummary, 1000))
      .replace('{title}', truncateText(title, 200))
      .replace('{category}', category || 'OPPORTUNITY');
    
    const result = await groqRequest(
      [{ role: 'user', content: prompt }],
      { model: 'llama-3.3-70b-versatile', temperature: 0.7, max_tokens: 120 },
      'reply'
    );
    
    return result;
  } catch (error) {
    logError(`Reply error: ${error.message}`, {
      platform: 'ai',
      stage: 'reply_generation',
      action: 'retry'
    });
    throw error;
  }
}

export async function generateCoverLetterAndResume(title, content, category) {
  try {
    const resumeData = loadResumeData();
    const truncatedContent = truncateText(content, 1500);
    const truncatedTitle = truncateText(title, 200);
    
    const resumeSummary = JSON.stringify({
      profile: resumeData.profile,
      experience: resumeData.experience,
      projects: resumeData.projects,
      skills: resumeData.skills
    }, null, 2);
    
    const coverLetterPrompt = COVER_LETTER_PROMPT
      .replace('{title}', truncatedTitle)
      .replace('{content}', truncatedContent)
      .replace('{resume}', truncateText(resumeSummary, 1500));
    
    const resumePrompt = RESUME_PROMPT
      .replace('{title}', truncatedTitle)
      .replace('{content}', truncatedContent)
      .replace('{category}', category)
      .replace('{resume}', truncateText(resumeSummary, 2000));
    
    const [coverLetter, resumeJSON] = await Promise.all([
      groqRequest(
        [{ role: 'user', content: coverLetterPrompt }],
        { model: 'llama-3.1-70b-versatile', temperature: 0.7, max_tokens: 800 },
        'resume'
      ),
      groqRequest(
        [{ role: 'user', content: resumePrompt }],
        { model: 'llama-3.1-70b-versatile', temperature: 0.5, max_tokens: 1500 },
        'resume'
      )
    ]);
    
    const resumePDFPath = await generateResumePDF(resumeJSON);
    logAI(`Resume+Cover: ${category} → ${resumePDFPath}`);
    
    return { coverLetter, resume: resumePDFPath };
  } catch (error) {
    logError(`Resume+Cover error: ${error.message}`, {
      platform: 'ai',
      stage: 'resume_generation',
      action: 'fallback'
    });
    throw error;
  }
}


