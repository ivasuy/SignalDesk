import { connectDB } from './connection.js';
import { logger } from '../utils/logger.js';

function normalizeContent(content) {
  return content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

export function generateContentHash(title, content) {
  const fullText = `${title || ''}\n${content || ''}`;
  const normalized = normalizeContent(fullText);
  return normalized.substring(0, 200);
}

export async function checkIngestionExists(collectionName, postId, contentHash) {
  try {
    const database = await connectDB();
    const collection = database.collection(collectionName);
    
    const existing = await collection.findOne({
      $or: [
        { postId },
        { contentHash }
      ]
    });
    
    return {
      exists: !!existing,
      record: existing
    };
  } catch (error) {
    logger.error.log(`Error checking ingestion: ${error.message}`);
    return { exists: false, record: null };
  }
}

export async function saveIngestionRecord(collectionName, data) {
  try {
    const database = await connectDB();
    const collection = database.collection(collectionName);
    
    const ingestionData = {
      postId: data.postId,
      contentHash: data.contentHash,
      keywordMatched: data.keywordMatched || false,
      aiClassified: data.aiClassified || false,
      createdAt: new Date(),
      ...data.metadata 
    };
    
    await collection.updateOne(
      { postId: data.postId },
      { $set: ingestionData },
      { upsert: true }
    );
  } catch (error) {
    logger.error.log(`Error saving ingestion record: ${error.message}`);
  }
}

export async function markIngestionClassified(collectionName, postId) {
  try {
    const database = await connectDB();
    const collection = database.collection(collectionName);
    
    await collection.updateOne(
      { postId },
      { $set: { aiClassified: true } }
    );
  } catch (error) {
    logger.error.log(`Error marking ingestion as classified: ${error.message}`);
  }
}

