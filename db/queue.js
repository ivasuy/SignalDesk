import { connectDB } from './connection.js';

const COLLECTION_NAME = 'opportunities';
import { logQueue, logError, logPlatform } from '../logs/index.js';
import { generateContentHash } from './ingestion.js';

const LOCK_DURATION_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000;

export async function enqueueOpportunity(opportunityData) {
  try {
    const db = await connectDB();
    const { postId, sourcePlatform, opportunityScore, title, content } = opportunityData;

    if (!postId || !sourcePlatform) {
      throw new Error('postId and sourcePlatform are required');
    }

    if (opportunityScore < 50) {
      logQueue(`Skipping enqueue: score ${opportunityScore} < 50 for postId ${postId}`);
      return { enqueued: false, reason: 'score_too_low' };
    }

    const existingInQueue = await db.collection('delivery_queue').findOne({
      postId,
      sent: false
    });

    if (existingInQueue) {
      logQueue(`Skipping enqueue: postId ${postId} already in queue`);
      return { enqueued: false, reason: 'already_in_queue' };
    }

    const existingPost = await db.collection(COLLECTION_NAME).findOne({
      postId,
      sentAt: { $ne: null }
    });

    if (existingPost) {
      logQueue(`Skipping enqueue: postId ${postId} already sent`);
      return { enqueued: false, reason: 'already_sent' };
    }

    if (title && content) {
      const contentHash = generateContentHash(title, content);
      const duplicateByHash = await db.collection('delivery_queue').findOne({
        contentHash,
        sent: false
      });

      if (duplicateByHash) {
        logQueue(`Skipping enqueue: duplicate contentHash for postId ${postId}`);
        return { enqueued: false, reason: 'duplicate_content' };
      }
    }

    if (sourcePlatform === 'github' && opportunityData.sourceContext) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const repoSentToday = await db.collection('delivery_queue').findOne({
        sourcePlatform: 'github',
        sourceContext: opportunityData.sourceContext,
        sent: true,
        sentAt: { $gte: today }
      });

      if (repoSentToday) {
        logQueue(`[DEDUP] Skipped github repo ${opportunityData.sourceContext} (already sent today)`);
        return { enqueued: false, reason: 'github_repo_sent_today' };
      }
    }

    const priority = opportunityScore >= 80 ? 'high' : 'normal';
    const now = new Date();
    const delay = 60 * 1000;
    const earliestSendAt = new Date(now.getTime() + delay);
    const queueItem = {
      postId,
      sourcePlatform,
      sourceContext: opportunityData.sourceContext || null,
      priority,
      queuedAt: now,
      earliestSendAt,
      attempts: 0,
      sent: false,
      sentAt: null,
      lockedUntil: null,
      failureReason: null,
      contentHash: title && content ? generateContentHash(title, content) : null
    };

    await db.collection('delivery_queue').insertOne(queueItem);

    if (typeof global.triggerDeliveryCheck === 'function') {
      setTimeout(() => global.triggerDeliveryCheck(), 1000);
    }

    return { enqueued: true, queueItem };
  } catch (error) {
    logError(`Error enqueueing opportunity: ${error.message}`);
    throw error;
  }
}

export async function acquireQueueLock(queueItem) {
  try {
    const db = await connectDB();
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);

    const result = await db.collection('delivery_queue').updateOne(
      {
        _id: queueItem._id,
        $or: [
          { lockedUntil: null },
          { lockedUntil: { $lt: now } }
        ]
      },
      {
        $set: { lockedUntil }
      }
    );

    return result.modifiedCount === 1;
  } catch (error) {
    logError(`Error acquiring queue lock: ${error.message}`);
    return false;
  }
}

export async function releaseQueueLock(queueItemId) {
  try {
    const db = await connectDB();
    await db.collection('delivery_queue').updateOne(
      { _id: queueItemId },
      { $set: { lockedUntil: null } }
    );
  } catch (error) {
    logError(`Error releasing queue lock: ${error.message}`);
  }
}

