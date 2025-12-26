import { generateContentHash } from '../../db/ingestion.js';
import { shouldIncludeGitHubIssue, isNonTechIssue } from '../../filters/github.js';
import { checkIngestionExists, saveIngestionRecord } from '../../db/ingestion.js';
import { normalizeIssue } from './api.js';

export function groupIssuesByRepo(issues) {
  const repoGroups = {};
  for (const issue of issues) {
    const repoFullName = issue.repository_url ? issue.repository_url.split('/repos/')[1] : 'unknown';
    if (!repoGroups[repoFullName]) {
      repoGroups[repoFullName] = [];
    }
    repoGroups[repoFullName].push(issue);
  }
  return repoGroups;
}

export function selectBestIssuePerRepo(repoGroups) {
  const bestIssuesPerRepo = [];
  for (const [repo, issues] of Object.entries(repoGroups)) {
    issues.sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateB - dateA;
    });
    bestIssuesPerRepo.push(issues[0]);
  }
  return bestIssuesPerRepo;
}

export async function processGitHubIssue(issue, skills) {
  const normalized = normalizeIssue(issue);
  
  if (isNonTechIssue(normalized.title, normalized.selftext)) {
    const contentHash = generateContentHash(normalized.title, normalized.selftext);
    await saveIngestionRecord('github_ingestion', {
      postId: normalized.id,
      contentHash,
      keywordMatched: false,
      metadata: {
        repoFullName: normalized.repoFullName,
        author: normalized.author,
        title: normalized.title,
        rejectionReason: 'non_tech_issue'
      }
    });
    return { shouldProcess: false, reason: 'non_tech_issue' };
  }
  
  const contentHash = generateContentHash(normalized.title, normalized.selftext);
  const ingestionCheck = await checkIngestionExists('github_ingestion', normalized.id, contentHash);
  if (ingestionCheck.exists) {
    return { shouldProcess: false, reason: 'already_classified' };
  }
  
  if (!shouldIncludeGitHubIssue(normalized.title, normalized.selftext, skills.length > 0 ? skills : [])) {
    await saveIngestionRecord('github_ingestion', {
      postId: normalized.id,
      contentHash,
      keywordMatched: false,
      metadata: {
        repoFullName: normalized.repoFullName,
        author: normalized.author,
        title: normalized.title
      }
    });
    return { shouldProcess: false, reason: 'skill_filter' };
  }
  
  await saveIngestionRecord('github_ingestion', {
    postId: normalized.id,
    contentHash,
    keywordMatched: true,
    metadata: {
      repoFullName: normalized.repoFullName,
      author: normalized.author,
      title: normalized.title
    }
  });
  
  return {
    shouldProcess: true,
    normalized
  };
}

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function loadResumeSkills() {
  try {
    const resumePath = join(__dirname, '..', '..', 'resume.json');
    const resumeData = JSON.parse(readFileSync(resumePath, 'utf8'));
    
    const skills = [];
    if (resumeData.skills?.languages) {
      skills.push(...resumeData.skills.languages.map(s => s.toLowerCase()));
    }
    if (resumeData.skills?.frameworks_and_libraries) {
      skills.push(...resumeData.skills.frameworks_and_libraries.map(s => s.toLowerCase()));
    }
    if (resumeData.skills?.databases) {
      skills.push(...resumeData.skills.databases.map(s => s.toLowerCase()));
    }
    if (resumeData.skills?.other) {
      skills.push(...resumeData.skills.other.map(s => s.toLowerCase()));
    }
    
    return [...new Set(skills)];
  } catch (error) {
    throw new Error(`Failed to load resume.json: ${error.message}`);
  }
}

