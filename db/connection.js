import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { logMongoDB, logMongoDBConnected } from '../logs/index.js';
import { setupQueueIndexes } from '../queue/indexes.js';

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
    
    await setupIndexes(db);
    
    logMongoDBConnected();
    return db;
  } catch (error) {
    throw new Error(`MongoDB connection failed: ${error.message}`);
  }
}

async function setupIndexes(db) {
  const COLLECTION_NAME = 'opportunities';
  const problematicIndexes = [
    'subreddit_1_author_1_title_1',
    'source_1_author_1_title_1'
  ];
  
  for (const indexName of problematicIndexes) {
    try {
      await db.collection(COLLECTION_NAME).dropIndex(indexName);
      logMongoDB(`Dropped problematic index: ${indexName}`);
    } catch (error) {
    }
  }
  
  try {
    await db.collection(COLLECTION_NAME).createIndex({ postId: 1 }, { unique: true });
  } catch (error) {
  }
  
  try {
    await db.collection(COLLECTION_NAME).createIndex({ sourcePlatform: 1 });
  } catch (error) {
  }
  
  try {
    await db.collection(COLLECTION_NAME).createIndex({ sourceContext: 1 });
  } catch (error) {
  }
  
  try {
    await db.collection(COLLECTION_NAME).createIndex({ opportunityScore: 1 });
  } catch (error) {
  }
  
  try {
    await db.collection(COLLECTION_NAME).createIndex({ sentAt: 1 });
  } catch (error) {
  }
  
  try {
    await db.collection(COLLECTION_NAME).createIndex({ feedbackStatus: 1, sentAt: -1 });
  } catch (error) {
  }
  
  try {
    await db.collection(COLLECTION_NAME).createIndex({ createdAt: 1 });
  } catch (error) {
  }
  
  const ingestionCollections = [
    'reddit_ingestion',
    'github_ingestion',
    'hackernews_hiring_ingestion',
    'hackernews_jobs_ingestion',
    'producthunt_ingestion'
  ];
  
  for (const collectionName of ingestionCollections) {
    const collection = db.collection(collectionName);
    
    try {
      await collection.createIndex({ postId: 1 }, { unique: true });
    } catch (error) {
    }
    
    try {
      await collection.createIndex({ contentHash: 1 });
    } catch (error) {
    }
    
    try {
      await collection.createIndex({ createdAt: 1 });
    } catch (error) {
    }
  }
  
  // Setup queue indexes
  try {
    await setupQueueIndexes();
  } catch (error) {
    logMongoDB(`Warning: Could not setup queue indexes: ${error.message}`);
  }
}

export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

export function getDB() {
  return db;
}

