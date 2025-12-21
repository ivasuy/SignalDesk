import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CLASSIFICATION_PROMPT, HIGH_VALUE_PROMPT, REPLY_PROMPT, COVER_LETTER_PROMPT, RESUME_PROMPT, BUILDABLE_IDEA_PROMPT, COLLAB_OPPORTUNITY_PROMPT } from './prompts.js';
import { openaiRequest } from './api.js';
import { generateResumePDF } from '../pdf/resume-builder.js';

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

export async function classifyOpportunity(postText, postId = null) {
  const resumeData = loadResumeData();
  const truncatedText = truncateText(postText, 1000);
  
  const resumeSummary = JSON.stringify({
    profile: resumeData.profile,
    experience: resumeData.experience,
    projects: resumeData.projects,
    skills: resumeData.skills
  }, null, 2);
  
  const prompt = CLASSIFICATION_PROMPT
    .replace('{resume}', truncateText(resumeSummary, 1500)) + '\n\n' + truncatedText;
  
  const result = await openaiRequest(
    [{ role: 'user', content: prompt }],
    { model: 'gpt-3.5-turbo', temperature: 0.1, max_tokens: 200 }
  );
  
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : result;
    const parsed = JSON.parse(jsonStr);
    
    const categoryMap = {
      'HIRING': 'job',
      'FREELANCE': 'freelance',
      'COLLABORATION': 'collab',
      'COLLAB': 'collab',
      'IDEAS': 'build',
      'BUILD': 'build'
    };
    
    const normalizedCategory = parsed.category 
      ? (categoryMap[parsed.category.toUpperCase()] || parsed.category.toLowerCase())
      : null;
    
    const score = parsed.opportunityScore || (parsed.valid ? 50 : 0);
    
    return {
      valid: parsed.valid === true && score >= 50,
      category: normalizedCategory,
      opportunityScore: Math.max(0, Math.min(100, score)),
      reasoning: parsed.reasoning || ''
    };
  } catch (error) {
    const upperResult = result.toUpperCase();
    if (upperResult.startsWith('YES:')) {
      const category = upperResult.split(':')[1]?.trim() || 'OPPORTUNITY';
      const categoryMap = {
        'HIRING': 'job',
        'FREELANCE': 'freelance',
        'COLLABORATION': 'collab',
        'COLLAB': 'collab',
        'IDEAS': 'build',
        'BUILD': 'build'
      };
      return {
        valid: true,
        category: categoryMap[category.toUpperCase()] || category.toLowerCase(),
        opportunityScore: 60,
        reasoning: 'Legacy format fallback'
      };
    }
    
    return { valid: false, category: null, opportunityScore: 0, reasoning: 'Invalid response' };
  }
}

export async function evaluateHighValue(postText, category) {
  if (!['HIRING', 'FREELANCE', 'COLLABORATION'].includes(category)) {
    return false;
  }
  
  const truncatedText = truncateText(postText, 1200);
  
  const result = await openaiRequest(
    [{ role: 'user', content: HIGH_VALUE_PROMPT + '\n\n' + truncatedText }],
    { model: 'gpt-3.5-turbo', temperature: 0.1, max_tokens: 10 }
  );
  
  return result.toUpperCase() === 'YES';
}

export async function generateReply(title, content, category, persona = 'engineer', tone = 'professional') {
  const resumeData = loadResumeData();
  const truncatedContent = truncateText(content, 500);
  
  const resumeSummary = JSON.stringify({
    profile: resumeData.profile,
    experience: resumeData.experience,
    projects: resumeData.projects,
    skills: resumeData.skills
  }, null, 2);
  
  let personaContext = '';
  if (persona === 'builder') {
    personaContext = 'Emphasize building and creating products.';
  } else if (persona === 'collaborator') {
    personaContext = 'Emphasize collaboration and partnership.';
  }
  
  let toneContext = '';
  if (tone === 'concise') {
    toneContext = 'Keep it very brief and direct.';
  } else if (tone === 'technical') {
    toneContext = 'Use technical language and specifics.';
  } else if (tone === 'casual') {
    toneContext = 'Use a friendly, casual tone.';
  }
  
  const prompt = REPLY_PROMPT
    .replace('{title}', truncateText(title, 200))
    .replace('{content}', truncatedContent)
    .replace('{category}', category || 'OPPORTUNITY')
    .replace('{resume}', truncateText(resumeSummary, 1000)) +
    (personaContext ? `\n\nPersona: ${personaContext}` : '') +
    (toneContext ? `\n\nTone: ${toneContext}` : '');
  
  return await openaiRequest(
    [{ role: 'user', content: prompt }],
    { model: 'gpt-3.5-turbo', temperature: 0.7, max_tokens: 120 }
  );
}

