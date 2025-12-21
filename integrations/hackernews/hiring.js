import { getNewStories, getTopStories, getItem, getUserSubmissions } from './api.js';
import { 
  saveOpportunityPost
} from '../../db/posts.js';
import { 
  checkIngestionExists,
  saveIngestionRecord,
  markIngestionClassified,
  generateContentHash
} from '../../db/ingestion.js';
import { matchesKeywords, matchesHiringTitle, filterByTimeBuckets, processBatchesSequentially } from '../../utils/utils.js';
import { cleanHTML, cleanTitle } from '../../utils/html-cleaner.js';
import { classifyOpportunity, generateReply, generateCoverLetterAndResume } from '../../ai/ai.js';
import { startLoader, stopLoader } from '../../utils/loader.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.js';
import { logger } from '../../utils/logger.js';
import { getOptimalPersona, getOptimalTone } from '../../utils/learning.js';

async function findLatestHiringPost() {
  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
  
  try {
    const whoishiringSubmissions = await getUserSubmissions('whoishiring');
    
    for (const storyId of whoishiringSubmissions.slice(0, 30)) {
      const story = await getItem(storyId);
      
      if (!story || !story.title || !story.time) continue;
      
      if (story.time < ninetyDaysAgo) continue;
      
      if (matchesHiringTitle(story.title)) {
        logger.hackernews.log(`Found hiring post: "${story.title}"`);
        return story;
      }
    }
  } catch (error) {
    logger.hackernews.log(`Error fetching whoishiring submissions: ${error.message}`);
  }
  
  const [newStoryIds, topStoryIds] = await Promise.all([
    getNewStories(),
    getTopStories()
  ]);
  
  const allStoryIds = [...new Set([...newStoryIds, ...topStoryIds])].slice(0, 500);
  
  for (const storyId of allStoryIds) {
    const story = await getItem(storyId);
    
    if (!story || !story.title || !story.time) continue;
    
    if (story.time < ninetyDaysAgo) continue;
    
    if (matchesHiringTitle(story.title)) {
      logger.hackernews.log(`Found hiring post: "${story.title}"`);
      return story;
    }
  }
  
  return null;
}

async function getTopLevelComments(postId) {
  const post = await getItem(postId);
  if (!post || !post.kids) return [];
  
  const comments = await Promise.all(
    post.kids.slice(0, 100).map(kidId => getItem(kidId))
  );
  
  return comments.filter(comment => 
    comment && 
    !comment.deleted && 
    !comment.dead &&
    comment.text
  );
}

function normalizeComment(comment, parentPost) {
  const cleanedText = cleanHTML(comment.text);
  const title = cleanTitle(cleanedText.split('\n')[0] || cleanedText.substring(0, 200));
  
  return {
    id: `hn-${comment.id}`,
    title: title || 'Hacker News Comment',
    selftext: cleanedText,
    permalink: `https://news.ycombinator.com/item?id=${comment.id}`,
    created_utc: comment.time,
    author: comment.by || 'unknown',
    source: 'hackernews-ask-hiring',
    parentPostTitle: parentPost.title
  };
}

