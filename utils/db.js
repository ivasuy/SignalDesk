import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { logger } from './logger.js';

dotenv.config();

let client = null;
let db = null;

export async function connectDB() {
  if (client && db) {
    return db;
  }

  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI not set in .env');
    }

    client = new MongoClient(uri);
    await client.connect();
    db = client.db('reddit_opportunities');
    
    try {
      await db.collection('posts').dropIndex('subreddit_1_author_1_title_1');
    } catch (error) {
      // Index doesn't exist, continue
    }
    
    try {
      await db.collection('posts').createIndex({ subreddit: 1, author: 1, title: 1 }, { unique: true, sparse: true });
    } catch (error) {
      // Index might already exist with different options, continue
    }
    
    try {
      await db.collection('posts').createIndex({ source: 1, author: 1, title: 1 }, { unique: true, sparse: true });
    } catch (error) {
      // Index might already exist, continue
    }
    
    try {
      await db.collection('posts').createIndex({ createdAt: 1 });
    } catch (error) {
      // Index might already exist, continue
    }
    
    try {
      await db.collection('posts').createIndex({ postId: 1 });
    } catch (error) {
      // Index might already exist, continue
    }
    
    try {
      await db.collection('posts').createIndex({ sourcePlatform: 1 });
    } catch (error) {
      // Index might already exist, continue
    }
    
    try {
      await db.collection('posts').createIndex({ sourceContext: 1 });
    } catch (error) {
      // Index might already exist, continue
    }
    
    try {
      await db.collection('posts').createIndex({ opportunityScore: 1 });
    } catch (error) {
      // Index might already exist, continue
    }
    
    try {
      await db.collection('posts').createIndex({ sentAt: 1 });
    } catch (error) {
      // Index might already exist, continue
    }
    
    try {
      await db.collection('posts').createIndex({ feedbackStatus: 1, sentAt: -1 });
    } catch (error) {
      // Index might already exist, continue
    }
    
    logger.mongodb.connected();
    return db;
  } catch (error) {
    throw new Error(`MongoDB connection failed: ${error.message}`);
  }
}

