import { sendWhatsAppMessage } from '../integrations/whatsapp/whatsapp.js';
import { updateOpportunityPostAfterSending } from '../db/posts.js';
import { 
  acquireQueueLock, 
  releaseQueueLock, 
  markQueueItemAsSent, 
  handleQueueSendFailure,
  getPostForSending
} from '../db/queue.js';
import { canSendMessage } from './constraints.js';
import { updateDeliveryState, getDeliveryState } from '../db/state.js';
import { 
  logQueue, 
  logError, 
  formatISTTime,
  logWarn
} from '../logs/index.js';
import { connectDB } from '../db/connection.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPostDataForSending(post) {
  if (!post) {
    return null;
  }

  return {
    postId: post.postId,
    replyTextSent: post.replyTextSent || '',
    personaUsed: post.personaUsed || 'engineer',
    toneUsed: post.toneUsed || 'professional',
    replyMode: post.replyMode || null,
    actionDecision: post.actionDecision || 'reply_only',
    resumeJSON: post.resumeJSON || null
  };
}

function buildMessageFromPost(post) {
  let message = `Title: ${post.title || 'No title'}\n`;
  message += `Platform: ${post.sourcePlatform === 'hackernews' ? 'Hacker News' : post.sourcePlatform === 'producthunt' ? 'Product Hunt' : post.sourcePlatform.charAt(0).toUpperCase() + post.sourcePlatform.slice(1)}\n`;
  
  if (post.category) {
    message += `Category: ${post.category}\n`;
  }
  
  if (post.sourceContext) {
    if (post.sourcePlatform === 'reddit') {
      message += `Subreddit: r/${post.sourceContext}\n`;
    } else if (post.sourcePlatform === 'github') {
      message += `Repo: ${post.sourceContext}\n`;
    } else if (post.sourcePlatform === 'hackernews') {
      const source = post.sourceContext === 'ask-hiring' ? 'Hiring' : post.sourceContext === 'jobs' ? 'Jobs' : post.sourceContext;
      message += `Source: ${source}\n`;
    } else if (post.sourcePlatform === 'producthunt') {
      message += `Product: ${post.title}\n`;
    }
  }
  
  message += `Link: ${post.permalink || 'No link'}\n`;
  
  const hasResume = post.resumeJSON && typeof post.resumeJSON === 'string';
  const isCoverLetterWithResume = post.actionDecision === 'reply_plus_resume' && hasResume;
  
  if (post.replyTextSent && post.replyTextSent.trim().length > 0) {
    if (isCoverLetterWithResume) {
      message += `\n---\n\n${post.replyTextSent}`;
    } else if (post.actionDecision === 'reply_only') {
      message += `\n---\n\n${post.replyTextSent}`;
    }
  }
  
  return message;
}

