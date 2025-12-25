import { GITHUB_SKILL_KEYWORDS } from '../utils/constants.js';

export function matchesSkillFilter(title, body, skills = []) {
  const text = `${title} ${body}`.toLowerCase();
  const skillKeywords = skills.length > 0 ? skills : GITHUB_SKILL_KEYWORDS;
  return skillKeywords.some(keyword => text.includes(keyword));
}

export function isNonTechIssue(title, content) {
  const combined = `${title} ${content}`.toLowerCase();
  
  const nonTechKeywords = [
    'docs',
    'documentation',
    'readme',
    'typo',
    'spelling',
    'rename',
    'naming',
    'formatting',
    'comments',
    'compliance',
    'license',
    'policy',
    'todo-only',
    'checklist-only'
  ];
  
  for (const keyword of nonTechKeywords) {
    if (combined.includes(keyword)) {
      return true;
    }
  }
  
  const todoOnlyPattern = /^[\s-]*\[?\s*(todo|fixme|hack|xxx)\s*\]?[\s-]*$/i;
  const checklistOnlyPattern = /^[\s-]*\[?\s*[x\s]+\]?\s*$/i;
  
  const titleTrimmed = title.trim();
  if (todoOnlyPattern.test(titleTrimmed) || checklistOnlyPattern.test(titleTrimmed)) {
    return true;
  }
  
  return false;
}

export function buildGitHubSearchQueries(dateStr) {
  return [
    `is:issue is:open label:"good first issue" created:>=${dateStr}`,
    `is:issue is:open "need help" created:>=${dateStr}`,
    `is:issue is:open "seeking developer" created:>=${dateStr}`
  ];
}

export function shouldIncludeGitHubIssue(title, body, skills = []) {
  if (!title) {
    return false;
  }
  
  if (isNonTechIssue(title, body || '')) {
    return false;
  }
  
  if (!matchesSkillFilter(title, body || '', skills)) {
    return false;
  }
  
  return true;
}

