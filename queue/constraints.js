import { getDeliveryState } from '../db/state.js';
import { logQueue, logError } from '../logs/index.js';
import { formatISTTime } from '../logs/index.js';

const MIN_GLOBAL_INTERVAL_MS = 60 * 1000;
const QUIET_HOUR_START = 1;
const QUIET_HOUR_END = 9;

export async function canSendMessage(platform) {
  try {
    const state = await getDeliveryState();
    const now = new Date();

    const currentHour = now.getHours();
    if (currentHour >= QUIET_HOUR_START && currentHour < QUIET_HOUR_END) {
      return { canSend: false, reason: 'quiet_hours' };
    }

    if (state.lastGlobalSentAt) {
      const timeSinceLastGlobal = now.getTime() - state.lastGlobalSentAt.getTime();
      if (timeSinceLastGlobal < MIN_GLOBAL_INTERVAL_MS) {
        const remaining = Math.ceil((MIN_GLOBAL_INTERVAL_MS - timeSinceLastGlobal) / 1000);
        return { canSend: false, reason: 'global_cooldown', remaining };
      }
    }

    return { canSend: true };
  } catch (error) {
    logError(`Error checking constraints: ${error.message}`);
    return { canSend: false, reason: 'error', error: error.message };
  }
}