async function processQueueItem(queueItem, totalPending, currentSent) {
  try {
    const lockAcquired = await acquireQueueLock(queueItem);
    if (!lockAcquired) {
      logQueue(`[QUEUE] Skipped postId=${queueItem.postId} reason=locked`);
      return false;
    }

    const now = new Date();
    if (queueItem.earliestSendAt > now) {
      await releaseQueueLock(queueItem._id);
      const nextAt = formatISTTime(queueItem.earliestSendAt);
      logQueue(`[QUEUE] Skipped postId=${queueItem.postId} reason=not_due_yet nextAt=${nextAt}`);
      return false;
    }

    const constraintCheck = await canSendMessage(queueItem.sourcePlatform);
    if (!constraintCheck.canSend) {
      await releaseQueueLock(queueItem._id);
      let skipMsg = `[QUEUE] Skipped postId=${queueItem.postId} reason=${constraintCheck.reason}`;
      if (constraintCheck.reason === 'global_cooldown' && constraintCheck.remaining) {
        skipMsg += ` remaining=${constraintCheck.remaining}s`;
      }
      logQueue(skipMsg);
      return false;
    }

    const post = await getPostForSending(queueItem.postId);
    if (!post) {
      await releaseQueueLock(queueItem._id);
      logQueue(`[QUEUE] Skipped postId=${queueItem.postId} reason=post_not_found`);
      return false;
    }

    const message = buildMessageFromPost(post);
    
    let resumePDFPath = null;
    if (post.resumeJSON) {
      const resumePath = typeof post.resumeJSON === 'string' ? post.resumeJSON : null;
      if (resumePath) {
        if (existsSync(resumePath)) {
          resumePDFPath = resumePath;
        } else {
          const outputDir = join(__dirname, '..', 'output');
          const filename = resumePath.split('/').pop() || resumePath.split('\\').pop();
          const fullPath = join(outputDir, filename);
          if (existsSync(fullPath)) {
            resumePDFPath = fullPath;
          } else {
            logError(`Resume file not found: ${resumePath} or ${fullPath}`, {
              platform: post.sourcePlatform || 'N/A',
              stage: 'resume_attachment',
              postId: post.postId || 'N/A',
              action: 'skip'
            });
          }
        }
      }
    }
    
    if (post.actionDecision === 'reply_plus_resume' && !resumePDFPath) {
      logError(`Resume expected but not found for postId=${post.postId}`, {
        platform: post.sourcePlatform || 'N/A',
        stage: 'resume_attachment',
        postId: post.postId || 'N/A',
        action: 'continue'
      });
    }
    
    const postData = getPostDataForSending(post);
    const hasResume = resumePDFPath !== null;
    const hasReply = post.replyTextSent && post.replyTextSent.trim().length > 0;

    try {
      await sendWhatsAppMessage(message, resumePDFPath, postData);
      
      if (hasResume) {
        logQueue(`[DELIVERY] Resume attached for postId=${queueItem.postId}`);
      }
      
      if (hasReply) {
        logQueue(`[DELIVERY] Reply/Cover letter included for postId=${queueItem.postId}`);
      }
      
      const attachments = `resume=${hasResume ? 'yes' : 'no'} reply=${hasReply ? 'yes' : 'no'}`;
      logQueue(`[DELIVERY] Attachments: ${attachments}`);
      
      await markQueueItemAsSent(queueItem._id, postData, updateOpportunityPostAfterSending);
      await updateDeliveryState(queueItem.sourcePlatform);
      
      const newSent = currentSent + 1;
      process.stdout.write(`\r[DELIVERY] Sending ${newSent} / ${totalPending}`);
      
      return true;
    } catch (sendError) {
      await handleQueueSendFailure(queueItem._id, sendError);
      logError(`Failed to send queue item ${queueItem._id}: ${sendError.message}`, {
        platform: queueItem.sourcePlatform || 'N/A',
        stage: 'queue_send',
        postId: queueItem.postId || 'N/A',
        action: 'retry'
      });
      return false;
    }
  } catch (error) {
    await releaseQueueLock(queueItem._id);
    logError(`Error processing queue item ${queueItem._id}: ${error.message}`, {
      platform: queueItem.sourcePlatform || 'N/A',
      stage: 'queue_item_processing',
      postId: queueItem.postId || 'N/A',
      action: 'skip'
    });
    return false;
  }
}

let deliveryTriggerCallback = null;

export function setDeliveryTrigger(callback) {
  deliveryTriggerCallback = callback;
}

export async function processQueue() {
  let currentSentCount = 0;
  
  try {
    const now = new Date();
    const db = await connectDB();
    
    const totalPending = await db.collection('delivery_queue').countDocuments({ sent: false });
    const totalSent = await db.collection('delivery_queue').countDocuments({ sent: true });
    
    if (totalPending === 0) {
      process.stdout.write('\r[DELIVERY] Idle — waiting for next eligible send');
      currentSentCount = 0;
      return { processed: 0, reason: 'no_pending' };
    }

    let allCandidates;
    try {
      allCandidates = await db.collection('delivery_queue')
        .find({
          sent: false,
          earliestSendAt: { $lte: now },
          $or: [
            { lockedUntil: null },
            { lockedUntil: { $lt: now } }
          ]
        })
        .sort({ priority: -1, queuedAt: 1 })
        .toArray();
    } catch (error) {
      logError(`Error fetching queue candidates: ${error.message}`, {
        platform: 'N/A',
        stage: 'queue_processing',
        postId: 'N/A',
        action: 'retry'
      });
      return { processed: 0, reason: 'db_query_error' };
    }

    if (allCandidates.length === 0) {
      process.stdout.write('\r[DELIVERY] Idle — waiting for next eligible send');
      return { processed: 0, reason: 'no_eligible_candidates' };
    }
    
    const MIN_SEND_DELAY_MS = 60 * 1000;
    
    let deliveryState;
    try {
      deliveryState = await getDeliveryState();
    } catch (error) {
      deliveryState = { lastGlobalSentAt: null };
    }
    
    if (deliveryState.lastGlobalSentAt) {
      const timeSinceLastSend = now.getTime() - deliveryState.lastGlobalSentAt.getTime();
      if (timeSinceLastSend < MIN_SEND_DELAY_MS) {
        const remaining = Math.ceil((MIN_SEND_DELAY_MS - timeSinceLastSend) / 1000);
        process.stdout.write(`\r[DELIVERY] Waiting ${remaining}s before next send (60s minimum)`);
        return { processed: 0, reason: 'cooldown', remaining };
      }
    }
    
    let sentToday;
    try {
      sentToday = await db.collection('delivery_queue').countDocuments({ 
        sent: true,
        sentAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      });
    } catch (error) {
      sentToday = 0;
    }

    let queueItem = allCandidates[0];
    
    const recentPlatforms = await db.collection('delivery_queue')
      .find({ sent: true, sentAt: { $gte: new Date(now.getTime() - 2 * 60 * 1000) } })
      .sort({ sentAt: -1 })
      .limit(2)
      .toArray();
    
    const recentPlatformSet = new Set(recentPlatforms.map(r => r.sourcePlatform));
    
    if (recentPlatformSet.has('github') && recentPlatformSet.size === 1 && queueItem.sourcePlatform === 'github') {
      const nonGithub = allCandidates.find(c => c.sourcePlatform !== 'github');
      if (nonGithub) {
        queueItem = nonGithub;
      }
    }

    if (!queueItem) {
      return { processed: 0 };
    }

    const success = await processQueueItem(queueItem, totalPending, sentToday);
    
    if (success) {
      process.stdout.write(`\r[QUEUE] Sending ${sentToday + 1}/${totalPending} — next send in 60s`);
    }

    return { processed: success ? 1 : 0, success };
  } catch (error) {
    logError(`Error processing queue: ${error.message}`, {
      platform: 'N/A',
      stage: 'queue_processing',
      postId: 'N/A',
      action: 'retry'
    });
    return { processed: 0, error: error.message };
  }
}

