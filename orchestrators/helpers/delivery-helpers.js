import { connectDB } from '../../db/connection.js';
import { saveOpportunityPostToDatabase } from '../../db/posts.js';
import { sendWhatsAppMessage } from '../../integrations/whatsapp/whatsapp.js';
import { logError, logAI } from '../../logs/index.js';
import { markProcessedToday, updatePostAsSent } from './db-helpers.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// MESSAGE BUILDING HELPERS
// ============================================================================

export function getPostDataForSending(post) {
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

export function buildMessageFromPost(post) {
  let message = `Title: ${post.title || 'No title'}\n`;
  
  const platformName = post.sourcePlatform === 'hackernews' ? 'Hacker News' : 
                       post.sourcePlatform === 'producthunt' ? 'Product Hunt' : 
                       post.sourcePlatform === 'github' ? 'GitHub' :
                       post.sourcePlatform.charAt(0).toUpperCase() + post.sourcePlatform.slice(1);
  message += `Platform: ${platformName}\n`;
  
  message += `Category: ${post.category || 'N/A'}\n`;
  
  if (post.sourcePlatform === 'github' && post.sourceContext) {
    message += `Repo: ${post.sourceContext}\n`;
  } else if (post.sourceContext) {
    if (post.sourcePlatform === 'reddit') {
      message += `Subreddit: r/${post.sourceContext}\n`;
    } else if (post.sourcePlatform === 'hackernews') {
      const source = post.sourceContext === 'ask-hiring' ? 'Hiring' : post.sourceContext === 'jobs' ? 'Jobs' : post.sourceContext;
      message += `Source: ${source}\n`;
    }
  }
  
  message += `Link: ${post.permalink || 'No link'}\n`;
  
  const hasReply = post.replyTextSent && post.replyTextSent.trim().length > 0;
  
  if (hasReply) {
    message += `\n---\n\n${post.replyTextSent}`;
  }
  
  return message;
}

export function resolveResumePath(post) {
  if (!post.resumeJSON) {
    return null;
  }
  
  const resumePath = typeof post.resumeJSON === 'string' ? post.resumeJSON : null;
  if (!resumePath) {
    return null;
  }
  
  if (existsSync(resumePath)) {
    return resumePath;
  }
  
  const outputDir = join(__dirname, '..', 'output');
  const filename = resumePath.split('/').pop() || resumePath.split('\\').pop();
  const fullPath = join(outputDir, filename);
  
  if (existsSync(fullPath)) {
    return fullPath;
  }
  
  return null;
}

// ============================================================================
// DELIVERY HELPERS
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function processAndSendPost(post, platform) {
  try {
    await markProcessedToday(post.postId);
    
    await saveOpportunityPostToDatabase({
      postId: post.postId,
      sourcePlatform: platform,
      sourceContext: post.sourceContext || 'unknown',
      title: post.title,
      permalink: post.permalink || '',
      author: post.author || 'unknown',
      selftext: post.content,
      category: post.classification?.category,
      opportunityScore: post.opportunityScore,
      actionDecision: post.actionDecision,
      replyTextSent: post.replyText || '',
      resumeJSON: post.resumeJSON || null
    });
    
    const db = await connectDB();
    const savedPost = await db.collection('opportunities').findOne({ postId: post.postId });
    if (!savedPost) {
      return { success: false, reason: 'not_saved' };
    }
    
    const message = buildMessageFromPost(savedPost);
    const resumePDFPath = resolveResumePath(savedPost);
    const postData = getPostDataForSending(savedPost);
    
    try {
      await sendWhatsAppMessage(message, resumePDFPath, postData);
      await updatePostAsSent(post.postId);
      return { success: true };
    } catch (error) {
      logError(`WhatsApp send failed for ${post.postId}: ${error.message}`, {
        platform,
        stage: 'whatsapp_send',
        postId: post.postId,
        action: 'skip'
      });
      return { success: false, reason: 'whatsapp_error' };
    }
  } catch (error) {
    logError(`Error processing post ${post.postId}: ${error.message}`, {
      platform,
      stage: 'post_processing',
      postId: post.postId,
      action: 'skip'
    });
    return { success: false, reason: 'processing_error' };
  }
}

export async function sendPostsWithDelay(posts, platform) {
  let sent = 0;
  
  for (const post of posts) {
    const result = await processAndSendPost(post, platform);
    
    if (result.success) {
      sent++;
      logAI(`[${platform.toUpperCase()}] Sent ${sent}/${posts.length}: ${post.postId}`);
      await sleep(2000);
    }
  }
  
  return sent;
}
