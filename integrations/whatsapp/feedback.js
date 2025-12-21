import { connectDB } from '../../db/connection.js';
import { logger } from '../../utils/logger.js';

const FEEDBACK_OPTIONS = {
  'A': 'no_response',
  'B': 'rejected',
  'C': 'replied',
  'D': 'call',
  'E': 'hired'
};

/**
 * Send daily batch feedback form for all pending opportunities
 */
export async function sendDailyFeedbackForm(client, formatPhoneNumber) {
  if (!client) {
    throw new Error('WhatsApp client is not ready');
  }

  try {
    const receiverNumber = process.env.RECEIVER_WHATSAPP_NUMBER;
    if (!receiverNumber) {
      throw new Error('RECEIVER_WHATSAPP_NUMBER not set in .env');
    }
    
    const db = await connectDB();
    const chatId = formatPhoneNumber(receiverNumber);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const pendingOpportunities = await db.collection('posts').find({
      feedbackStatus: 'pending',
      sentAt: { $gte: today }
    }).sort({ sentAt: 1 }).toArray();
    
    if (pendingOpportunities.length === 0) {
      logger.whatsapp.log('No pending opportunities for feedback today');
      return;
    }
    
    let message = `📋 FEEDBACK FORM\n`;
    message += `Just reply with choice option\n\n`;
    
    pendingOpportunities.forEach((opp, index) => {
      const num = index + 1;
      const platform = opp.sourcePlatform || 'unknown';
      const title = opp.title || 'Untitled';
      const link = opp.permalink || 'No link';
      
      message += `${num}. ${title}\n`;
      message += `   Platform: ${platform}\n`;
      message += `   Link: ${link}\n\n`;
    });
    
    message += `---\n\n`;
    message += `FEEDBACK OPTIONS:\n`;
    message += `[A] No response yet\n`;
    message += `[B] Rejected\n`;
    message += `[C] Got a reply\n`;
    message += `[D] Call scheduled\n`;
    message += `[E] Hired / Collab started\n\n`;
    message += `REPLY FORMAT:\n`;
    message += `First the job opportunity number (1, 2, 3...), then the feedback option letter (A, B, C, D, or E)\n\n`;
    message += `Examples:\n`;
    message += `• "1 A" - No response yet for opportunity #1\n`;
    message += `• "2 B" - Rejected for opportunity #2\n`;
    message += `• "3 C" - Got a reply for opportunity #3\n`;
    
    try {
      await client.sendMessage(chatId, message);
      logger.whatsapp.log(`Sent daily feedback form for ${pendingOpportunities.length} opportunities`);
      
      const postIds = pendingOpportunities.map(opp => opp.postId);
      await db.collection('posts').updateMany(
        { postId: { $in: postIds } },
        { $set: { feedbackRequestedAt: new Date() } }
      );
    } catch (sendError) {
      if (sendError.message.includes('LID')) {
        const numberOnly = receiverNumber.replace(/[^\d]/g, '');
        const alternativeChatId = `${numberOnly}@s.whatsapp.net`;
        await client.sendMessage(alternativeChatId, message);
        logger.whatsapp.log('Feedback form sent (alternative format)');
        
        const postIds = pendingOpportunities.map(opp => opp.postId);
        await db.collection('posts').updateMany(
          { postId: { $in: postIds } },
          { $set: { feedbackRequestedAt: new Date() } }
        );
      } else {
        throw sendError;
      }
    }
  } catch (error) {
    throw new Error(`Failed to send daily feedback form: ${error.message}`);
  }
}

/**
 * Setup feedback message handler
 */
export function setupFeedbackHandler(client, formatPhoneNumber) {
  if (!client) return;
  
  client.on('message', async (message) => {
    try {
      const receiverNumber = process.env.RECEIVER_WHATSAPP_NUMBER;
      if (!receiverNumber) return;
      
      const chatId = formatPhoneNumber(receiverNumber);
      const messageChatId = message.from;
      
      if (messageChatId !== chatId && !messageChatId.includes(receiverNumber.replace(/[^\d]/g, ''))) {
        return;
      }
      
      const body = message.body?.trim();
      if (!body) return;
      
      const match = body.match(/^(\d+)\s+([A-E])$/i);
      if (!match) {
        if (body.length === 1 && ['A', 'B', 'C', 'D', 'E'].includes(body.toUpperCase())) {
          await processFeedback(body.toUpperCase(), null);
        }
        return;
      }
      
      const opportunityNum = parseInt(match[1], 10);
      const feedbackLetter = match[2].toUpperCase();
      
      await processFeedback(feedbackLetter, opportunityNum);
    } catch (error) {
      logger.error.log(`Error processing feedback: ${error.message}`);
    }
  });
}

/**
 * Process feedback response
 */
async function processFeedback(feedbackLetter, opportunityNum) {
  try {
    const db = await connectDB();
    
    const feedbackMap = {
      'A': 'no_response',
      'B': 'rejected',
      'C': 'replied',
      'D': 'call',
      'E': null
    };
    
    const feedbackValue = feedbackMap[feedbackLetter];
    
    let targetPost;
    
    if (opportunityNum !== null) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const pendingOpportunities = await db.collection('posts').find({
        feedbackStatus: 'pending',
        sentAt: { $gte: today }
      }).sort({ sentAt: 1 }).toArray();
      
      if (opportunityNum < 1 || opportunityNum > pendingOpportunities.length) {
        logger.whatsapp.log(`Invalid opportunity number: ${opportunityNum}`);
        return;
      }
      
      targetPost = pendingOpportunities[opportunityNum - 1];
    } else {
      targetPost = await db.collection('posts').findOne(
        { feedbackStatus: 'pending' },
        { sort: { sentAt: -1 } }
      );
    }
    
    if (!targetPost) {
      logger.whatsapp.log('No pending feedback found');
      return;
    }
    
    let finalFeedback = feedbackValue;
    if (feedbackLetter === 'E') {
      finalFeedback = targetPost.category === 'collab' ? 'collab_started' : 'hired';
    }
    
    const now = new Date();
    const sentAt = targetPost.sentAt || targetPost.createdAt;
    const responseDelayHours = sentAt ? ((now - new Date(sentAt)) / (1000 * 60 * 60)) : null;
    
    await db.collection('posts').updateOne(
      { _id: targetPost._id },
      {
        $set: {
          feedbackStatus: 'received',
          userFeedback: finalFeedback,
          responseDelayHours: responseDelayHours
        }
      }
    );
    
    logger.whatsapp.log(`Feedback received for ${targetPost.postId}: ${feedbackLetter} → ${finalFeedback}`);
  } catch (error) {
    logger.error.log(`Error processing feedback: ${error.message}`);
  }
}

