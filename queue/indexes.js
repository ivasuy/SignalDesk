import { connectDB } from '../db/connection.js';
import { logQueue, logError } from '../logs/index.js';

export async function setupQueueIndexes() {
  try {
    const db = await connectDB();

    try {
      await db.collection('delivery_queue').createIndex({ sent: 1 });
      logQueue('Created index: delivery_queue.sent');
    } catch (error) {}

    try {
      await db.collection('delivery_queue').createIndex({ earliestSendAt: 1 });
      logQueue('Created index: delivery_queue.earliestSendAt');
    } catch (error) {}

    try {
      await db.collection('delivery_queue').createIndex({ sourcePlatform: 1 });
      logQueue('Created index: delivery_queue.sourcePlatform');
    } catch (error) {}

    try {
      await db.collection('delivery_queue').createIndex({ lockedUntil: 1 });
      logQueue('Created index: delivery_queue.lockedUntil');
    } catch (error) {}

    try {
      await db.collection('delivery_queue').createIndex({ postId: 1 });
      logQueue('Created index: delivery_queue.postId');
    } catch (error) {}

    try {
      await db.collection('delivery_state').createIndex({ date: 1 }, { unique: true });
      logQueue('Created index: delivery_state.date (unique)');
    } catch (error) {}

    try {
      await db.collection('classification_buffer').createIndex({ postId: 1 }, { unique: true });
      logQueue('Created index: classification_buffer.postId (unique)');
    } catch (error) {}

    try {
      await db.collection('classification_buffer').createIndex({ classified: 1, bufferedAt: 1 });
      logQueue('Created index: classification_buffer.classified+bufferedAt');
    } catch (error) {}

    logQueue('Queue indexes setup complete');
  } catch (error) {
    logError(`Error setting up queue indexes: ${error.message}`);
    throw error;
  }
}

