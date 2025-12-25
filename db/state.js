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
      active: true
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


