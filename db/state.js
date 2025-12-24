import { connectDB } from './connection.js';
import { logInfo, logError } from '../logs/index.js';

export async function getDeliveryState() {
  try {
    const db = await connectDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const state = await db.collection('delivery_state').findOne({
      date: today
    });

    if (state) {
      return state;
    }

    const newState = {
      date: today,
      lastGlobalSentAt: null,
      lastOpportunitySentAt: null,
      lastPlatformSentAt: null,
      currentPlatform: null,
      platformDailyCounts: {
        reddit: 0,
        github: 0,
        hn: 0,
        producthunt: 0
      }
    };

    await db.collection('delivery_state').insertOne(newState);
    logInfo('Initialized new delivery state for today');

    return newState;
  } catch (error) {
    logError(`Error getting delivery state: ${error.message}`, {
      platform: 'N/A',
      stage: 'delivery_state',
      postId: 'N/A',
      action: 'throw'
    });
    throw error;
  }
}

export async function updateDeliveryState(platform) {
  try {
    const db = await connectDB();
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const platformKey = platform === 'hackernews' ? 'hn' : platform;

    await db.collection('delivery_state').updateOne(
      { date: today },
      {
        $set: {
          lastGlobalSentAt: now,
          lastOpportunitySentAt: now,
          lastPlatformSentAt: now,
          currentPlatform: platform
        },
        $inc: {
          [`platformDailyCounts.${platformKey}`]: 1
        }
      },
      { upsert: true }
    );

  } catch (error) {
    logError(`Error updating delivery state: ${error.message}`, {
      platform: 'N/A',
      stage: 'delivery_state',
      postId: 'N/A',
      action: 'throw'
    });
    throw error;
  }
}

export async function resetDailyState() {
  try {
    const db = await connectDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newState = {
      date: today,
      lastGlobalSentAt: null,
      lastOpportunitySentAt: null,
      lastPlatformSentAt: null,
      currentPlatform: null,
      platformDailyCounts: {
        reddit: 0,
        github: 0,
        hn: 0,
        producthunt: 0
      }
    };

    await db.collection('delivery_state').updateOne(
      { date: today },
      { $set: newState },
      { upsert: true }
    );

    logInfo('Reset daily delivery state');
  } catch (error) {
    logError(`Error resetting daily state: ${error.message}`, {
      platform: 'N/A',
      stage: 'delivery_state',
      postId: 'N/A',
      action: 'throw'
    });
    throw error;
  }
}