export async function markQueueItemAsSent(queueItemId, postData, updatePostFn) {
  try {
    const db = await connectDB();
    const now = new Date();
    await db.collection('delivery_queue').updateOne(
      { _id: queueItemId },
      {
        $set: {
          sent: true,
          sentAt: now,
          lockedUntil: null
        }
      }
    );

    if (postData && updatePostFn) {
      await updatePostFn(postData);
    }
  } catch (error) {
    logError(`Error marking queue item as sent: ${error.message}`);
    throw error;
  }
}

export async function handleQueueSendFailure(queueItemId, error) {
  try {
    const db = await connectDB();
    const queueItem = await db.collection('delivery_queue').findOne({ _id: queueItemId });
    
    if (!queueItem) {
      return;
    }

    const newAttempts = queueItem.attempts + 1;

    if (newAttempts >= MAX_ATTEMPTS) {
      await db.collection('delivery_queue').updateOne(
        { _id: queueItemId },
        {
          $set: {
            sent: true,
            failureReason: `Max attempts reached: ${error.message}`,
            lockedUntil: null
          }
        }
      );
      logQueue(`Aborted queue item ${queueItemId}: max attempts reached`);
    } else {
      const now = new Date();
      const earliestSendAt = new Date(now.getTime() + RETRY_DELAY_MS);
      
      await db.collection('delivery_queue').updateOne(
        { _id: queueItemId },
        {
          $set: {
            attempts: newAttempts,
            earliestSendAt,
            lockedUntil: null
          }
        }
      );
      logQueue(`Retry scheduled for queue item ${queueItemId}: attempt ${newAttempts}/${MAX_ATTEMPTS}`);
    }
  } catch (error) {
    logError(`Error handling queue send failure: ${error.message}`);
  }
}

export async function getQueueCandidates(targetPlatform, now) {
  try {
    const db = await connectDB();
    const candidates = await db.collection('delivery_queue')
      .find({
        sent: false,
        sourcePlatform: targetPlatform,
        earliestSendAt: { $lte: now },
        $or: [
          { lockedUntil: null },
          { lockedUntil: { $lt: now } }
        ]
      })
      .sort({ queuedAt: 1 })
      .toArray();

    return candidates;
  } catch (error) {
    logError(`Error getting queue candidates: ${error.message}`);
    return [];
  }
}

export async function getPostForSending(postId) {
  try {
    const db = await connectDB();
    const post = await db.collection(COLLECTION_NAME).findOne({ postId });
    return post;
  } catch (error) {
    logError(`Error getting post for sending: ${error.message}`);
    return null;
  }
}

export async function applyGitHubRepoCollapsing(processedItems) {
  try {
    const db = await connectDB();
    const githubItems = processedItems.filter(item => 
      item.sourcePlatform === 'github' && item.opportunityScore >= 50
    );

    if (githubItems.length === 0) {
      return;
    }

    const repoGroups = {};
    for (const item of githubItems) {
      const repo = item.sourceContext;
      if (!repoGroups[repo]) {
        repoGroups[repo] = [];
      }
      repoGroups[repo].push(item);
    }

    for (const [repo, items] of Object.entries(repoGroups)) {
      if (items.length <= 1) {
        continue;
      }

      items.sort((a, b) => b.opportunityScore - a.opportunityScore);
      const highest = items[0];
      const others = items.slice(1);

      for (const other of others) {
        await db.collection('delivery_queue').deleteOne({ postId: other.postId });
        await db.collection(COLLECTION_NAME).updateOne(
          { postId: other.postId },
          { $set: { actionDecision: 'reject', rejectionReason: 'repo_collapsed' } }
        );
      }

      await db.collection('posts').updateOne(
        { postId: highest.postId },
        { $set: { repoCollapsed: true, repoCollapsedCount: items.length } }
      );
      
      logPlatform(`[GH] Repo collapse applied: ${repo} (${items.length} → 1)`);
      logPlatform(`[GH] This repo has additional issues matching your profile.`);
    }
  } catch (error) {
    logError(`Error applying GitHub repo collapsing: ${error.message}`);
  }
}

