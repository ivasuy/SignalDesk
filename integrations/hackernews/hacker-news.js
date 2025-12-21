import { scrapeAskHiring } from './hiring.js';
import { scrapeJobs } from './jobs.js';
import { logger } from '../../utils/logger.js';

export async function scrapeHackerNews() {
  logger.hackernews.scrapingStart();
  
  const stats = {
    askHiring: { scraped: 0, keywordFiltered: 0, aiClassified: 0, opportunities: 0, highValue: 0 },
    jobs: { scraped: 0, keywordFiltered: 0, aiClassified: 0, opportunities: 0, highValue: 0 }
  };
  
  try {
    const [askHiringStats, jobsStats] = await Promise.all([
      scrapeAskHiring(),
      scrapeJobs()
    ]);
    
    stats.askHiring = askHiringStats;
    stats.jobs = jobsStats;
    
    logger.hackernews.summary();
    logger.stats.hackernews(
      'Ask Hiring',
      askHiringStats.scraped,
      askHiringStats.keywordFiltered,
      askHiringStats.aiClassified,
      askHiringStats.opportunities,
      askHiringStats.highValue
    );
    logger.stats.hackernews(
      'Jobs',
      jobsStats.scraped,
      jobsStats.keywordFiltered,
      jobsStats.aiClassified,
      jobsStats.opportunities,
      jobsStats.highValue
    );
    logger.hackernews.scrapingComplete();
    
    return stats;
  } catch (error) {
    logger.error.log(`Hacker News error: ${error.message}`);
    return stats;
  }
}

