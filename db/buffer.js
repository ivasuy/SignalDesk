import { connectDB } from './connection.js';

const COLLECTION_NAME = 'opportunities';
import { logError } from '../logs/index.js';

export async function addToClassificationBuffer(postData) {
  try {
    const db = await connectDB();
    const { postId, sourcePlatform, sourceContext, title, content, author, createdAt, permalink } = postData;

    if (!postId || !sourcePlatform || !title) {
      throw new Error('postId, sourcePlatform, and title are required');
    }

    const existingPost = await db.collection(COLLECTION_NAME).findOne({
      postId,
      $or: [
        { sentAt: { $ne: null } },
        { actionDecision: { $ne: 'reject' } }
      ]
    });

    if (existingPost) {
      return { buffered: false, reason: 'already_processed' };
    }

    const existingInBuffer = await db.collection('classification_buffer').findOne({
      postId,
      classified: false
    });

    if (existingInBuffer) {
      return { buffered: false, reason: 'already_in_buffer' };
    }

    const bufferItem = {
      postId,
      sourcePlatform,
      sourceContext: sourceContext || 'unknown',
      title,
      content: content || '',
      author: author || 'unknown',
      permalink: permalink || '',
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      bufferedAt: new Date(),
      classified: false
    };

    await db.collection('classification_buffer').updateOne(
      { postId },
      { $set: bufferItem },
      { upsert: true }
    );

    return { buffered: true };
  } catch (error) {
    logError(`Error adding to classification buffer: ${error.message}`);
    throw error;
  }
}

export async function getUnclassifiedBatch(limit = 5) {
  try {
    const db = await connectDB();
    const items = await db.collection('classification_buffer')
      .find({ classified: false })
      .sort({ bufferedAt: 1 })
      .limit(limit)
      .toArray();

    return items;
  } catch (error) {
    logError(`Error getting unclassified batch: ${error.message}`);
    throw error;
  }
}

export async function markAsClassified(postId, classificationResult) {
  try {
    const db = await connectDB();
    await db.collection('classification_buffer').updateOne(
      { postId },
      {
        $set: {
          classified: true,
          classificationResult
        }
      }
    );
  } catch (error) {
    logError(`Error marking as classified: ${error.message}`);
    throw error;
  }
}

