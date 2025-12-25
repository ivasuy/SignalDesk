import dotenv from 'dotenv';

dotenv.config();

const GITHUB_API_URL = 'https://api.github.com';
const API_TOKEN = process.env.GITHUB_TOKEN;

export async function githubRequest(endpoint, options = {}) {
  if (!API_TOKEN) {
    throw new Error('GITHUB_TOKEN not set in .env');
  }

  const url = `${GITHUB_API_URL}${endpoint}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${API_TOKEN}`,
    'User-Agent': 'GitHub-Opportunity-Bot/1.0',
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function searchIssues(query, sort = 'created', order = 'desc', perPage = 100) {
  const encodedQuery = encodeURIComponent(query);
  const endpoint = `/search/issues?q=${encodedQuery}&sort=${sort}&order=${order}&per_page=${perPage}`;
  
  return githubRequest(endpoint);
}

export function normalizeIssue(issue) {
  const repoFullName = issue.repository_url ? issue.repository_url.split('/repos/')[1] : 'unknown';
  return {
    id: `github-${issue.id}`,
    title: issue.title,
    selftext: issue.body || '',
    permalink: issue.html_url,
    created_utc: Math.floor(new Date(issue.created_at).getTime() / 1000),
    author: issue.user?.login || 'unknown',
    source: 'github',
    repoFullName: repoFullName
  };
}

