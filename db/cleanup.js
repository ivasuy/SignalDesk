import { connectDB } from './connection.js';
import { logMongoDB, logError } from '../logs/index.js';

const COLLECTION_NAME = 'opportunities';

export async function cleanupOldPosts() {
  try {
    const database = await connectDB();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const redditCount = await database.collection(COLLECTION_NAME).countDocuments({
      createdAt: { $lt: twoWeeksAgo },
      sourcePlatform: 'reddit'
    });
    
    const hackernewsHiringCount = await database.collection(COLLECTION_NAME).countDocuments({
      createdAt: { $lt: twoWeeksAgo },
      sourcePlatform: 'hn',
      sourceContext: 'ask-hiring'
    });
    
    const hackernewsJobsCount = await database.collection(COLLECTION_NAME).countDocuments({
      createdAt: { $lt: twoWeeksAgo },
      sourcePlatform: 'hn',
      sourceContext: 'jobs'
    });
    
    const githubCount = await database.collection(COLLECTION_NAME).countDocuments({
      createdAt: { $lt: twoWeeksAgo },
      sourcePlatform: 'github'
    });

    const result = await database.collection(COLLECTION_NAME).deleteMany({
      createdAt: { $lt: twoWeeksAgo }
    });
    
    const producthuntPostsResult = await database.collection('producthunt_posts').deleteMany({
      createdAt: { $lt: twoWeeksAgo }
    });
    
    const producthuntCollabResult = await database.collection('producthunt_collab_opportunities').deleteMany({
      createdAt: { $lt: twoWeeksAgo }
    });
    
    logMongoDB(`Cleaned up ${result.deletedCount} old posts (Reddit: ${redditCount}, HN Hiring: ${hackernewsHiringCount}, HN Jobs: ${hackernewsJobsCount}, GitHub: ${githubCount})`);
    logMongoDB(`Cleaned up ${producthuntPostsResult.deletedCount} Product Hunt posts and ${producthuntCollabResult.deletedCount} collab opportunities`);
    return result.deletedCount + producthuntPostsResult.deletedCount + producthuntCollabResult.deletedCount;
  } catch (error) {
    logError(`Error cleaning up old posts: ${error.message}`);
    return 0;
  }
}

