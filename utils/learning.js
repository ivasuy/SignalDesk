import { aggregateLearningMetrics, getLearningMetrics } from './db.js';
import { logger } from './logger.js';

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

