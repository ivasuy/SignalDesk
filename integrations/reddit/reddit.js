import { redditRequest } from './api.js';
import { SUBREDDITS } from '../../utils/config.js';
import { checkPostExistsByPostId, saveOpportunityPost } from '../../utils/db.js';
import { isForHirePost, matchesKeywords } from '../../utils/utils.js';
import { classifyOpportunity, generateReply, generateCoverLetterAndResume } from '../../ai/ai.js';
import { startLoader, stopLoader } from '../../utils/loader.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.js';
import { logger } from '../../utils/logger.js';
import { getOptimalPersona, getOptimalTone } from '../../utils/learning.js';

export async function fetchNewPosts(subreddit) {
  const data = await redditRequest(`/r/${subreddit}/new.json?limit=25`);
  const now = Date.now() / 1000;
  const fiveHoursAgo = now - (5 * 60 * 60);
  
  return data.data.children
    .map(child => ({
      id: child.data.id,
      title: child.data.title,
      selftext: child.data.selftext,
      permalink: child.data.permalink,
      created_utc: child.data.created_utc,
      author: child.data.author
    }))
    .filter(post => post.created_utc >= fiveHoursAgo);
}

export async function scrapeReddit() {
  logger.reddit.scrapingStart();
  
  const stats = {
    subreddits: {},
    total: {
      scraped: 0,
      keywordFiltered: 0,
      aiClassified: 0,
      opportunities: 0,
      highValue: 0
    }
  };
  
  try {
    for (const subreddit of SUBREDDITS) {
      stats.subreddits[subreddit] = {
        scraped: 0,
        keywordFiltered: 0,
        aiClassified: 0,
        opportunities: 0,
        highValue: 0
      };
      
      try {
        const posts = await fetchNewPosts(subreddit);
        stats.subreddits[subreddit].scraped = posts.length;
        stats.total.scraped += posts.length;
        
        for (const post of posts) {
          if (isForHirePost(post.title) || (post.selftext && isForHirePost(post.selftext))) {
            continue;
          }
          
          const normalizedPostId = `reddit-${post.id}`;
          const postExists = await checkPostExistsByPostId(normalizedPostId);
          if (postExists) {
            continue;
          }
          
          const titleMatch = matchesKeywords(post.title);
          const bodyMatch = post.selftext ? matchesKeywords(post.selftext) : false;
          
          if (!titleMatch && !bodyMatch) {
            continue;
          }
          
          stats.subreddits[subreddit].keywordFiltered++;
          stats.total.keywordFiltered++;
          
          const fullText = `${post.title}\n\n${post.selftext || ''}`;
          startLoader(`Classifying opportunity from r/${subreddit}...`);
          let classification;
          try {
            classification = await classifyOpportunity(fullText, normalizedPostId);
            stopLoader();
          } catch (error) {
            stopLoader();
            logger.error.log(`Error classifying opportunity: ${error.message}`);
            continue;
          }
          
          if (!classification.valid || classification.opportunityScore < 50) {
            await saveOpportunityPost({
              postId: normalizedPostId,
              sourcePlatform: 'reddit',
              sourceContext: subreddit,
              title: post.title,
              permalink: `https://reddit.com${post.permalink}`,
              author: post.author || 'unknown',
              selftext: post.selftext || '',
              category: classification.category,
              opportunityScore: classification.opportunityScore,
              actionDecision: 'reject'
            });
            continue;
          }
          
          stats.subreddits[subreddit].aiClassified++;
          stats.total.aiClassified++;
          
          const persona = await getOptimalPersona('reddit', subreddit);
          const tone = await getOptimalTone('reddit', subreddit);
          
          const postLink = `https://reddit.com${post.permalink}`;
          const postContent = post.selftext || '(No content)';
          
          let message = `Category: ${classification.category}\n`;
          message += `Score: ${classification.opportunityScore}\n`;
          message += `Subreddit: r/${subreddit}\n\n`;
          message += `Title: ${post.title}\n\n`;
          message += `Content:\n${postContent}\n\n`;
          message += `---\n\n`;
          
          let resumePDFPath = null;
          let actionDecision = 'reply_only';
          let replyText = '';
          let coverLetterJSON = null;
          let resumeJSON = null;
          
          if (classification.opportunityScore >= 80) {
            stats.subreddits[subreddit].highValue++;
            stats.total.highValue++;
            actionDecision = 'reply_plus_resume';
            
            startLoader(`Generating cover letter & resume...`);
            try {
              const { coverLetter, resume } = await generateCoverLetterAndResume(
                post.title,
                post.selftext || '',
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
              replyText = await generateReply(post.title, post.selftext || '', classification.category, persona, tone);
              message += `Suggested Reply:\n${replyText}\n\n`;
              stopLoader();
            } catch (error) {
              stopLoader();
              logger.error.log(`Error generating reply: ${error.message}`);
              continue;
            }
          }
          
          message += `---\n\n`;
          message += `Post Link: ${postLink}`;
          
          const postData = {
            postId: normalizedPostId,
            sourcePlatform: 'reddit',
            sourceContext: subreddit,
            title: post.title,
            permalink: postLink,
            author: post.author || 'unknown',
            selftext: post.selftext || '',
            category: classification.category,
            opportunityScore: classification.opportunityScore,
            actionDecision: actionDecision,
            personaUsed: persona,
            toneUsed: tone,
            replyTextSent: replyText,
            coverLetterJSON: coverLetterJSON,
            resumeJSON: resumeJSON
          };
          
          await saveOpportunityPost(postData);
          
          stats.subreddits[subreddit].opportunities++;
          stats.total.opportunities++;
          
          await sendWhatsAppMessage(message, resumePDFPath, postData);
        }
      } catch (error) {
        logger.reddit.error(subreddit, error.message);
      }
    }
    
    logger.reddit.summary();
    logger.stats.total(
      stats.total.scraped,
      stats.total.keywordFiltered,
      stats.total.aiClassified,
      stats.total.opportunities,
      stats.total.highValue
    );
    
    logger.reddit.log(`\nSubreddit Performance:`);
    
    const sortedSubreddits = Object.entries(stats.subreddits)
      .filter(([_, data]) => data.scraped > 0)
      .sort(([_, a], [__, b]) => b.opportunities - a.opportunities);
    
    for (const [subreddit, data] of sortedSubreddits) {
      if (data.scraped > 0) {
        logger.stats.subreddit(
          subreddit,
          data.scraped,
          data.keywordFiltered,
          data.aiClassified,
          data.opportunities,
          data.highValue
        );
      }
    }
    
    logger.reddit.scrapingComplete();
    
    return stats;
  } catch (error) {
    logger.error.fatal(`Reddit scraping error: ${error.message}`);
    return stats;
  }
}

