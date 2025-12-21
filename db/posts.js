import { connectDB } from './connection.js';
import { logger } from '../utils/logger.js';

export async function saveOpportunityPostToDatabase(postData) {
  try {
    const database = await connectDB();
    
    if (!postData.postId) {
      throw new Error('postId is required for saveOpportunityPostToDatabase');
    }
    
    const normalizedPostId = postData.postId;
    
    const updateData = {
      postId: normalizedPostId,
      sourcePlatform: postData.sourcePlatform || 'unknown',
      sourceContext: postData.sourceContext || 'unknown',
      title: postData.title,
      permalink: postData.permalink,
      category: postData.category || null,
      opportunityScore: postData.opportunityScore || 0,
      actionDecision: postData.actionDecision || null,
      personaUsed: postData.personaUsed || null,
      toneUsed: postData.toneUsed || null,
      replyTextSent: postData.replyTextSent || null,
      replyMode: postData.replyMode || null,
      coverLetterJSON: postData.coverLetterJSON || null,
      resumeJSON: postData.resumeJSON || null,
      sentAt: postData.sentAt || null,
      feedbackStatus: postData.feedbackStatus || null,
      feedbackRequestedAt: postData.feedbackRequestedAt || null,
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
    throw error;
  }
}

export async function checkIfOpportunityPostExistsByPostId(postId) {
  try {
    const database = await connectDB();
    const exists = await database.collection('posts').findOne({ postId });
    return !!exists;
  } catch (error) {
    logger.error.log(`Error checking post by postId: ${error.message}`);
    return false;
  }
}

export async function updateOpportunityPostAfterSending(postData) {
  try {
    const db = await connectDB();
    const query = postData._id ? { _id: postData._id } : { postId: postData.postId };
    await db.collection('posts').updateOne(
      query,
      {
        $set: {
          replyTextSent: postData.replyTextSent || '',
          personaUsed: postData.personaUsed || 'engineer',
          toneUsed: postData.toneUsed || 'professional',
          replyMode: postData.replyMode || null, 
          sentAt: new Date(),
          feedbackStatus: 'pending',
          feedbackRequestedAt: null,
          actionDecision: postData.actionDecision || 'reply_only',
          coverLetterJSON: postData.coverLetterJSON || null,
          resumeJSON: postData.resumeJSON || null
        }
      }
    );
  } catch (error) {
    logger.error.log(`Error updating post after sending: ${error.message}`);
  }
}

// ProductHunt specific saving functions
export async function checkIfProductHuntPostExists(postId, type = null) {
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

export async function saveProductHuntPostToDatabase(postData) {
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

export async function checkIfProductHuntCollabExists(postId) {
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

export async function saveProductHuntCollabToDatabase(collabData) {
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

// Legacy compatibility functions for wellfound.js
export async function checkPostExists(source, author, title, selftext) {
  try {
    const database = await connectDB();
    const exists = await database.collection('posts').findOne({
      sourcePlatform: source,
      author: author,
      title: title,
      selftext: selftext
    });
    return !!exists;
  } catch (error) {
    logger.error.log(`Error checking post: ${error.message}`);
    return false;
  }
}

export async function savePost(postData) {
  try {
    const database = await connectDB();
    
    const updateData = {
      postId: postData.postId,
      sourcePlatform: postData.source || 'unknown',
      sourceContext: 'wellfound',
      title: postData.title,
      permalink: postData.permalink,
      author: postData.author,
      selftext: postData.selftext || '',
      category: postData.category || null,
      updatedAt: new Date()
    };
    
    await database.collection('posts').updateOne(
      { postId: postData.postId },
      {
        $set: updateData,
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    logger.error.log(`Error saving post: ${error.message}`);
    throw error;
  }
}

// Backward compatibility exports (keeping old names for now to avoid breaking changes)
export const saveOpportunityPost = saveOpportunityPostToDatabase;
export const checkPostExistsByPostId = checkIfOpportunityPostExistsByPostId;
export const updatePostAfterSending = updateOpportunityPostAfterSending;
export const checkProductHuntPostExists = checkIfProductHuntPostExists;
export const saveProductHuntPost = saveProductHuntPostToDatabase;
export const checkProductHuntCollabExists = checkIfProductHuntCollabExists;
export const saveProductHuntCollab = saveProductHuntCollabToDatabase;

