import { fetchNewPosts } from '../integrations/reddit/api.js';
import { SUBREDDITS } from '../utils/constants.js';
import { getJobStories, normalizeJob, findLatestHiringPost, getTopLevelComments } from '../integrations/hackernews/api.js';
import { cleanHTML, cleanTitle } from '../utils/html-cleaner.js';
import { searchIssues, normalizeIssue } from '../integrations/github/api.js';
import { buildGitHubSearchQueries, matchesSkillFilter, isNonTechIssue } from '../filters/github.js';
import { fetchProductHuntPosts as fetchPHPosts } from '../integrations/producthunt/api.js';
import { 
  loadResumeSkills,
  shouldProcessRedditPost,
  shouldProcessHackerNewsPost,
  shouldProcessProductHuntPost,
  shouldProcessGitHubPost
} from './helpers/fetcher-helpers.js';
import { normalizeHackerNewsComment } from '../integrations/hackernews/helpers.js';
import { logError, logInfo } from '../logs/index.js';

export async function fetchRedditPosts() {
  const posts = [];
  
  for (const subreddit of SUBREDDITS) {
    try {
      const fetchedPosts = await fetchNewPosts(subreddit);
      
      for (const post of fetchedPosts) {
        try {
          const result = await shouldProcessRedditPost(post, subreddit);
          if (result.shouldProcess) {
            posts.push(result.normalized);
          }
        } catch (error) {
          logError(`Error processing Reddit post ${post.id}: ${error.message}`, { platform: 'reddit', stage: 'fetch', subreddit });
        }
      }
    } catch (error) {
      logError(`Error fetching Reddit subreddit ${subreddit}: ${error.message}`, { platform: 'reddit', stage: 'fetch', subreddit });
      continue;
    }
  }
  
  logInfo(`[REDDIT] Fetched ${posts.length} posts from ${SUBREDDITS.length} subreddits`);
  return posts;
}

export async function fetchHackerNewsPosts() {
  const posts = [];
  
  try {
    // Fetch Jobs
    const jobStories = await getJobStories();
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
    const recentJobs = jobStories.filter(job => job.time >= oneDayAgo);
    
    for (const job of recentJobs) {
      try {
        const normalized = normalizeJob(job, cleanTitle, cleanHTML);
        const result = await shouldProcessHackerNewsPost(normalized);
        
        if (result.shouldProcess) {
          posts.push(result.normalized);
        }
      } catch (error) {
        logError(`Error processing HN job ${job.id}: ${error.message}`, { platform: 'hackernews', stage: 'fetch_jobs' });
      }
    }
    
    // Fetch Hiring posts from "Ask HN: Who is hiring"
    try {
      const hiringPost = await findLatestHiringPost();
      if (hiringPost) {
        const comments = await getTopLevelComments(hiringPost.id);
        const recentComments = comments.filter(comment => comment.time >= oneDayAgo);
        
        for (const comment of recentComments) {
          try {
            const normalized = normalizeHackerNewsComment(comment, hiringPost);
            const result = await shouldProcessHackerNewsPost(normalized);
            
            if (result.shouldProcess) {
              posts.push(result.normalized);
            }
          } catch (error) {
            logError(`Error processing HN comment ${comment.id}: ${error.message}`, { platform: 'hackernews', stage: 'fetch_hiring' });
          }
        }
      }
    } catch (error) {
      logError(`Error fetching HN hiring posts: ${error.message}`, { platform: 'hackernews', stage: 'fetch_hiring' });
    }
  } catch (error) {
    logError(`Error fetching HackerNews posts: ${error.message}`, { platform: 'hackernews', stage: 'fetch' });
  }
  
  return posts;
}

export async function fetchProductHuntPosts() {
  const posts = [];
  
  try {
    const phPosts = await fetchPHPosts();
    
    for (const post of phPosts) {
      try {
        const result = await shouldProcessProductHuntPost(post);
        if (result.shouldProcess) {
          posts.push(result.normalized);
        }
      } catch (error) {
        logError(`Error processing ProductHunt post ${post.id}: ${error.message}`, { platform: 'producthunt', stage: 'fetch', postId: post.id });
      }
    }
    
    logInfo(`[PRODUCTHUNT] Fetched ${posts.length} posts`);
  } catch (error) {
    logError(`Error fetching ProductHunt posts: ${error.message}`, { platform: 'producthunt', stage: 'fetch' });
  }
  
  return posts;
}

export async function fetchGitHubPosts() {
  const posts = [];
  const MAX_ISSUES = 20;
  
  try {
    const skills = loadResumeSkills();
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const dateStr = oneDayAgo.toISOString().split('T')[0];
    
    const queries = buildGitHubSearchQueries(dateStr);
    const allIssues = [];
    const seenIssueIds = new Set();
    
    // Fetch issues from all queries
    for (const query of queries) {
      try {
        const response = await searchIssues(query, 'created', 'desc', 30);
        if (response && response.items) {
          for (const issue of response.items) {
            if (!seenIssueIds.has(issue.id)) {
              seenIssueIds.add(issue.id);
              allIssues.push(issue);
            }
          }
        }
      } catch (error) {
        logError(`Error searching GitHub: ${error.message}`, { platform: 'github', stage: 'search', query });
        continue;
      }
    }
    
    // Hard filter by skills BEFORE processing (to reduce AI calls)
    const skillFilteredIssues = [];
    for (const issue of allIssues) {
      const normalized = normalizeIssue(issue);
      const title = normalized.title || '';
      const body = normalized.selftext || '';
      
      // Skip non-tech issues immediately
      if (isNonTechIssue(title, body)) {
        continue;
      }
      
      // Check skill match
      if (matchesSkillFilter(title, body, skills)) {
        skillFilteredIssues.push(normalized);
        
        // Stop once we have enough
        if (skillFilteredIssues.length >= MAX_ISSUES) {
          break;
        }
      }
    }
    
    logInfo(`[GITHUB] Fetched ${allIssues.length} issues, skill-filtered to ${skillFilteredIssues.length} (max ${MAX_ISSUES})`);
    
    // Process only the skill-filtered issues
    for (const normalized of skillFilteredIssues) {
      try {
        const result = await shouldProcessGitHubPost(normalized, skills);
        
        if (result.shouldProcess) {
          posts.push(result.normalized);
        }
      } catch (error) {
        logError(`Error processing GitHub issue ${normalized.id}: ${error.message}`, { platform: 'github', stage: 'process', postId: normalized.id });
      }
    }
  } catch (error) {
    logError(`Error fetching GitHub posts: ${error.message}`, { platform: 'github', stage: 'fetch' });
  }
  
  return posts;
}

