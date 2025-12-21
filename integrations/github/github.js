import { searchIssues } from './api.js';
import { 
  saveOpportunityPost
} from '../../db/posts.js';
import { 
  checkIngestionExists,
  saveIngestionRecord,
  markIngestionClassified,
  generateContentHash
} from '../../db/ingestion.js';
import { buildGitHubSearchQueries } from '../../utils/utils.js';
import { matchesSkillFilter, bucketByRecency, processBatchesWithEarlyStop } from '../../utils/utils.js';
import { classifyOpportunity, generateReply, generateCoverLetterAndResume } from '../../ai/ai.js';
import { startLoader, stopLoader } from '../../utils/loader.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.js';
import { logger } from '../../utils/logger.js';
import { getOptimalPersona, getOptimalTone } from '../../utils/learning.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadResumeSkills() {
  try {
    const resumePath = join(__dirname, '..', '..', 'resume.json');
    const resumeData = JSON.parse(readFileSync(resumePath, 'utf8'));
    
    const skills = [];
    
    if (resumeData.skills?.languages) {
      skills.push(...resumeData.skills.languages.map(s => s.toLowerCase()));
    }
    
    if (resumeData.skills?.frameworks_and_libraries) {
      skills.push(...resumeData.skills.frameworks_and_libraries.map(s => s.toLowerCase()));
    }
    
    if (resumeData.skills?.databases) {
      skills.push(...resumeData.skills.databases.map(s => s.toLowerCase()));
    }
    
    if (resumeData.skills?.other) {
      skills.push(...resumeData.skills.other.map(s => s.toLowerCase()));
    }
    
    return [...new Set(skills)];
  } catch (error) {
    throw new Error(`Failed to load resume.json: ${error.message}`);
  }
}

function normalizeIssue(issue) {
  const repoFullName = issue.repository_url ? issue.repository_url.split('/repos/')[1] : 'unknown';
  return {
    id: `github-${issue.id}`,
    title: issue.title,
    selftext: issue.body || '',
    permalink: issue.html_url,
    created_utc: Math.floor(new Date(issue.created_at).getTime() / 1000),
    author: issue.user?.login || 'unknown',
    source: 'github',
    repoFullName: repoFullName
  };
}


export async function scrapeGitHub() {
  const stats = {
    scraped: 0,
    skillFiltered: 0,
    aiClassified: 0,
    opportunities: 0
  };
  
  try {
    logger.github.scrapingStart();
    
    const skills = loadResumeSkills();
    logger.github.log(`Loaded ${skills.length} skills from resume`);
    
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const dateStr = fourteenDaysAgo.toISOString().split('T')[0];
    
    logger.github.log(`Searching for issues created after ${dateStr}`);
    
    const queries = buildGitHubSearchQueries(dateStr);
    logger.github.log(`Executing ${queries.length} search queries`);
    
    const allIssues = [];
    const seenIssueIds = new Set();
    
    for (const query of queries) {
      try {
        logger.github.log(`Query: ${query}`);
        const response = await searchIssues(query);
        
        if (response && response.items && response.items.length > 0) {
          let newCount = 0;
          for (const issue of response.items) {
            if (!seenIssueIds.has(issue.id)) {
              seenIssueIds.add(issue.id);
              allIssues.push(issue);
              newCount++;
            }
          }
          logger.github.log(`Found ${response.items.length} issues (${newCount} new)`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error.log(`Error executing query "${query}": ${error.message}`);
      }
    }
    
    if (allIssues.length === 0) {
      logger.github.log('No issues found across all queries');
      logger.github.scrapingComplete();
      return stats;
    }
    
    stats.scraped = allIssues.length;
    logger.github.log(`Found ${stats.scraped} unique issues after merging queries`);
    
    const buckets = bucketByRecency(allIssues);
    logger.github.log(`Buckets: ${buckets.last24h.length} (24h) → ${buckets.oneToTwoDays.length} (1-2d) → ${buckets.twoToSevenDays.length} (2-7d)`);
    
    const processBucket = async (issues, bucketName) => {
      if (issues.length === 0) return 0;
      
      let validOpportunities = 0;
      
      for (const issue of issues) {
        const normalized = normalizeIssue(issue);
        
        const contentHash = generateContentHash(normalized.title, normalized.selftext);
        
        const ingestionCheck = await checkIngestionExists('github_ingestion', normalized.id, contentHash);
        if (ingestionCheck.exists) {
          continue;
        }
        
        const titleMatch = matchesSkillFilter(normalized.title, normalized.selftext, skills.length > 0 ? skills : []);
        if (!titleMatch) {
          stats.skillFiltered++;
          await saveIngestionRecord('github_ingestion', {
            postId: normalized.id,
            contentHash,
            keywordMatched: false,
            metadata: {
              repoFullName: normalized.repoFullName,
              author: normalized.author,
              title: normalized.title
            }
          });
          continue;
        }
        
        await saveIngestionRecord('github_ingestion', {
          postId: normalized.id,
          contentHash,
          keywordMatched: true,
          metadata: {
            repoFullName: normalized.repoFullName,
            author: normalized.author,
            title: normalized.title
          }
        });
        
        const fullText = `${normalized.title}\n\n${normalized.selftext}`;
        startLoader(`Classifying GitHub opportunity...`);
        let classification;
        try {
          classification = await classifyOpportunity(fullText, normalized.id);
          stopLoader();
        } catch (error) {
          stopLoader();
          logger.error.log(`Error classifying opportunity: ${error.message}`);
          continue;
        }
        
        await markIngestionClassified('github_ingestion', normalized.id);
        
        if (!classification.valid || classification.opportunityScore < 50) {
          await saveOpportunityPost({
            postId: normalized.id,
            sourcePlatform: 'github',
            sourceContext: normalized.repoFullName,
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
        
        const persona = await getOptimalPersona('github', normalized.repoFullName);
        const tone = await getOptimalTone('github', normalized.repoFullName);
        
        let message = `Category: ${classification.category}\n`;
        message += `Score: ${classification.opportunityScore}\n`;
        message += `Source: GitHub\n`;
        message += `Repo: ${normalized.repoFullName}\n\n`;
        message += `Title: ${normalized.title}\n\n`;
        message += `Link: ${normalized.permalink}\n\n`;
        message += `---\n\n`;
        
        let resumePDFPath = null;
        let actionDecision = 'reply_only';
        let replyText = '';
        let replyMode = 'none';
        let coverLetterJSON = null;
        let resumeJSON = null;
        
        const shouldGenerateReply = classification.opportunityScore >= 80 && 
                                    (classification.category === 'freelance' || classification.category === 'collab');
        
        if (shouldGenerateReply) {
          replyMode = 'technical_interest';
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
          message += `Summary: ${normalized.selftext.substring(0, 200)}...\n\n`;
        }
        
        const postData = {
          postId: normalized.id,
          sourcePlatform: 'github',
          sourceContext: normalized.repoFullName,
          title: normalized.title,
          permalink: normalized.permalink,
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
        validOpportunities++;
        
        await sendWhatsAppMessage(message, resumePDFPath, postData);
      }
      
      return validOpportunities;
    };
    
    await processBatchesWithEarlyStop(buckets, processBucket, logger.github);
    
    logger.github.summary();
    logger.stats.github(
      stats.scraped,
      stats.skillFiltered,
      stats.aiClassified,
      stats.opportunities
    );
    logger.github.scrapingComplete();
    
    return stats;
  } catch (error) {
    logger.error.log(`Error scraping GitHub: ${error.message}`);
    return stats;
  }
}

