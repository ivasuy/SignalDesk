import { getUnclassifiedBatch, markAsClassified } from '../db/buffer.js';
import { classifyOpportunity, evaluateHighValue, generateReply, generateCoverLetterAndResume } from '../ai/ai.js';
import { saveOpportunityPostToDatabase } from '../db/posts.js';
import { enqueueOpportunity } from '../db/queue.js';
import { applyGitHubRepoCollapsing } from '../db/queue.js';
import { getOptimalPersona, getOptimalTone } from '../utils/learning.js';
import { calculateBatchSize } from '../utils/utils.js';
import { 
  logClassifier, 
  logAI, 
  logError, 
  logWarn
} from '../logs/index.js';
import { startLoader, stopLoader } from '../logs/loader.js';
import { connectDB } from '../db/connection.js';


const MAX_BATCHES = 5;
const BATCH_DELAY_MS = 2 * 60 * 1000 + Math.random() * 60 * 1000;

let lastWarningRunId = null;

let currentRun = {
  initialBufferSize: 0,
  batchSize: 0,
  totalBatches: 0,
  currentBatchNumber: 0,
  runId: null
};

async function processBatchItem(bufferItem, runId) {
  try {
    const fullText = `Title: ${bufferItem.title}\n\nContent: ${bufferItem.content}`;
    const classification = await classifyOpportunity(
      fullText, 
      bufferItem.postId, 
      bufferItem.sourcePlatform || 'unknown',
      bufferItem.sourceContext || ''
    );
    
    await markAsClassified(bufferItem.postId, {
      valid: classification.valid,
      category: classification.category,
      opportunityScore: classification.opportunityScore,
      reasoning: classification.reasoning
    });

    if (!classification.valid || classification.opportunityScore < 50) {
      await saveOpportunityPostToDatabase({
        postId: bufferItem.postId,
        sourcePlatform: bufferItem.sourcePlatform,
        sourceContext: bufferItem.sourceContext,
        title: bufferItem.title,
        permalink: bufferItem.permalink || '',
        author: bufferItem.author,
        selftext: bufferItem.content,
        category: classification.category,
        opportunityScore: classification.opportunityScore,
        actionDecision: 'reject'
      });
      return { processed: true, enqueued: false, opportunityScore: classification.opportunityScore, rejected: true };
    }

    const persona = await getOptimalPersona(bufferItem.sourcePlatform, bufferItem.sourceContext);
    const tone = await getOptimalTone(bufferItem.sourcePlatform, bufferItem.sourceContext);

    let replyText = '';
    let resumeJSON = null;
    let actionDecision = 'reply_only';
    let replyMode = 'outreach';

    if (classification.valid && classification.opportunityScore >= 50) {
      if (bufferItem.sourcePlatform === 'github') {
        logAI(`[COST] Skipped reply — GitHub never generates replies for ${bufferItem.postId}`);
      } else {
        try {
          replyText = await generateReply(
            bufferItem.title,
            bufferItem.content,
            classification.category,
            persona,
            tone
          );
        } catch (error) {
          logError(`Reply error ${bufferItem.postId}: ${error.message}`, { 
            platform: bufferItem.sourcePlatform, 
            stage: 'reply_generation', 
            postId: bufferItem.postId,
            action: 'continue'
          });
        }
      }
    }

    if (bufferItem.sourcePlatform === 'hackernews' && classification.valid) {
      logAI(`[AI] HackerNews accepted → generating resume/cover (always for HN)`);
      actionDecision = 'reply_plus_resume';
      try {
        const { coverLetter, resume } = await generateCoverLetterAndResume(
          bufferItem.title,
          bufferItem.content,
          classification.category
        );
        replyText = coverLetter || replyText;
        resumeJSON = resume;
      } catch (error) {
        logError(`Resume error ${bufferItem.postId}: ${error.message}`, { 
          platform: bufferItem.sourcePlatform, 
          stage: 'resume_generation', 
          postId: bufferItem.postId,
          action: 'fallback enqueue'
        });
      }
    } else if (classification.opportunityScore >= 80) {
      const fullText = `${bufferItem.title}\n\n${bufferItem.content}`;
      const categoryUpper = classification.category?.toUpperCase() || '';
      
      if (bufferItem.sourcePlatform === 'producthunt') {
        logAI(`[AI] High-value rejected → reply only (Product Hunt never generates resumes)`);
      } else if (bufferItem.sourcePlatform === 'github') {
        logAI(`[AI] High-value rejected → no reply (GitHub never generates replies/resumes)`);
      } else if (bufferItem.sourcePlatform === 'reddit') {
        const isHighValue = await evaluateHighValue(fullText, categoryUpper);
        
        if (!isHighValue) {
          logAI(`[AI] High-value rejected → reply only (score=${classification.opportunityScore})`);
        } else {
          logAI(`[AI] High-value confirmed → generating resume/cover`);
          actionDecision = 'reply_plus_resume';
          try {
            const { coverLetter, resume } = await generateCoverLetterAndResume(
              bufferItem.title,
              bufferItem.content,
              classification.category
            );
            replyText = coverLetter;
            resumeJSON = resume;
          } catch (error) {
            logError(`Resume error ${bufferItem.postId}: ${error.message}`, { 
              platform: bufferItem.sourcePlatform, 
              stage: 'resume_generation', 
              postId: bufferItem.postId,
              action: 'fallback enqueue'
            });
          }
        }
      }
    }

    await saveOpportunityPostToDatabase({
      postId: bufferItem.postId,
      sourcePlatform: bufferItem.sourcePlatform,
      sourceContext: bufferItem.sourceContext,
      title: bufferItem.title,
      permalink: bufferItem.permalink || '',
      author: bufferItem.author,
      selftext: bufferItem.content,
      category: classification.category,
      opportunityScore: classification.opportunityScore,
      actionDecision,
      personaUsed: persona,
      toneUsed: tone,
      replyMode,
      replyTextSent: replyText,
      resumeJSON
    });

    const enqueueResult = await enqueueOpportunity({
      postId: bufferItem.postId,
      sourcePlatform: bufferItem.sourcePlatform,
      sourceContext: bufferItem.sourceContext,
      opportunityScore: classification.opportunityScore,
      title: bufferItem.title,
      content: bufferItem.content
    });

    return { 
      processed: true, 
      enqueued: enqueueResult.enqueued,
      opportunityScore: classification.opportunityScore,
      sourcePlatform: bufferItem.sourcePlatform,
      sourceContext: bufferItem.sourceContext,
      actionDecision,
      rejected: false
    };
  } catch (error) {
    logError(`Batch item error ${bufferItem.postId}: ${error.message}`, { 
      platform: bufferItem.sourcePlatform, 
      stage: 'classification', 
      postId: bufferItem.postId,
      action: 'skip'
    });
    return { processed: false, error: error.message };
  }
}


