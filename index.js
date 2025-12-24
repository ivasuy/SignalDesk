import cron from "node-cron";
import dotenv from "dotenv";
import { scrapeReddit } from "./integrations/reddit/reddit.js";
import { scrapeHackerNews } from "./integrations/hackernews/hacker-news.js";
// import { scrapeWellfound } from "./integrations/wellfound/wellfound.js";
import { scrapeProductHunt } from "./integrations/producthunt/producthunt.js";
import { scrapeGitHub } from "./integrations/github/github.js";
import { connectDB, closeDB } from "./db/connection.js";
import { cleanupOldPosts } from "./db/cleanup.js";
import { initializeWhatsApp, cleanupWhatsApp, sendDailyFeedbackForm } from "./integrations/whatsapp/whatsapp.js";
import { logInfo, logFatal, logMongoDBConnected } from "./logs/index.js";
import { runLearningCycle } from "./utils/learning.js";
import { startQueueWorker } from "./queue/worker.js";
import { startClassifierWorker } from "./queue/classifier.js";
import { resetDailyState } from "./db/state.js";

dotenv.config();

let queueWorkerIntervals = null;

async function start() {
  try {
    await connectDB();
    await initializeWhatsApp();

    logInfo('Initializing queue system');
    startClassifierWorker();
    queueWorkerIntervals = startQueueWorker();
    
    cron.schedule('0 0 * * *', async () => {
      logInfo('Resetting daily delivery state (midnight)');
      await resetDailyState();
    });
    
    logInfo('Queue system initialized');

    cron.schedule("0 0 * * *", scrapeReddit);
    cron.schedule("0 0 * * *", scrapeHackerNews);
    // cron.schedule("0 0 * * *", scrapeWellfound);
    logInfo('Wellfound scraping disabled (testing phase)');
    cron.schedule("0 0 * * *", scrapeProductHunt);
    cron.schedule("0 0 * * *", scrapeGitHub);
    cron.schedule("0 0 */14 * *", cleanupOldPosts);
    cron.schedule("0 1 * * *", runLearningCycle);
    cron.schedule("0 22 * * *", sendDailyFeedbackForm);

    await scrapeReddit();
    await scrapeHackerNews();
    await scrapeProductHunt();
    await scrapeGitHub();
    // await scrapeWellfound();
  } catch (error) {
    logFatal(`Failed to start: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logInfo('Shutting down gracefully...');
  // await cleanupWhatsApp();
  if (queueWorkerIntervals) {
    clearInterval(queueWorkerIntervals.main);
    clearInterval(queueWorkerIntervals.backlog);
    logInfo('Queue worker stopped');
  }
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logInfo('Shutting down gracefully...');
  // await cleanupWhatsApp();
  if (queueWorkerIntervals) {
    clearInterval(queueWorkerIntervals.main);
    clearInterval(queueWorkerIntervals.backlog);
    logInfo('Queue worker stopped');
  }
  await closeDB();
  process.exit(0);
});

start();
