import { scrapeAskHiring } from './hiring.js';
import { scrapeJobs } from './jobs.js';
import { logError, logPlatformComplete, logInfo } from '../../logs/index.js';
import { markPlatformIngestionComplete, getDailyDeliveryState } from '../../db/state.js';
import { connectDB } from '../../db/connection.js';

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
    
    logPlatformComplete('hackernews', '');
    
    const allIngestionDone = await markPlatformIngestionComplete('hn');
    if (allIngestionDone) {
      const db = await connectDB();
      const dailyState = await getDailyDeliveryState();
      const bufferSizeAfter = await db.collection('classification_buffer').countDocuments({ classified: false });
      
      if (bufferSizeAfter === 0) {
        logInfo('Ingestion complete. No items eligible for classification today.');
      } else {
        logInfo(`Ingestion complete. Waiting for classification to finish... (${bufferSizeAfter} items in buffer)`);
      }
    }
    
    return stats; 
  } catch (error) {
    stats.errors++;
    logError(`Hacker News error: ${error.message}`);
    return stats;
  }
}

