import cron from "node-cron";
import dotenv from "dotenv";
import chalk from "chalk";
import { scrapeReddit } from "./integrations/reddit/reddit.js";
import { scrapeHackerNews } from "./integrations/hackernews/hacker-news.js";
import { scrapeWellfound } from "./integrations/wellfound/wellfound.js";
import { scrapeProductHunt } from "./integrations/producthunt/producthunt.js";
import { scrapeGitHub } from "./integrations/github/github.js";
import { connectDB, closeDB } from "./db/connection.js";
import { cleanupOldPosts } from "./db/cleanup.js";
import { initializeWhatsApp, cleanupWhatsApp, sendDailyFeedbackForm } from "./integrations/whatsapp/whatsapp.js";
import { logger } from "./utils/logger.js";
import { runLearningCycle } from "./utils/learning.js";

dotenv.config();

async function start() {
  try {
    await connectDB();
    await initializeWhatsApp();

    cron.schedule("0 */5 * * *", scrapeReddit);
    cron.schedule("0 0 * * *", scrapeHackerNews);
    cron.schedule("0 0 * * *", scrapeWellfound);
    cron.schedule("0 0 * * *", scrapeProductHunt);
    cron.schedule("0 0 * * *", scrapeGitHub);
    cron.schedule("0 0 */14 * *", cleanupOldPosts);
    cron.schedule("0 1 * * *", runLearningCycle);
    cron.schedule("0 22 * * *", sendDailyFeedbackForm);

    logger.info(
      `${chalk.hex("#FF4500")(
        "Reddit"
      )} freelance monitor started. Running every 5 hours.`
    );
    logger.info(
      `${chalk.blue("Hacker News")} scraping scheduled: every 24 hours`
    );
    logger.info(
      `${chalk.hex("#DA552F")(
        "Product Hunt"
      )} scraping scheduled: every 24 hours`
    );
    logger.info(`${chalk.white("GitHub")} scraping scheduled: every 24 hours`);
    // logger.info(`${chalk.green('Cleanup')} job scheduled: every 2 weeks`);
    // logger.info(`${chalk.hex('#FF69B4')('Wellfound')} scraping scheduled: every 24 hours`);

    await scrapeReddit();
    await scrapeHackerNews();
    await scrapeProductHunt();
    await scrapeGitHub();
    // await scrapeWellfound();
  } catch (error) {
    logger.error.fatal(`Failed to start: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  // await cleanupWhatsApp();
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  // await cleanupWhatsApp();
  await closeDB();
  process.exit(0);
});

start();
