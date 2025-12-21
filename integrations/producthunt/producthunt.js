import { productHuntRequest } from './api.js';
import { 
  checkProductHuntPostExists, 
  saveProductHuntPost, 
  checkProductHuntCollabExists, 
  saveProductHuntCollab
} from '../../db/posts.js';
import { 
  checkIngestionExists,
  saveIngestionRecord,
  markIngestionClassified,
  generateContentHash
} from '../../db/ingestion.js';
import { evaluateBuildableIdea, evaluateCollabOpportunity } from '../../ai/ai.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.js';
import { generateCoverLetterAndResume } from '../../ai/ai.js';
import { logger } from '../../utils/logger.js';
import { startLoader, stopLoader } from '../../utils/loader.js';

const POSTS_QUERY = `
  query Posts($postedAfter: DateTime!, $first: Int!) {
    posts(postedAfter: $postedAfter, first: $first, order: VOTES) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          votesCount
          createdAt
          topics {
            edges {
              node {
                name
              }
            }
          }
        }
      }
    }
  }
`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchProductHuntPosts() {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const dateStr = yesterday.toISOString();
    
    logger.producthunt.log(`Fetching posts from ${dateStr.split('T')[0]} onwards`);
    
    const data = await productHuntRequest(POSTS_QUERY, {
      postedAfter: dateStr,
      first: 50
    });
    
    if (!data || !data.posts || !data.posts.edges) {
      logger.error.warning('Invalid response structure from Product Hunt API - missing posts.edges');
      return [];
    }
    
    if (data.posts.edges.length === 0) {
      logger.producthunt.log('No posts returned from Product Hunt API');
      return [];
    }
    
    const posts = data.posts.edges.map(edge => ({
      id: edge.node.id,
      name: edge.node.name,
      tagline: edge.node.tagline,
      description: edge.node.description,
      url: edge.node.url,
      votesCount: edge.node.votesCount,
      createdAt: edge.node.createdAt,
      topics: edge.node.topics?.edges?.map(t => t.node.name) || []
    }));
    
    logger.producthunt.log(`Fetched ${posts.length} posts from Product Hunt`);
    return posts;
  } catch (error) {
    logger.error.log(`Error fetching Product Hunt posts: ${error.message}`);
    return [];
  }
}

