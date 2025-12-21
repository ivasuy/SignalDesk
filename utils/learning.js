import { connectDB } from '../db/connection.js';
import { logger } from '../utils/logger.js';

// Database functions for learning metrics
export async function aggregateLearningMetrics() {
  try {
    const database = await connectDB();
    
    const pipeline = [
      {
        $match: {
          feedbackStatus: 'received',
          userFeedback: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            sourcePlatform: '$sourcePlatform',
            sourceContext: '$sourceContext',
            scoreBucket: {
              $cond: [
                { $lt: ['$opportunityScore', 50] },
                '0-49',
                {
                  $cond: [
                    { $lt: ['$opportunityScore', 80] },
                    '50-79',
                    '80-100'
                  ]
                }
              ]
            },
            persona: '$personaUsed',
            tone: '$toneUsed'
          },
          total: { $sum: 1 },
          hired: {
            $sum: { $cond: [{ $in: ['$userFeedback', ['hired', 'collab_started']] }, 1, 0] }
          },
          replied: {
            $sum: { $cond: [{ $eq: ['$userFeedback', 'replied'] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$userFeedback', 'rejected'] }, 1, 0] }
          },
          call: {
            $sum: { $cond: [{ $eq: ['$userFeedback', 'call'] }, 1, 0] }
          },
          avgScore: { $avg: '$opportunityScore' },
          avgResponseDelay: { $avg: '$responseDelayHours' }
        }
      }
    ];
    
    const metrics = await database.collection('posts').aggregate(pipeline).toArray();
    
    await database.collection('opportunity_learning_metrics').updateOne(
      { date: new Date().toISOString().split('T')[0] },
      {
        $set: {
          date: new Date().toISOString().split('T')[0],
          metrics: metrics,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    return metrics;
  } catch (error) {
    logger.error.log(`Error aggregating learning metrics: ${error.message}`);
    return [];
  }
}

export async function getLearningMetrics() {
  try {
    const database = await connectDB();
    const latest = await database.collection('opportunity_learning_metrics')
      .findOne({}, { sort: { updatedAt: -1 } });
    return latest?.metrics || [];
  } catch (error) {
    logger.error.log(`Error getting learning metrics: ${error.message}`);
    return [];
  }
}

// Learning decision functions
export async function getOptimalPersona(platform, context) {
  const metrics = await getLearningMetrics();
  
  if (!Array.isArray(metrics)) {
    return 'engineer';
  }
  
  const relevant = metrics.filter(m => 
    m._id && m._id.sourcePlatform === platform && 
    m._id.sourceContext === context
  );
  
  if (relevant.length === 0) return 'engineer';
  
  const personaScores = {};
  for (const metric of relevant) {
    const persona = metric._id?.persona || 'engineer';
    const successRate = (metric.hired + metric.replied) / metric.total;
    
    if (!personaScores[persona]) {
      personaScores[persona] = { total: 0, success: 0 };
    }
    personaScores[persona].total += metric.total;
    personaScores[persona].success += metric.hired + metric.replied;
  }
  
  let bestPersona = 'engineer';
  let bestRate = 0;
  
  for (const [persona, data] of Object.entries(personaScores)) {
    const rate = data.success / data.total;
    if (rate > bestRate) {
      bestRate = rate;
      bestPersona = persona;
    }
  }
  
  return bestPersona;
}

export async function getOptimalTone(platform, context) {
  const metrics = await getLearningMetrics();
  
  if (!Array.isArray(metrics)) {
    return 'professional';
  }
  
  const relevant = metrics.filter(m => 
    m._id && m._id.sourcePlatform === platform && 
    m._id.sourceContext === context
  );
  
  if (relevant.length === 0) return 'professional';
  
  const toneScores = {};
  for (const metric of relevant) {
    const tone = metric._id?.tone || 'professional';
    const successRate = (metric.hired + metric.replied) / metric.total;
    
    if (!toneScores[tone]) {
      toneScores[tone] = { total: 0, success: 0 };
    }
    toneScores[tone].total += metric.total;
    toneScores[tone].success += metric.hired + metric.replied;
  }
  
  let bestTone = 'professional';
  let bestRate = 0;
  
  for (const [tone, data] of Object.entries(toneScores)) {
    const rate = data.success / data.total;
    if (rate > bestRate) {
      bestRate = rate;
      bestTone = tone;
    }
  }
  
  return bestTone;
}

export async function shouldSkipPlatform(platform, context) {
  const metrics = await getLearningMetrics();
  
  if (!Array.isArray(metrics)) {
    return false;
  }
  
  const relevant = metrics.filter(m => 
    m._id && m._id.sourcePlatform === platform && 
    m._id.sourceContext === context
  );
  
  if (relevant.length < 5) return false;
  
  const total = relevant.reduce((sum, m) => sum + m.total, 0);
  const success = relevant.reduce((sum, m) => sum + m.hired + m.replied, 0);
  const successRate = success / total;
  
  return successRate < 0.1;
}

export async function runLearningCycle() {
  try {
    logger.learning.log('Starting learning cycle...');
    const metrics = await aggregateLearningMetrics();
    logger.learning.log(`Aggregated ${metrics.length} metric groups`);
    return metrics;
  } catch (error) {
    logger.error.log(`Error in learning cycle: ${error.message}`);
    return [];
  }
}