let classificationLoaderActive = false;
let classificationLoaderInterval = null;

function startClassificationSpinner() {
  if (classificationLoaderInterval) {
    return;
  }
  
  classificationLoaderInterval = startLoader('[CLASSIFIER] Processing opportunities');
}

function stopClassificationSpinner() {
  if (classificationLoaderInterval) {
    stopLoader();
    classificationLoaderInterval = null;
  }
}

export async function processClassificationBatch() {
  const batchStartTime = Date.now();
  
  if (!classificationLoaderActive) {
    classificationLoaderActive = true;
    startClassificationSpinner();
  }
  
  try {
    let db;
    try {
      db = await connectDB();
    } catch (error) {
      logError(`MongoDB connection error in classifier: ${error.message}`, {
        platform: 'N/A',
        stage: 'classification_batch',
        postId: 'N/A',
        action: 'retry'
      });
      return { processed: 0, error: 'db_connection_error' };
    }
    
    let remainingBuffer;
    try {
      remainingBuffer = await db.collection('classification_buffer').countDocuments({ classified: false });
    } catch (error) {
      logError(`Error counting buffer: ${error.message}`, {
        platform: 'N/A',
        stage: 'classification_batch',
        postId: 'N/A',
        action: 'retry'
      });
      return { processed: 0, error: 'db_query_error' };
    }
    
    if (remainingBuffer === 0) {
      currentRun = {
        initialBufferSize: 0,
        batchSize: 0,
        totalBatches: 0,
        currentBatchNumber: 0,
        runId: null
      };
      return { processed: 0 };
    }
    
    if (currentRun.runId === null || currentRun.currentBatchNumber >= currentRun.totalBatches) {
      currentRun.initialBufferSize = remainingBuffer;
      const { batchSize, estimatedBatches } = calculateBatchSize(remainingBuffer, MAX_BATCHES);
      currentRun.batchSize = batchSize;
      currentRun.totalBatches = estimatedBatches;
      currentRun.currentBatchNumber = 0;
      currentRun.runId = `run-${Date.now()}`;
      
      if (remainingBuffer > 50 && lastWarningRunId !== currentRun.runId) {
        logWarn(`Classification buffer high (${remainingBuffer}). Using batchSize=${batchSize} to cap batches at ${MAX_BATCHES}.`);
        lastWarningRunId = currentRun.runId;
      }
    }
    
    currentRun.currentBatchNumber++;
    
    if (currentRun.currentBatchNumber > currentRun.totalBatches) {
      currentRun = {
        initialBufferSize: 0,
        batchSize: 0,
        totalBatches: 0,
        currentBatchNumber: 0,
        runId: null
      };
      return { processed: 0 };
    }
    
    const batch = await getUnclassifiedBatch(currentRun.batchSize);
    
    if (batch.length === 0) {
      if (classificationLoaderActive) {
        stopClassificationSpinner();
        classificationLoaderActive = false;
      }
      currentRun = {
        initialBufferSize: 0,
        batchSize: 0,
        totalBatches: 0,
        currentBatchNumber: 0,
        runId: null
      };
      return { processed: 0 };
    }

    const sourcePlatforms = [...new Set(batch.map(item => item.sourcePlatform))];
    const batchSize = batch.length;

    if (classificationLoaderActive) {
      stopClassificationSpinner();
      classificationLoaderActive = false;
    }

    logClassifier(`Processing batch ${currentRun.currentBatchNumber}/${currentRun.totalBatches} (${batchSize} items)`);

    let processed = 0;
    let enqueued = 0;
    let rejected = 0;
    let accepted = 0;
    const processedItems = [];

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const result = await processBatchItem(item, currentRun.runId);
      
      if (result.processed) {
        processed++;
        if (result.rejected) {
          rejected++;
        } else {
          accepted++;
        }
        if (result.enqueued) {
          enqueued++;
          processedItems.push({
            postId: item.postId,
            sourcePlatform: result.sourcePlatform || item.sourcePlatform,
            sourceContext: result.sourceContext || item.sourceContext,
            opportunityScore: result.opportunityScore || 0
          });
        }
      }
      
      if ((i + 1) % 10 === 0 || i === batch.length - 1) {
        process.stdout.write(`\r[CLASSIFIER] Progress: ${i + 1} / ${batchSize}`);
      }
    }
    
    process.stdout.write('\n');
    logClassifier(`[CLASSIFIER] Batch ${currentRun.currentBatchNumber}/${currentRun.totalBatches} complete — accepted=${accepted} rejected=${rejected} enqueued=${enqueued}`);

    await applyGitHubRepoCollapsing(processedItems);

    const batchDuration = Date.now() - batchStartTime;
    
    if (classificationLoaderActive && currentRun.currentBatchNumber >= currentRun.totalBatches) {
      stopClassificationSpinner();
      classificationLoaderActive = false;
    }
    
    logClassifier('', { renderBatch: {
      batchNumber: currentRun.currentBatchNumber,
      totalBatches: currentRun.totalBatches,
      batchSize: currentRun.batchSize,
      platforms: sourcePlatforms,
      processed,
      accepted,
      rejected,
      enqueued,
      duration: batchDuration
    }});

    return { processed, enqueued };
  } catch (error) {
    logError(`Batch error: ${error.message}`, { stage: 'classification_batch', action: 'retry' });
    return { processed: 0, error: error.message };
  }
}

export function startClassifierWorker() {
  logClassifier(`Starting classifier worker (max batches: ${MAX_BATCHES}, dynamic batch size)`);

  const processWithDelay = async () => {
    await processClassificationBatch();
    setTimeout(processWithDelay, BATCH_DELAY_MS);
  };

  processWithDelay();

  return { stop: () => {} };
}