function normalizeContent(content) {
  return content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

export async function checkPostExists(source, author, title, content = '') {
  try {
    const database = await connectDB();
    
    const exactMatch = await database.collection('posts').findOne({
      $or: [
        { subreddit: source, author, title },
        { source, author, title }
      ]
    });
    
    if (exactMatch) return true;
    
    if (content) {
      const normalizedContent = normalizeContent(content);
      const contentHash = normalizedContent.substring(0, 200);
      
      const contentMatch = await database.collection('posts').findOne({
        author,
        $or: [
          { contentHash },
          { normalizedContent: { $regex: new RegExp(contentHash.substring(0, 100), 'i') } }
        ]
      });
      
      if (contentMatch) return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking post:', error.message);
    return false;
  }
}

export async function savePost(postData) {
  try {
    const database = await connectDB();
    const identifier = postData.subreddit || postData.source;
    const identifierField = postData.subreddit ? 'subreddit' : 'source';
    
    const content = postData.selftext || postData.content || '';
    const normalizedContent = normalizeContent(content);
    const contentHash = normalizedContent.substring(0, 200);
    
    // First, try to find existing document by author and title (regardless of source/subreddit)
    const existingDoc = await database.collection('posts').findOne({
      author: postData.author,
      title: postData.title
    });
    
    // Build update operation
    const updateOp = {
      $set: {
        normalizedContent,
        contentHash,
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    };
    
    // For Reddit posts, ensure source is unset (only subreddit)
    if (postData.subreddit) {
      updateOp.$unset = { source: '' };
      // Add all fields except source to $set
      Object.keys(postData).forEach(key => {
        if (key !== 'source') {
          updateOp.$set[key] = postData[key];
        }
      });
    }
    // For non-Reddit posts, ensure subreddit is unset (only source)
    else if (postData.source) {
      updateOp.$unset = { subreddit: '' };
      // Add all fields except subreddit to $set
      Object.keys(postData).forEach(key => {
        if (key !== 'subreddit') {
          updateOp.$set[key] = postData[key];
        }
      });
    } else {
      // Fallback: add all fields
      Object.keys(postData).forEach(key => {
        updateOp.$set[key] = postData[key];
      });
    }
    
    // If document exists, update it by _id to avoid index conflicts
    if (existingDoc) {
      await database.collection('posts').updateOne(
        { _id: existingDoc._id },
        updateOp
      );
    } else {
      // Build query filter for new document
      const queryFilter = {
        [identifierField]: identifier,
        author: postData.author,
        title: postData.title
      };
      
      if (postData.subreddit) {
        // For Reddit posts, ensure source doesn't exist or is null
        queryFilter.$or = [
          { source: { $exists: false } },
          { source: null }
        ];
      } else if (postData.source) {
        // For non-Reddit posts, ensure subreddit doesn't exist or is null
        queryFilter.$or = [
          { subreddit: { $exists: false } },
          { subreddit: null }
        ];
      }
      
      await database.collection('posts').updateOne(
        queryFilter,
        updateOp,
        { upsert: true }
      );
    }
  } catch (error) {
    logger.error.log(`Error saving post: ${error.message}`);
  }
}

export async function checkProductHuntPostExists(postId, type = null) {
  try {
    const database = await connectDB();
    const collection = database.collection('producthunt_posts');
    
    const query = { postId, source: 'producthunt' };
    if (type) {
      query.type = type;
    }
    
    const exists = await collection.findOne(query);
    return !!exists;
  } catch (error) {
    logger.error.log(`Error checking Product Hunt post: ${error.message}`);
    return false;
  }
}

export async function saveProductHuntPost(postData) {
  try {
    const database = await connectDB();
    
    const { createdAt, ...dataToUpdate } = postData;
    
    await database.collection('producthunt_posts').updateOne(
      { postId: postData.postId, source: 'producthunt' },
      {
        $set: {
          ...dataToUpdate,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: createdAt ? new Date(createdAt) : new Date()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    logger.error.log(`Error saving Product Hunt post: ${error.message}`);
  }
}

export async function checkProductHuntCollabExists(postId) {
  try {
    const database = await connectDB();
    const exists = await database.collection('producthunt_collab_opportunities').findOne({
      postId,
      source: 'producthunt'
    });
    return !!exists;
  } catch (error) {
    logger.error.log(`Error checking Product Hunt collab: ${error.message}`);
    return false;
  }
}

export async function saveProductHuntCollab(collabData) {
  try {
    const database = await connectDB();
    
    const { createdAt, ...dataToUpdate } = collabData;
    
    await database.collection('producthunt_collab_opportunities').updateOne(
      { postId: collabData.postId, source: 'producthunt' },
      {
        $set: {
          ...dataToUpdate,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: createdAt ? new Date(createdAt) : new Date()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    logger.error.log(`Error saving Product Hunt collab: ${error.message}`);
  }
}

export async function cleanupOldPosts() {
  try {
    const database = await connectDB();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    // Get breakdown before deletion
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

export async function saveOpportunityPost(postData) {
  try {
    const database = await connectDB();
    
    const normalizedPostId = postData.postId || `${postData.sourcePlatform || postData.source || 'unknown'}-${postData.id || Date.now()}`;
    
    const updateData = {
      postId: normalizedPostId,
      sourcePlatform: postData.sourcePlatform || (postData.subreddit ? 'reddit' : postData.source || 'unknown'),
      sourceContext: postData.sourceContext || postData.subreddit || postData.source || 'unknown',
      title: postData.title,
      permalink: postData.permalink,
      category: postData.category || null,
      opportunityScore: postData.opportunityScore || 0,
      actionDecision: postData.actionDecision || null,
      personaUsed: postData.personaUsed || null,
      toneUsed: postData.toneUsed || null,
      replyTextSent: postData.replyTextSent || null,
      coverLetterJSON: postData.coverLetterJSON || null,
      resumeJSON: postData.resumeJSON || null,
      sentAt: postData.sentAt || null,
      feedbackStatus: postData.feedbackStatus || null,
      userFeedback: postData.userFeedback || null,
      responseDelayHours: postData.responseDelayHours || null,
      updatedAt: new Date()
    };
    
    if (postData.author) updateData.author = postData.author;
    if (postData.selftext) updateData.selftext = postData.selftext;
    if (postData.content) updateData.content = postData.content;
    
    await database.collection('posts').updateOne(
      { postId: normalizedPostId },
      {
        $set: updateData,
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    logger.error.log(`Error saving opportunity post: ${error.message}`);
  }
}

export async function checkPostExistsByPostId(postId) {
  try {
    const database = await connectDB();
    const exists = await database.collection('posts').findOne({ postId });
    return !!exists;
  } catch (error) {
    logger.error.log(`Error checking post by postId: ${error.message}`);
    return false;
  }
}

export async function aggregateLearningMetrics() {
  try {
    const database = await connectDB();
    
    const pipeline = [
      {
        $match: {
          feedbackStatus: 'received',
          userFeedback: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            sourcePlatform: '$sourcePlatform',
            sourceContext: '$sourceContext',
            scoreBucket: {
              $cond: [
                { $lt: ['$opportunityScore', 50] },
                '0-49',
                {
                  $cond: [
                    { $lt: ['$opportunityScore', 80] },
                    '50-79',
                    '80-100'
                  ]
                }
              ]
            },
            persona: '$personaUsed',
            tone: '$toneUsed'
          },
          total: { $sum: 1 },
          hired: {
            $sum: { $cond: [{ $in: ['$userFeedback', ['hired', 'collab_started']] }, 1, 0] }
          },
          replied: {
            $sum: { $cond: [{ $eq: ['$userFeedback', 'replied'] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$userFeedback', 'rejected'] }, 1, 0] }
          },
          call: {
            $sum: { $cond: [{ $eq: ['$userFeedback', 'call'] }, 1, 0] }
          },
          avgScore: { $avg: '$opportunityScore' },
          avgResponseDelay: { $avg: '$responseDelayHours' }
        }
      }
    ];
    
    const metrics = await database.collection('posts').aggregate(pipeline).toArray();
    
    await database.collection('opportunity_learning_metrics').updateOne(
      { date: new Date().toISOString().split('T')[0] },
      {
        $set: {
          date: new Date().toISOString().split('T')[0],
          metrics: metrics,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    return metrics;
  } catch (error) {
    logger.error.log(`Error aggregating learning metrics: ${error.message}`);
    return [];
  }
}

export async function getLearningMetrics() {
  try {
    const database = await connectDB();
    const latest = await database.collection('opportunity_learning_metrics')
      .findOne({}, { sort: { updatedAt: -1 } });
    return latest?.metrics || [];
  } catch (error) {
    logger.error.log(`Error getting learning metrics: ${error.message}`);
    return [];
  }
}

export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