function rankBuildableIdeas(ideas) {
  return ideas
    .map(idea => {
      const complexityWeight = idea.complexity === 'low' ? 1 : idea.complexity === 'medium' ? 2 : 3;
      const score = (idea.confidence_score * idea.votesCount) / complexityWeight;
      return { ...idea, rankScore: score };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 3);
}

function formatBuildableMessage(idea, post) {
  let message = `BUILDABLE IDEA: ${post.name}\n\n`;
  message += `Problem: ${idea.why}\n\n`;
  message += `Why it's easy: ${idea.suggested_mvp_scope}\n\n`;
  message += `Tech Stack: ${idea.recommended_tech_stack.join(', ')}\n\n`;
  message += `Go-to-Market:\n`;
  idea.go_to_market_strategy.forEach(strategy => {
    message += `• ${strategy}\n`;
  });
  message += `\nProduct Hunt: ${post.url}\n`;
  message += `Votes: ${post.votesCount} | Confidence: ${idea.confidence_score}%\n`;
  
  return message;
}

function formatCollabMessage(opportunity, post) {
  let message = `COLLAB OPPORTUNITY: ${post.name}\n\n`;
  message += `What they're building: ${post.tagline || post.description.substring(0, 200)}\n\n`;
  message += `Why you're a fit: ${opportunity.why_you_are_a_fit}\n\n`;
  message += `Type: ${opportunity.collaboration_type}\n\n`;
  message += `Outreach angle: ${opportunity.suggested_outreach || 'Reach out via Product Hunt comments or their website'}\n\n`;
  message += `Product Hunt: ${post.url}\n`;
  message += `Votes: ${post.votesCount}\n`;
  
  return message;
}

export async function scrapeProductHunt() {
  const stats = {
    scraped: 0,
    buildableEvaluated: 0,
    buildableSelected: 0,
    collabEvaluated: 0,
    collabSelected: 0,
    highValueCollab: 0
  };
  
  try {
    logger.producthunt.scrapingStart();
    
    const posts = await fetchProductHuntPosts();
    
    if (posts.length === 0) {
      logger.producthunt.log('No posts found. Exiting.');
      logger.producthunt.scrapingComplete();
      return stats;
    }
    
    stats.scraped = posts.length;
    
    const buildableIdeas = [];
    const collabOpportunities = [];
    
    for (const post of posts) {
      await sleep(2000);
      
      const normalizedPostId = `ph-${post.id}`;
      const contentHash = generateContentHash(post.name, post.description || post.tagline || '');
      
      const ingestionCheck = await checkIngestionExists('producthunt_ingestion', normalizedPostId, contentHash);
      if (ingestionCheck.exists) {
        continue;
      }
      
      await saveIngestionRecord('producthunt_ingestion', {
        postId: normalizedPostId,
        contentHash,
        keywordMatched: true,
        metadata: {
          name: post.name,
          tagline: post.tagline,
          url: post.url
        }
      });
      
      const exists = await checkProductHuntPostExists(post.id);
      if (exists) {
        continue;
      }
      
      await saveProductHuntPost({
        postId: post.id,
        name: post.name,
        tagline: post.tagline,
        description: post.description,
        url: post.url,
        votesCount: post.votesCount,
        createdAt: post.createdAt,
        topics: post.topics,
        source: 'producthunt'
      });
      
      const evaluationData = {
        name: post.name,
        tagline: post.tagline,
        description: post.description,
        topics: post.topics,
        votesCount: post.votesCount
      };
      
      startLoader(`Evaluating "${post.name.substring(0, 40)}..." for buildability`);
      let buildableEval;
      try {
        buildableEval = await evaluateBuildableIdea(evaluationData);
        stopLoader();
      } catch (error) {
        stopLoader();
        logger.error.log(`Error evaluating buildable idea: ${error.message}`);
        continue;
      }
      
      await markIngestionClassified('producthunt_ingestion', normalizedPostId);
      
      if (buildableEval.buildable_in_2_days && buildableEval.complexity === 'low') {
        stats.buildableEvaluated++;
        buildableIdeas.push({
          ...buildableEval,
          post: post
        });
      }
      
      if (!buildableEval.buildable_in_2_days && (buildableEval.complexity === 'medium' || buildableEval.complexity === 'high')) {
        await sleep(2000);
        startLoader(`Evaluating "${post.name.substring(0, 40)}..." for collaboration fit`);
        let collabEval;
        try {
          collabEval = await evaluateCollabOpportunity(evaluationData);
          stopLoader();
        } catch (error) {
          stopLoader();
          logger.error.log(`Error evaluating collab opportunity: ${error.message}`);
          continue;
        }
        
        if (collabEval.collaboration_fit) {
          stats.collabEvaluated++;
          collabOpportunities.push({
            ...collabEval,
            post: post
          });
        }
      }
    }
    
    const rankedBuildable = rankBuildableIdeas(buildableIdeas);
    stats.buildableSelected = Math.min(rankedBuildable.length, 2);
    
    logger.producthunt.log(`Found ${buildableIdeas.length} buildable ideas, selected top ${stats.buildableSelected}`);
    logger.producthunt.log(`Found ${collabOpportunities.length} collab opportunities, selected ${stats.collabSelected}`);
    
    for (const idea of rankedBuildable.slice(0, 2)) {
      const exists = await checkProductHuntPostExists(idea.post.id, 'buildable');
      if (exists) continue;
      
      const message = formatBuildableMessage(idea, idea.post);
      await sendWhatsAppMessage(message);
      
      await saveProductHuntPost({
        postId: idea.post.id,
        name: idea.post.name,
        tagline: idea.post.tagline,
        description: idea.post.description,
        url: idea.post.url,
        votesCount: idea.post.votesCount,
        createdAt: idea.post.createdAt,
        topics: idea.post.topics,
        source: 'producthunt',
        type: 'buildable',
        evaluation: idea
      });
    }
    
    for (const opportunity of collabOpportunities.slice(0, 2)) {
      const exists = await checkProductHuntCollabExists(opportunity.post.id);
      if (exists) continue;
      
      let resumePDFPath = null;
      let message = formatCollabMessage(opportunity, opportunity.post);
      
      if (opportunity.confidence_score >= 80) {
        stats.highValueCollab++;
        
        startLoader(`Generating cover letter & resume for "${opportunity.post.name.substring(0, 40)}..."`);
        try {
          const { coverLetter, resume } = await generateCoverLetterAndResume(
            opportunity.post.name,
            opportunity.post.description || opportunity.post.tagline,
            'COLLABORATION'
          );
          
          resumePDFPath = resume;
          
          message += `\n---\n\nCover Letter:\n${coverLetter}\n\n`;
          message += `Tailored Resume PDF attached below\n`;
          stopLoader();
        } catch (error) {
          stopLoader();
          logger.error.log(`Error generating cover letter/resume: ${error.message}`);
        }
      }
      
      await sendWhatsAppMessage(message, resumePDFPath);
      
      await saveProductHuntCollab({
        postId: opportunity.post.id,
        name: opportunity.post.name,
        tagline: opportunity.post.tagline,
        description: opportunity.post.description,
        url: opportunity.post.url,
        votesCount: opportunity.post.votesCount,
        createdAt: opportunity.post.createdAt,
        topics: opportunity.post.topics,
        source: 'producthunt',
        evaluation: opportunity
      });
    }
    
    logger.producthunt.summary();
    logger.stats.producthunt(
      stats.scraped,
      stats.buildableEvaluated,
      stats.buildableSelected,
      stats.collabEvaluated,
      stats.collabSelected,
      stats.highValueCollab
    );
    logger.producthunt.scrapingComplete();
    
    return stats;
  } catch (error) {
    logger.error.log(`Error scraping Product Hunt: ${error.message}`);
    return stats;
  }
}

