import { logAI, logError } from '../logs/index.js';
import { logPlatformSummary } from '../logs/summary.js';
import { getSentTodayCount } from './helpers/db-helpers.js';
import { filterValidPosts, filterNotProcessedToday } from './helpers/data-helpers.js';
import { sendPostsWithDelay } from './helpers/delivery-helpers.js';
import { processRedditPosts } from '../ai/platforms/reddit.ai.js';
import { processGitHubPosts } from '../ai/platforms/github.ai.js';
import { processHackerNewsPosts } from '../ai/platforms/hackernews.ai.js';
import { processProductHuntPosts } from '../ai/platforms/producthunt.ai.js';
import { getAICallCounts } from '../ai/api.js';

const PLATFORM_CAPS = {
  reddit: 10,
  github: 5,
  hackernews: Infinity,
  producthunt: Infinity
};

async function processPlatformPosts(posts, platform) {
  const startTime = Date.now();
  const initialAICalls = getAICallCounts();
  let errors = 0;
  
  try {
    const sentToday = await getSentTodayCount(platform);
    const cap = PLATFORM_CAPS[platform] || Infinity;
    
    if (cap !== Infinity && sentToday >= cap) {
      logAI(`[${platform.toUpperCase()}] Platform cap already reached (${sentToday}/${cap}), skipping`);
      const duration = Date.now() - startTime;
      logPlatformSummary(platform, {
        fetched: posts.length,
        keywordAccepted: 0,
        aiClassified: 0,
        capAccepted: 0,
        sent: 0,
        aiCalls: {},
        errors: 0,
        duration: `${duration}ms`
      });
      return { fetched: posts.length, processed: 0, sent: 0, aiCalls: 0, errors: 0, keywordAccepted: 0, aiClassified: 0, capAccepted: 0 };
    }
    
    const filtered = filterValidPosts(posts);
    
    if (filtered.length === 0) {
      const duration = Date.now() - startTime;
      logPlatformSummary(platform, {
        fetched: posts.length,
        keywordAccepted: 0,
        aiClassified: 0,
        capAccepted: 0,
        sent: 0,
        aiCalls: {},
        errors: 0,
        duration: `${duration}ms`
      });
      return { fetched: posts.length, processed: 0, sent: 0, aiCalls: 0, errors: 0, keywordAccepted: 0, aiClassified: 0, capAccepted: 0 };
    }
    
    logAI(`[${platform.toUpperCase()}] Processing ${filtered.length} posts`);
    
    const notProcessed = await filterNotProcessedToday(filtered);
    
    if (notProcessed.length === 0) {
      const finalAICalls = getAICallCounts();
      const aiCalls = finalAICalls.total - initialAICalls.total;
      const duration = Date.now() - startTime;
      logPlatformSummary(platform, {
        fetched: posts.length,
        keywordAccepted: 0,
        aiClassified: 0,
        capAccepted: 0,
        sent: 0,
        aiCalls,
        errors: 0,
        duration: `${duration}ms`
      });
      return { fetched: posts.length, processed: filtered.length, sent: 0, aiCalls, errors: 0, keywordAccepted: 0, aiClassified: 0, capAccepted: 0 };
    }
    
    let result = { posts: [], stats: { keywordAccepted: 0, aiClassified: 0, capAccepted: 0 } };
    
    try {
      if (platform === 'reddit') {
        result = await processRedditPosts(notProcessed);
      } else if (platform === 'github') {
        result = await processGitHubPosts(notProcessed);
      } else if (platform === 'hackernews') {
        result = await processHackerNewsPosts(notProcessed);
      } else if (platform === 'producthunt') {
        result = await processProductHuntPosts(notProcessed);
      }
    } catch (error) {
      errors++;
      logError(`Error processing ${platform} posts: ${error.message}`, { platform, stage: 'processing' });
      throw error;
    }
    
    const processedPosts = result.posts || [];
    const platformStats = result.stats || { 
      keywordAccepted: 0, 
      aiClassified: 0, 
      capAccepted: 0,
      aiCalls: {}
    };
    
    if (processedPosts.length === 0) {
      const duration = Date.now() - startTime;
      
      logPlatformSummary(platform, {
        fetched: posts.length,
        keywordAccepted: platformStats.keywordAccepted,
        aiClassified: platformStats.aiClassified,
        capAccepted: platformStats.capAccepted,
        sent: 0,
        aiCalls: platformStats.aiCalls || {},
        errors,
        duration: `${duration}ms`
      });
      
      const totalAICalls = (platformStats.aiCalls?.skillFilter || 0) + 
                          (platformStats.aiCalls?.classification || 0) + 
                          (platformStats.aiCalls?.capSelection || 0) + 
                          (platformStats.aiCalls?.reply || 0) + 
                          (platformStats.aiCalls?.coverLetter || 0) + 
                          (platformStats.aiCalls?.resume || 0);
      
      return { 
        fetched: posts.length, 
        processed: filtered.length, 
        sent: 0, 
        aiCalls: totalAICalls, 
        errors,
        keywordAccepted: platformStats.keywordAccepted,
        aiClassified: platformStats.aiClassified,
        capAccepted: platformStats.capAccepted
      };
    }
    
    let sent = 0;
    try {
      sent = await sendPostsWithDelay(processedPosts, platform);
    } catch (error) {
      errors++;
      logError(`Error sending ${platform} posts: ${error.message}`, { platform, stage: 'delivery' });
    }
    
    const duration = Date.now() - startTime;
    
    logPlatformSummary(platform, {
      fetched: posts.length,
      keywordAccepted: platformStats.keywordAccepted,
      aiClassified: platformStats.aiClassified,
      capAccepted: platformStats.capAccepted,
      sent,
      aiCalls: platformStats.aiCalls || {},
      errors,
      duration: `${duration}ms`
    });
    
    const totalAICalls = (platformStats.aiCalls?.skillFilter || 0) + 
                        (platformStats.aiCalls?.classification || 0) + 
                        (platformStats.aiCalls?.capSelection || 0) + 
                        (platformStats.aiCalls?.reply || 0) + 
                        (platformStats.aiCalls?.coverLetter || 0) + 
                        (platformStats.aiCalls?.resume || 0);
    
    return { 
      fetched: posts.length, 
      processed: filtered.length, 
      sent, 
      aiCalls: totalAICalls, 
      errors,
      keywordAccepted: platformStats.keywordAccepted,
      aiClassified: platformStats.aiClassified,
      capAccepted: platformStats.capAccepted
    };
  } catch (error) {
    errors++;
    logError(`Fatal error processing ${platform}: ${error.message}`, { platform, stage: 'fatal' });
    const finalAICalls = getAICallCounts();
    const aiCalls = finalAICalls.total - initialAICalls.total;
    const duration = Date.now() - startTime;
    logPlatformSummary(platform, {
      fetched: posts.length,
      keywordAccepted: 0,
      aiClassified: 0,
      capAccepted: 0,
      sent: 0,
      aiCalls,
      errors,
      duration: `${duration}ms`
    });
    return { fetched: posts.length, processed: 0, sent: 0, aiCalls, errors, keywordAccepted: 0, aiClassified: 0, capAccepted: 0 };
  }
}

export async function processReddit(posts) {
  return await processPlatformPosts(posts, 'reddit');
}

export async function processHackerNews(posts) {
  return await processPlatformPosts(posts, 'hackernews');
}

export async function processProductHunt(posts) {
  return await processPlatformPosts(posts, 'producthunt');
}

export async function processGitHub(posts) {
  return await processPlatformPosts(posts, 'github');
}

