import { scrapeAskHiring } from './hiring.js';
import { scrapeJobs } from './jobs.js';
import { logError } from '../../logs/index.js';

export async function scrapeHackerNews() {
  const stats = {
    askHiring: { scraped: 0, keywordFiltered: 0, aiClassified: 0, opportunities: 0, highValue: 0 },
    jobs: { scraped: 0, keywordFiltered: 0, aiClassified: 0, opportunities: 0, highValue: 0 },
    errors: 0
  };
  
  try {
    const [askHiringStats, jobsStats] = await Promise.all([
      scrapeAskHiring(),
      scrapeJobs()
    ]);
    
    stats.askHiring = askHiringStats;
    stats.jobs = jobsStats;
    
    return stats; 
  } catch (error) {
    stats.errors++;
    logError(`Hacker News error: ${error.message}`);
    return stats;
  }
}