export async function scrapeAskHiring() {
  const stats = {
    scraped: 0,
    keywordFiltered: 0,
    aiClassified: 0,
    opportunities: 0,
    highValue: 0
  };
  
  try {
    const hiringPost = await findLatestHiringPost();
    if (!hiringPost) {
      logger.hackernews.log('No recent "Ask HN: Who is hiring?" post found');
      return stats;
    }
    
    const comments = await getTopLevelComments(hiringPost.id);
    stats.scraped = comments.length;
    logger.hackernews.log(`Processing ${comments.length} comments from "${hiringPost.title}"`);
    
    const timeBuckets = filterByTimeBuckets(comments, 'time');
    
    logger.hackernews.log(`Prioritizing: ${timeBuckets.last24h.length} (last 24h) → ${timeBuckets.oneToTwoDays.length} (1-2 days) → ${timeBuckets.twoToSevenDays.length} (2-7 days)`);
    
    const processComments = async (commentBatch, batchName) => {
      for (const comment of commentBatch) {
        const normalized = normalizeComment(comment, hiringPost);
        
        const contentHash = generateContentHash(normalized.title, normalized.selftext);
        
        const ingestionCheck = await checkIngestionExists('hackernews_hiring_ingestion', normalized.id, contentHash);
        if (ingestionCheck.exists) {
          continue;
        }
        
        const titleMatch = matchesKeywords(normalized.title);
        const bodyMatch = matchesKeywords(normalized.selftext);
        
        if (!titleMatch && !bodyMatch) {
          await saveIngestionRecord('hackernews_hiring_ingestion', {
            postId: normalized.id,
            contentHash,
            keywordMatched: false,
            metadata: {
              author: normalized.author,
              title: normalized.title
            }
          });
          continue;
        }
        
        // Store ingestion record
        await saveIngestionRecord('hackernews_hiring_ingestion', {
          postId: normalized.id,
          contentHash,
          keywordMatched: true,
          metadata: {
            author: normalized.author,
            title: normalized.title
          }
        });
        
        stats.keywordFiltered++;
        
        const fullText = `${normalized.title}\n\n${normalized.selftext}`;
        startLoader(`Classifying Hacker News opportunity...`);
        let classification;
        try {
          classification = await classifyOpportunity(fullText, normalized.id);
          stopLoader();
        } catch (error) {
          stopLoader();
          logger.error.log(`Error classifying opportunity: ${error.message}`);
          continue;
        }
        
        await markIngestionClassified('hackernews_hiring_ingestion', normalized.id);
        
        if (!classification.valid || classification.opportunityScore < 50) {
          await saveOpportunityPost({
            postId: normalized.id,
            sourcePlatform: 'hn',
            sourceContext: 'ask-hiring',
            title: normalized.title,
            permalink: normalized.permalink,
            author: normalized.author,
            selftext: normalized.selftext || '',
            category: classification.category,
            opportunityScore: classification.opportunityScore,
            actionDecision: 'reject'
          });
          continue;
        }
        
        stats.aiClassified++;
        
        const persona = await getOptimalPersona('hn', 'ask-hiring');
        const tone = await getOptimalTone('hn', 'ask-hiring');
        
        const jobLink = normalized.permalink;
        
        let message = `Category: ${classification.category}\n`;
        message += `Score: ${classification.opportunityScore}\n`;
        message += `Source: Hacker News\n\n`;
        message += `Title: ${normalized.title}\n\n`;
        message += `Job Link: ${jobLink}\n\n`;
        message += `---\n\n`;
        
        let resumePDFPath = null;
        let actionDecision = 'reply_only';
        let replyText = '';
        let replyMode = 'outreach';
        let coverLetterJSON = null;
        let resumeJSON = null;
        
        if (classification.opportunityScore >= 80) {
          stats.highValue++;
          actionDecision = 'reply_plus_resume';
          
          startLoader(`Generating cover letter & resume...`);
          try {
            const { coverLetter, resume } = await generateCoverLetterAndResume(
              normalized.title,
              normalized.selftext,
              classification.category
            );
            
            resumePDFPath = resume;
            replyText = coverLetter;
            coverLetterJSON = { text: coverLetter };
            
            message += `Cover Letter:\n${coverLetter}\n\n`;
            message += `---\n\n`;
            message += `Tailored Resume PDF attached below\n\n`;
            stopLoader();
          } catch (error) {
            stopLoader();
            logger.error.log(`Error generating cover letter/resume: ${error.message}`);
            continue;
          }
        } else {
          startLoader(`Generating reply...`);
          try {
            replyText = await generateReply(normalized.title, normalized.selftext, classification.category, persona, tone);
            message += `Suggested Reply:\n${replyText}\n\n`;
            stopLoader();
          } catch (error) {
            stopLoader();
            logger.error.log(`Error generating reply: ${error.message}`);
            continue;
          }
        }
        
        const postData = {
          postId: normalized.id,
          sourcePlatform: 'hn',
          sourceContext: 'ask-hiring',
          title: normalized.title,
          permalink: jobLink,
          author: normalized.author,
          selftext: normalized.selftext || '',
          category: classification.category,
          opportunityScore: classification.opportunityScore,
          actionDecision: actionDecision,
          personaUsed: persona,
          toneUsed: tone,
          replyMode: replyMode,
          replyTextSent: replyText,
          coverLetterJSON: coverLetterJSON,
          resumeJSON: resumeJSON
        };
        
        await saveOpportunityPost(postData);
        
        stats.opportunities++;
        
        await sendWhatsAppMessage(message, resumePDFPath, postData);
      }
    };
    
    await processBatchesSequentially(timeBuckets, processComments);
    
    return stats;
  } catch (error) {
    logger.error.log(`Error scraping Ask Hiring: ${error.message}`);
    return stats;
  }
}

