import { checkPostExists, savePost } from '../../db/posts.js';
import { classifyOpportunity, evaluateHighValue, generateCoverLetterAndResume } from '../../ai/ai.js';
import { startLoader, stopLoader } from '../../utils/loader.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.js';
import { logger } from '../../utils/logger.js';
import { cleanHTML } from '../../utils/html-cleaner.js';

const GRAPHQL_ENDPOINT = 'https://wellfound.com/graphql';

const ROLE_TAG_IDS = {
  'software-engineer': '14726',
  'backend-engineer': '151647',
  'full-stack-engineer': '151718',
  'frontend-engineer': '151711'
};

const ROLES = ['software-engineer', 'backend-engineer', 'full-stack-engineer', 'frontend-engineer'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function throttle() {
  const baseDelay = 12000;
  const jitter = Math.random() * 3000;
  return baseDelay + jitter;
}

function getCookies() {
  return process.env.WELLFOUND_COOKIES || '_wellfound=3c7583c53a59975a7ae6dd6b106231bf.i; ajs_anonymous_id=2989727b-490f-4801-bd4b-f9c231993092; ajs_user_id=20471933; cf_clearance=Jxk9.FT8.fi3cP9okfZCKSpHyWb1BT9voRd_UtZH_ss-1766214520-1.2.1.1-VXkhKk8GnNCD1rR_i1t3pOgDLDozpTFcvsPF5ZqoCrFqO3Udl4aQORn54mWsiamLuA99dNS4nk7yn56pFRo4g5xoVxCOjlgIgo3uf9jEzfCoR90k6WorCAfW7sWrx.CwnWRdskxPlI2Aoz7.Yc9Bl7P8NkZ1V6ROalw2HaeSB9g7mgf6Psm5yiD1.nLUacqVnPq1lV5r5prioGutCD0X2.HzUyscYWTsl.09JKFcF2k; datadome=ETxGZc~EJsT_aS4zqHx91ZFfdrbq15363b2ut~sB5vtEOn1EcicgGi7daPbfVzCGFuUmali~pmL~Wft1SpJjp1Yc7eYrC5gw9DXo5~H3cuPr4MS9Hp3YRurLWPtPkxaG; g_state={"i_l":0,"i_ll":1766213742248,"i_b":"luVVYvvO+0IDmkAVR4Q72zcg1jFGHbJ8JtuXlG/Gt7g","i_e":{"enable_itp_optimization":0}}; notice_behavior=implied|as; TAsessionID=976b06c8-0d39-424f-bf7f-2dabd3442180|NEW; wellfound_default_consent=1|implied-full';
}

function buildGraphQLQuery(role) {
  const roleTagId = ROLE_TAG_IDS[role] || '14726';
  
  return {
    operationName: 'JobSearchResultsX',
    variables: {
      filterConfigurationInput: {
        page: 1,
        locationTagIds: ['1647'],
        remoteCompanyLocationTagIds: ['153509'],
        roleTagIds: [roleTagId],
        equity: {
          min: null,
          max: null
        },
        jobTypes: ['full_time'],
        remotePreference: 'NO_REMOTE',
        salary: {
          min: null,
          max: null
        },
        yearsExperience: {
          min: null,
          max: null
        }
      },
      extensions: {
        operationId: 'tfe/5f366cd305b4f13cf6098df75f7ff2bb92fa42b9a74cb3a3aec7bdc69c6b051e'
      }
    }
  };
}

async function fetchWellfoundJobs(role) {
  try {
    await sleep(throttle());
    
    const query = buildGraphQLQuery(role);
    const cookies = getCookies();
    
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'Cookie': cookies,
        'Origin': 'https://wellfound.com',
        'Referer': 'https://wellfound.com/jobs',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'X-Apollo-Operation-Name': 'JobSearchResultsX',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }
    
    if (!data.data || !data.data.talent || !data.data.talent.jobSearch) {
      throw new Error('Invalid response structure: missing data.talent.jobSearch');
    }
    
    const jobListings = data.data.talent.jobSearch.highlightedJobListings || [];
    
    return jobListings;
  } catch (error) {
    logger.wellfound.log(`Error fetching jobs for role ${role}: ${error.message}`);
    return [];
  }
}

function normalizeWellfoundJob(job) {
  const slug = job.slug || '';
  const jobUrl = `https://wellfound.com/jobs/${slug}`;
  const publishedAt = job.publishedAt ? new Date(job.publishedAt).getTime() / 1000 : Math.floor(Date.now() / 1000);
  
  return {
    title: cleanHTML(job.title || 'Unknown'),
    company: cleanHTML(job.startup?.name || 'Unknown'),
    jobUrl: jobUrl,
    created_utc: publishedAt,
    slug: slug
  };
}

function bucketByFreshness(jobs) {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - (24 * 60 * 60);
  const twoDaysAgo = now - (2 * 24 * 60 * 60);
  const oneWeekAgo = now - (7 * 24 * 60 * 60);
  
  const jobs24h = [];
  const jobs1day = [];
  const jobsWeek = [];
  
  for (const job of jobs) {
    if (job.created_utc >= oneDayAgo) {
      jobs24h.push(job);
    } else if (job.created_utc >= twoDaysAgo) {
      jobs1day.push(job);
    } else if (job.created_utc >= oneWeekAgo) {
      jobsWeek.push(job);
    }
  }
  
  return { jobs24h, jobs1day, jobsWeek };
}