export async function generateCoverLetterAndResume(title, content, category) {
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
    .replace('{category}', category)
    .replace('{resume}', truncateText(resumeSummary, 2000));
  
  const resumePrompt = RESUME_PROMPT
    .replace('{title}', truncatedTitle)
    .replace('{content}', truncatedContent)
    .replace('{category}', category)
    .replace('{resume}', truncateText(resumeSummary, 2000));
  
  const [coverLetter, resumeJSON] = await Promise.all([
    openaiRequest(
      [{ role: 'user', content: coverLetterPrompt }],
      { model: 'gpt-4o', temperature: 0.7, max_tokens: 800 }
    ),
    openaiRequest(
      [{ role: 'user', content: resumePrompt }],
      { model: 'gpt-4o', temperature: 0.5, max_tokens: 1500 }
    )
  ]);
  
  const resumePDFPath = await generateResumePDF(resumeJSON);
  
  return { coverLetter, resume: resumePDFPath };
}

export async function evaluateBuildableIdea(evaluationData) {
  const resumeData = loadResumeData();
  
  const resumeSummary = JSON.stringify({
    profile: resumeData.profile,
    experience: resumeData.experience,
    projects: resumeData.projects,
    skills: resumeData.skills
  }, null, 2);
  
  const prompt = BUILDABLE_IDEA_PROMPT
    .replace('{resume}', truncateText(resumeSummary, 2000))
    .replace('{name}', evaluationData.name || '')
    .replace('{tagline}', evaluationData.tagline || '')
    .replace('{description}', truncateText(evaluationData.description || '', 500))
    .replace('{topics}', (evaluationData.topics || []).join(', '))
    .replace('{votesCount}', evaluationData.votesCount || 0);
  
  const result = await openaiRequest(
    [{ role: 'user', content: prompt }],
    { model: 'gpt-4o', temperature: 0.3, max_tokens: 500 }
  );
  
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(result);
  } catch (error) {
    return {
      buildable_in_2_days: false,
      complexity: 'high',
      why: 'Failed to parse AI response',
      suggested_mvp_scope: '',
      recommended_tech_stack: [],
      go_to_market_strategy: [],
      confidence_score: 0
    };
  }
}

export async function evaluateCollabOpportunity(evaluationData) {
  const resumeData = loadResumeData();
  
  const resumeSummary = JSON.stringify({
    profile: resumeData.profile,
    experience: resumeData.experience,
    projects: resumeData.projects,
    skills: resumeData.skills
  }, null, 2);
  
  const prompt = COLLAB_OPPORTUNITY_PROMPT
    .replace('{resume}', truncateText(resumeSummary, 2000))
    .replace('{name}', evaluationData.name || '')
    .replace('{tagline}', evaluationData.tagline || '')
    .replace('{description}', truncateText(evaluationData.description || '', 500))
    .replace('{topics}', (evaluationData.topics || []).join(', '))
    .replace('{votesCount}', evaluationData.votesCount || 0);
  
  const result = await openaiRequest(
    [{ role: 'user', content: prompt }],
    { model: 'gpt-4o', temperature: 0.3, max_tokens: 300 }
  );
  
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(result);
  } catch (error) {
    return {
      collaboration_fit: false,
      collaboration_type: 'technical partner',
      why_you_are_a_fit: 'Failed to parse AI response',
      suggested_outreach: '',
      confidence_score: 0
    };
  }
}

