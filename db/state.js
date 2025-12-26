import { connectDB } from './connection.js';
import { logInfo, logError } from '../logs/index.js';

export async function getDailyDeliveryState() {
  try {
    const db = await connectDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const state = await db.collection('daily_delivery_state').findOne({
      date: today
    });

    if (state) {
      return state;
    }

    const newState = {
      date: today,
      active: true,
      processingCompleted: false,
      completedAt: null
    };

    await db.collection('daily_delivery_state').insertOne(newState);
    logInfo('Initialized new daily delivery state for today');

    return newState;
  } catch (error) {
    logError(`Error getting daily delivery state: ${error.message}`, {
      platform: 'N/A',
      stage: 'daily_delivery_state',
      postId: 'N/A',
      action: 'throw'
    });
    throw error;
  }
}

export async function isDailyProcessingCompleted() {
  try {
    const db = await connectDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const state = await db.collection('daily_delivery_state').findOne({
      date: today,
      processingCompleted: true
    });

    return !!state;
  } catch (error) {
    logError(`Error checking daily processing completion: ${error.message}`, {
      platform: 'N/A',
      stage: 'daily_delivery_state',
      postId: 'N/A',
      action: 'throw'
    });
    return false;
  }
}

export async function markDailyProcessingCompleted() {
  try {
    const db = await connectDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await db.collection('daily_delivery_state').updateOne(
      { date: today },
      {
        $set: {
          processingCompleted: true,
          completedAt: new Date()
        }
      },
      { upsert: true }
    );

    logInfo('Marked daily processing as completed for today');
  } catch (error) {
    logError(`Error marking daily processing as completed: ${error.message}`, {
      platform: 'N/A',
      stage: 'daily_delivery_state',
      postId: 'N/A',
      action: 'throw'
    });
    throw error;
  }
}

export async function markPlatformIngestionComplete(platform) {
  try {
    const db = await connectDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const platformMap = {
      'reddit': 'reddit',
      'producthunt': 'producthunt',
      'hn': 'hackernews',
      'github': 'github'
    };

    const platformKey = platformMap[platform] || platform;
    const updateKey = `platforms.${platformKey}.ingestionComplete`;

    await db.collection('daily_delivery_state').updateOne(
      { date: today },
      {
        $set: {
          [updateKey]: true,
          [`platforms.${platformKey}.completedAt`]: new Date()
        }
      },
      { upsert: true }
    );

    // Check if all platforms are complete
    const state = await db.collection('daily_delivery_state').findOne({ date: today });
    if (state && state.platforms) {
      const allPlatforms = ['reddit', 'hackernews', 'producthunt', 'github'];
      const allComplete = allPlatforms.every(p => state.platforms[p]?.ingestionComplete === true);
      return allComplete;
    }

    return false;
  } catch (error) {
    logError(`Error marking platform ingestion complete: ${error.message}`, {
      platform: 'N/A',
      stage: 'daily_delivery_state',
      postId: 'N/A',
      action: 'throw'
    });
    return false;
  }
}


