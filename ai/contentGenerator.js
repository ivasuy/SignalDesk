import { REPLY_PROMPT, COVER_LETTER_PROMPT, RESUME_PROMPT } from './prompts.js';
import { groqRequest } from './api.js';
import { generateResumePDF } from '../pdf/resume-builder.js';
import { logAI, logError } from '../logs/index.js';
import { loadResumeData, truncateText } from './helpers.js';

function countWords(text) {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
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

export async function generateCoverLetter(title, content) {
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
    
    let coverLetter;
    let attempts = 0;
    const maxAttempts = 2;
    
    while (attempts < maxAttempts) {
      coverLetter = await groqRequest(
        [{ role: 'user', content: coverLetterPrompt }],
        { model: 'llama-3.3-70b-versatile', temperature: 0.7, max_tokens: 300 },
        'resume'
      );
      
      const wordCount = countWords(coverLetter);
      if (wordCount >= 100) {
        break;
      }
      
      attempts++;
      if (attempts < maxAttempts) {
        logAI(`[AI] Cover letter too short (${wordCount} words), regenerating...`);
      }
    }
    
    const finalWordCount = countWords(coverLetter);
    if (finalWordCount < 100) {
      logError(`Cover letter generation failed: only ${finalWordCount} words after ${maxAttempts} attempts`, {
        platform: 'ai',
        stage: 'cover_letter_generation',
        action: 'skip'
      });
      throw new Error(`Cover letter too short: ${finalWordCount} words (minimum 100 required)`);
    }
    
    return coverLetter;
  } catch (error) {
    logError(`Cover letter error: ${error.message}`, {
      platform: 'ai',
      stage: 'cover_letter_generation',
      action: 'fallback'
    });
    throw error;
  }
}

export async function generateResume(title, content, category) {
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
    
    const resumePrompt = RESUME_PROMPT
      .replace('{title}', truncatedTitle)
      .replace('{content}', truncatedContent)
      .replace('{category}', category)
      .replace('{resume}', truncateText(resumeSummary, 2000));
    
    const resumeJSON = await groqRequest(
      [{ role: 'user', content: resumePrompt }],
      { model: 'llama-3.3-70b-versatile', temperature: 0.5, max_tokens: 1500 },
      'resume'
    );
    
    let parsedResumeData;
    try {
      const jsonMatch = resumeJSON.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : resumeJSON;
      parsedResumeData = JSON.parse(jsonStr);
    } catch (parseError) {
      logError(`Failed to parse resume JSON: ${parseError.message}`, {
        platform: 'ai',
        stage: 'resume_parsing',
        action: 'continue'
      });
      throw new Error(`Failed to parse resume JSON: ${parseError.message}`);
    }
    
    const resumePDFPath = await generateResumePDF(resumeJSON);
    logAI(`Resume generated: ${category} → ${resumePDFPath}`);
    
    return resumePDFPath;
  } catch (error) {
    logError(`Resume error: ${error.message}`, {
      platform: 'ai',
      stage: 'resume_generation',
      action: 'fallback'
    });
    throw error;
  }
}

export async function generateCoverLetterAndResume(title, content, category) {
  try {
    const coverLetter = await generateCoverLetter(title, content);
    const resumePDFPath = await generateResume(title, content, category);
    
    const finalWordCount = countWords(coverLetter);
    logAI(`Resume+Cover: ${category} → ${resumePDFPath} (${finalWordCount} words)`);
    
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
