import { getJobStories, getItem } from './api.js';
import { checkPostExistsByPostId, saveOpportunityPost } from '../../utils/db.js';
import { matchesKeywords, isForHirePost } from '../../utils/utils.js';
import { cleanHTML, cleanTitle } from '../../utils/html-cleaner.js';
import { classifyOpportunity, generateReply, generateCoverLetterAndResume } from '../../ai/ai.js';
import { startLoader, stopLoader } from '../../utils/loader.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.js';
import { logger } from '../../utils/logger.js';
import { getOptimalPersona, getOptimalTone } from '../../utils/learning.js';

function normalizeJob(job) {
  const cleanedTitle = cleanTitle(job.title || 'Hacker News Job');
  const cleanedText = cleanHTML(job.text || '');
  
  return {
    id: `hn-job-${job.id}`,
    title: cleanedTitle,
    selftext: cleanedText,
    permalink: job.url || `https://news.ycombinator.com/item?id=${job.id}`,
    created_utc: job.time,
    author: job.by || 'unknown',
    source: 'hackernews-jobs',
    jobUrl: job.url
  };
}

async function fetchJobDescription(job) {
  if (!job.url || !job.url.includes('ycombinator.com')) {
    return job.text || '';
  }
  
  try {
    const response = await fetch(job.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HN-Scraper/1.0)'
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) return job.text || '';
    
    const html = await response.text();
    
    const patterns = [
      /<div[^>]*class="job-description"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    ];
    
    for (const pattern of patterns) {
      const textMatch = html.match(pattern);
      if (textMatch) {
        const text = textMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length > 50) {
          return text.substring(0, 2000);
        }
      }
    }
    
    return job.text || '';
  } catch (error) {
    return job.text || '';
  }
}

export async function scrapeJobs() {
  const stats = {
    scraped: 0,
    keywordFiltered: 0,
    aiClassified: 0,
    opportunities: 0,
    highValue: 0
  };
  
  try {
    const jobIds = await getJobStories();
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - (24 * 60 * 60);
    const twoDaysAgo = now - (2 * 24 * 60 * 60);
    const oneWeekAgo = now - (7 * 24 * 60 * 60);
    
    logger.hackernews.log(`Processing ${jobIds.length} job stories`);
    
    const jobs = [];
    for (const jobId of jobIds) {
      const job = await getItem(jobId);
      if (!job || !job.title || !job.time) continue;
      if (job.time < oneWeekAgo) continue;
      jobs.push(job);
    }
    
    const sortedJobs = jobs.sort((a, b) => b.time - a.time);
    const jobs24h = sortedJobs.filter(j => j.time >= oneDayAgo);
    const jobs1day = sortedJobs.filter(j => j.time >= twoDaysAgo && j.time < oneDayAgo);
    const jobsWeek = sortedJobs.filter(j => j.time >= oneWeekAgo && j.time < twoDaysAgo);
    
    logger.hackernews.log(`Prioritizing: ${jobs24h.length} (last 24h) → ${jobs1day.length} (1-2 days) → ${jobsWeek.length} (2-7 days)`);
    
    const processJobs = async (jobBatch, batchName) => {
      for (const job of jobBatch) {
        stats.scraped++;
        
        if (isForHirePost(job.title) || (job.text && isForHirePost(job.text))) {
          continue;
        }
        
        const jobDescription = await fetchJobDescription(job);
        const jobWithDescription = {
          ...job,
          text: jobDescription || job.text || ''
        };
        const normalized = normalizeJob(jobWithDescription);
        
        const exists = await checkPostExistsByPostId(normalized.id);
        if (exists) continue;
        
        const titleMatch = matchesKeywords(normalized.title);
        const bodyMatch = matchesKeywords(normalized.selftext);
        
        if (!titleMatch && !bodyMatch) continue;
        
        stats.keywordFiltered++;
        
        const fullText = `${normalized.title}\n\n${normalized.selftext}`;
        startLoader(`Classifying Hacker News job...`);
        let classification;
        try {
          classification = await classifyOpportunity(fullText, normalized.id);
          stopLoader();
        } catch (error) {
          stopLoader();
          logger.error.log(`Error classifying opportunity: ${error.message}`);
          continue;
        }
        
        if (!classification.valid || classification.opportunityScore < 50) {
          await saveOpportunityPost({
            postId: normalized.id,
            sourcePlatform: 'hn',
            sourceContext: 'jobs',
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
        
        const persona = await getOptimalPersona('hn', 'jobs');
        const tone = await getOptimalTone('hn', 'jobs');
        
        const jobLink = normalized.jobUrl || normalized.permalink;
        
        let message = `Category: ${classification.category}\n`;
        message += `Score: ${classification.opportunityScore}\n`;
        message += `Source: Hacker News\n\n`;
        message += `Title: ${normalized.title}\n\n`;
        message += `Job Link: ${jobLink}\n\n`;
        message += `---\n\n`;
        
        let resumePDFPath = null;
        let actionDecision = 'reply_only';
        let replyText = '';
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
          sourceContext: 'jobs',
          title: normalized.title,
          permalink: jobLink,
          author: normalized.author,
          selftext: normalized.selftext || '',
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
        
        stats.opportunities++;
        
        await sendWhatsAppMessage(message, resumePDFPath, postData);
      }
    };
    
    await processJobs(jobs24h, '24h');
    await processJobs(jobs1day, '1day');
    await processJobs(jobsWeek, 'week');
    
    return stats;
  } catch (error) {
    logger.error.log(`Error scraping Jobs: ${error.message}`);
    return stats;
  }
}

