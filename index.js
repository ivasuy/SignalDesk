import cron from "node-cron";
import dotenv from "dotenv";
import { connectDB, closeDB } from "./db/connection.js";
import { cleanupOldPosts } from "./db/cleanup.js";
import { initializeWhatsApp, cleanupWhatsApp } from "./integrations/whatsapp/whatsapp.js";
import { logInfo, logFatal, logError } from "./logs/index.js";
import { logDailySummary, logPlatformBreakdown } from "./logs/summary.js";
import { processReddit, processHackerNews, processProductHunt, processGitHub } from "./orchestrators/platforms.js";
import { fetchRedditPosts } from "./orchestrators/fetchers.js";
import { fetchHackerNewsPosts } from "./orchestrators/fetchers.js";
import { fetchProductHuntPosts } from "./orchestrators/fetchers.js";
import { fetchGitHubPosts } from "./orchestrators/fetchers.js";
import { stopCostLogging, getAICallCounts } from "./ai/api.js";
import { isDailyProcessingCompleted, markDailyProcessingCompleted } from "./db/state.js";

dotenv.config();

async function runDailyProcessing() {
  // Check if processing has already been completed today
  const alreadyCompleted = await isDailyProcessingCompleted();
  if (alreadyCompleted) {
    logInfo('Daily processing has already been completed today. Skipping...');
    return;
  }

  const overallStart = Date.now();
  const overallInitialAICalls = getAICallCounts();
  let totalErrors = 0;
  
  try {
    logInfo('Starting daily opportunity processing');
    
    logInfo('Processing Reddit...');
    let redditResult = { fetched: 0, processed: 0, sent: 0, aiCalls: 0, errors: 0, keywordAccepted: 0, aiClassified: 0, capAccepted: 0 };
    try {
      const redditPosts = await fetchRedditPosts();
      redditResult = await processReddit(redditPosts);
      totalErrors += redditResult.errors || 0;
    } catch (error) {
      totalErrors++;
      logError(`Reddit processing failed: ${error.message}`, { platform: 'reddit', stage: 'fatal' });
    }
    
    logInfo('Processing Hacker News...');
    let hnResult = { fetched: 0, processed: 0, sent: 0, aiCalls: 0, errors: 0, keywordAccepted: 0, aiClassified: 0, capAccepted: 0 };
    try {
      const hnPosts = await fetchHackerNewsPosts();
      hnResult = await processHackerNews(hnPosts);
      totalErrors += hnResult.errors || 0;
    } catch (error) {
      totalErrors++;
      logError(`HackerNews processing failed: ${error.message}`, { platform: 'hackernews', stage: 'fatal' });
    }
    
    logInfo('Processing Product Hunt...');
    let phResult = { fetched: 0, processed: 0, sent: 0, aiCalls: 0, errors: 0, keywordAccepted: 0, aiClassified: 0, capAccepted: 0 };
    try {
      const phPosts = await fetchProductHuntPosts();
      phResult = await processProductHunt(phPosts);
      totalErrors += phResult.errors || 0;
    } catch (error) {
      totalErrors++;
      logError(`ProductHunt processing failed: ${error.message}`, { platform: 'producthunt', stage: 'fatal' });
    }
    
    logInfo('Processing GitHub...');
    let githubResult = { fetched: 0, processed: 0, sent: 0, aiCalls: 0, errors: 0, keywordAccepted: 0, aiClassified: 0, capAccepted: 0 };
    try {
      const githubPosts = await fetchGitHubPosts();
      githubResult = await processGitHub(githubPosts);
      totalErrors += githubResult.errors || 0;
    } catch (error) {
      totalErrors++;
      logError(`GitHub processing failed: ${error.message}`, { platform: 'github', stage: 'fatal' });
    }
    
    const overallFinalAICalls = getAICallCounts();
    const totalAICalls = overallFinalAICalls.total - overallInitialAICalls.total;
    const totalDuration = Date.now() - overallStart;
    const totalFetched = (redditResult.fetched || 0) + (hnResult.fetched || 0) + (phResult.fetched || 0) + (githubResult.fetched || 0);
    const totalProcessed = (redditResult.processed || 0) + (hnResult.processed || 0) + (phResult.processed || 0) + (githubResult.processed || 0);
    const totalSent = (redditResult.sent || 0) + (hnResult.sent || 0) + (phResult.sent || 0) + (githubResult.sent || 0);
    
    logDailySummary({
      totalFetched,
      totalProcessed,
      totalSent,
      totalAICalls,
      classificationCalls: overallFinalAICalls.classification,
      replyCalls: overallFinalAICalls.reply,
      resumeCalls: overallFinalAICalls.resume,
      totalErrors,
      totalDuration: `${totalDuration}ms`
    });
    
    logPlatformBreakdown({
      reddit: redditResult,
      hackernews: hnResult,
      producthunt: phResult,
      github: githubResult
    });
    
    logInfo('All opportunities processed for today. Next run tomorrow.');
    
    // Mark processing as completed
    await markDailyProcessingCompleted();
    
    stopCostLogging();
  } catch (error) {
    totalErrors++;
    logFatal(`Daily processing error: ${error.message}`);
    // Don't mark as completed if there was an error
    throw error;
  }
}

async function start() {
  try {
    await connectDB();
    await initializeWhatsApp();
    
    logInfo('System initialized');
    
    cron.schedule('0 0 * * *', cleanupOldPosts);
    cron.schedule('0 0 * * *', runDailyProcessing);
    
    await runDailyProcessing();
  } catch (error) {
    logFatal(`Failed to start: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logInfo('Shutting down gracefully...');
  stopCostLogging();
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logInfo('Shutting down gracefully...');
  stopCostLogging();
  await closeDB();
  process.exit(0);
});

start();
