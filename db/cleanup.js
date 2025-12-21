import { connectDB } from './connection.js';
import { logger } from '../utils/logger.js';

export async function cleanupOldPosts() {
  try {
    const database = await connectDB();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const redditCount = await database.collection('posts').countDocuments({
      createdAt: { $lt: twoWeeksAgo },
      subreddit: { $exists: true }
    });
    
    const hackernewsHiringCount = await database.collection('posts').countDocuments({
      createdAt: { $lt: twoWeeksAgo },
      source: 'hackernews-ask-hiring'
    });
    
    const hackernewsJobsCount = await database.collection('posts').countDocuments({
      createdAt: { $lt: twoWeeksAgo },
      source: 'hackernews-jobs'
    });
    
    const wellfoundCount = await database.collection('posts').countDocuments({
      createdAt: { $lt: twoWeeksAgo },
      source: 'wellfound'
    });
    
    const producthuntPostsCount = await database.collection('producthunt_posts').countDocuments({
      createdAt: { $lt: twoWeeksAgo }
    });
    
    const producthuntCollabCount = await database.collection('producthunt_collab_opportunities').countDocuments({
      createdAt: { $lt: twoWeeksAgo }
    });
    
    const result = await database.collection('posts').deleteMany({
      createdAt: { $lt: twoWeeksAgo }
    });
    
    const producthuntPostsResult = await database.collection('producthunt_posts').deleteMany({
      createdAt: { $lt: twoWeeksAgo }
    });
    
    const producthuntCollabResult = await database.collection('producthunt_collab_opportunities').deleteMany({
      createdAt: { $lt: twoWeeksAgo }
    });
    
    logger.mongodb.log(`Cleaned up ${result.deletedCount} old posts (Reddit: ${redditCount}, HN Hiring: ${hackernewsHiringCount}, HN Jobs: ${hackernewsJobsCount}, Wellfound: ${wellfoundCount})`);
    logger.mongodb.log(`Cleaned up ${producthuntPostsResult.deletedCount} Product Hunt posts and ${producthuntCollabResult.deletedCount} collab opportunities`);
    return result.deletedCount + producthuntPostsResult.deletedCount + producthuntCollabResult.deletedCount;
  } catch (error) {
    logger.error.log(`Error cleaning up old posts: ${error.message}`);
    return 0;
  }
}