export async function scrapeWellfound() {
  const stats = {
    scraped: 0,
    titleFiltered: 0,
    aiClassified: 0,
    opportunities: 0,
    highValue: 0
  };
  
  let emptyResponseCount = 0;
  
  try {
    logger.wellfound.scrapingStart();
    
    const allJobs = [];
    const seenUrls = new Set();
    const now = Math.floor(Date.now() / 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60);
    
    for (const role of ROLES) {
      logger.wellfound.log(`Fetching jobs for role: ${role}`);
      
      const jobs = await fetchWellfoundJobs(role);
      
      if (jobs.length === 0) {
        emptyResponseCount++;
        logger.wellfound.log(`No jobs found for role ${role} (empty count: ${emptyResponseCount})`);
        
        if (emptyResponseCount >= 2) {
          logger.error.warning('Empty highlightedJobListings detected twice in a row. Aborting scraping.');
          break;
        }
        continue;
      }
      
      emptyResponseCount = 0;
      
      for (const job of jobs) {
        const normalized = normalizeWellfoundJob(job);
        
        if (normalized.created_utc < oneWeekAgo) {
          continue;
        }
        
        if (seenUrls.has(normalized.jobUrl)) {
          continue;
        }
        
        seenUrls.add(normalized.jobUrl);
        allJobs.push(normalized);
      }
      
      logger.wellfound.log(`Found ${jobs.length} jobs for role ${role}`);
    }
    
    stats.scraped = allJobs.length;
    logger.wellfound.log(`Found ${allJobs.length} unique jobs from last 7 days`);
    
    if (allJobs.length === 0) {
      logger.wellfound.log('No jobs found. Exiting.');
      logger.wellfound.scrapingComplete();
      return stats;
    }
    
    const { jobs24h, jobs1day, jobsWeek } = bucketByFreshness(allJobs);
    
    logger.wellfound.log(`Prioritizing: ${jobs24h.length} (last 24h) → ${jobs1day.length} (1-2 days) → ${jobsWeek.length} (2-7 days)`);
    
    const processJobs = async (jobBatch, batchName) => {
      for (const job of jobBatch) {
        await sleep(30000);
        
        const normalized = {
          id: `wellfound-${job.slug || job.jobUrl.split('/').pop()}`,
          title: job.title,
          selftext: `Company: ${job.company}`,
          permalink: job.jobUrl,
          created_utc: job.created_utc,
          author: job.company || 'unknown',
          source: 'wellfound',
          jobUrl: job.jobUrl
        };
        
        const exists = await checkPostExists(
          normalized.source,
          normalized.author,
          normalized.title,
          normalized.selftext || ''
        );
        
        if (exists) continue;
        
        const fullText = `${normalized.title}\n\nCompany: ${normalized.author}`;
        startLoader(`Classifying Wellfound opportunity...`);
        let classification;
        try {
          classification = await classifyOpportunity(fullText);
          stopLoader();
        } catch (error) {
          stopLoader();
          logger.error.log(`Error classifying opportunity: ${error.message}`);
          continue;
        }
        
        if (classification.valid) {
          stats.aiClassified++;
          
          await savePost({
            source: normalized.source,
            author: normalized.author,
            title: normalized.title,
            postId: normalized.id,
            permalink: normalized.permalink,
            selftext: normalized.selftext || '',
            status: 'ai_classified',
            category: classification.category
          });
          
          startLoader(`Evaluating high-value status...`);
          let isHighValue;
          try {
            isHighValue = await evaluateHighValue(fullText, classification.category);
            stopLoader();
          } catch (error) {
            stopLoader();
            logger.error.log(`Error evaluating high-value: ${error.message}`);
            continue;
          }
          
          const jobLink = normalized.jobUrl || normalized.permalink;
          
          let message = `Category: ${classification.category}\n`;
          message += `Source: Wellfound\n\n`;
          message += `Title: ${normalized.title}\n\n`;
          if (normalized.author && normalized.author !== 'unknown') {
            message += `Company: ${normalized.author}\n\n`;
          }
          message += `Job Link: ${jobLink}\n\n`;
          message += `---\n\n`;
          
          let resumePDFPath = null;
          
          if (isHighValue) {
            stats.highValue++;
            
            startLoader(`Generating cover letter & resume...`);
            try {
              const { coverLetter, resume } = await generateCoverLetterAndResume(
                normalized.title,
                normalized.selftext,
                classification.category
              );
              
              resumePDFPath = resume;
              
              message += `Cover Letter:\n${coverLetter}\n\n`;
              message += `---\n\n`;
              message += `Tailored Resume PDF attached below\n\n`;
              stopLoader();
            } catch (error) {
              stopLoader();
              logger.error.log(`Error generating cover letter/resume: ${error.message}`);
              continue;
            }
          }
          
          message += `---\n\n`;
          message += `Job Link: ${jobLink}`;
          
          stats.opportunities++;
          
          await sendWhatsAppMessage(message, resumePDFPath);
        }
      }
    };
    
    await processJobs(jobs24h, '24h');
    await processJobs(jobs1day, '1day');
    await processJobs(jobsWeek, 'week');
    
    logger.wellfound.summary();
    logger.stats.wellfound(
      stats.scraped,
      stats.titleFiltered,
      stats.aiClassified,
      stats.opportunities,
      stats.highValue
    );
    logger.wellfound.scrapingComplete();
    
    return stats;
  } catch (error) {
    logger.error.log(`Error scraping Wellfound: ${error.message}`);
    return stats;
  }
}