async function logQueueBacklog() {
  try {
    let db;
    try {
      db = await connectDB();
    } catch (error) {
      logError(`MongoDB connection error in backlog: ${error.message}`, {
        platform: 'N/A',
        stage: 'queue_logging',
        postId: 'N/A',
        action: 'skip'
      });
      return;
    }
    
    let pendingCount;
    try {
      pendingCount = await db.collection('delivery_queue').countDocuments({ sent: false });
    } catch (error) {
      logError(`Error counting pending items: ${error.message}`, {
        platform: 'N/A',
        stage: 'queue_logging',
        postId: 'N/A',
        action: 'skip'
      });
      return;
    }
    const highPriorityCount = await db.collection('delivery_queue').countDocuments({ 
      sent: false, 
      priority: 'high' 
    });
    
    if (pendingCount > 20) {
      logWarn(`Delivery queue pending > 20 (${pendingCount}). Consider increasing send frequency.`);
    }
    
    const upcomingItems = await db.collection('delivery_queue')
      .find({ sent: false })
      .sort({ earliestSendAt: 1 })
      .limit(3)
      .toArray();
    
    const platformCounts = {};
    const platforms = ['reddit', 'github', 'hn', 'producthunt'];
    for (const platform of platforms) {
      const count = await db.collection('delivery_queue').countDocuments({ 
        sent: false, 
        sourcePlatform: platform 
      });
      const key = platform === 'hn' ? 'hn' : platform;
      platformCounts[key] = count;
    }
    
    const upcoming = upcomingItems.map(item => ({
      time: formatISTTime(item.earliestSendAt),
      platform: item.sourcePlatform === 'hackernews' ? 'HN' : item.sourcePlatform.toUpperCase().substring(0, 2),
      postId: item.postId
    }));
    
    logQueue('', { renderQueue: {
      pending: pendingCount,
      highPriority: highPriorityCount,
      upcoming,
      platforms: platformCounts
    }});
  } catch (error) {
    logError(`Error logging queue backlog: ${error.message}`, {
      platform: 'N/A',
      stage: 'queue_logging',
      postId: 'N/A',
      action: 'skip'
    });
  }
}

export function startQueueWorker() {
  logQueue('Starting queue worker (60s interval)');
  
  global.triggerDeliveryCheck = async () => {
    await processQueue();
  };
  
  processQueue().catch(error => {
    logError(`Queue worker error: ${error.message}`, {
      platform: 'N/A',
      stage: 'queue_worker',
      postId: 'N/A',
      action: 'retry'
    });
  });

  const intervalId = setInterval(async () => {
    await processQueue();
  }, 60 * 1000);

  const backlogIntervalId = setInterval(async () => {
    await logQueueBacklog();
  }, 5 * 60 * 1000);

  return { main: intervalId, backlog: backlogIntervalId };
}

