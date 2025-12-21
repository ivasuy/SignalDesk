import { OPPORTUNITY_KEYWORDS, TECH_KEYWORDS, EXCLUSION_KEYWORDS } from './config.js';

export function isForHirePost(text) {
  const lowerText = text.toLowerCase();
  return EXCLUSION_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

export function matchesKeywords(text) {
  if (isForHirePost(text)) {
    return false;
  }
  
  const lowerText = text.toLowerCase();
  
  const hasOpportunityKeyword = OPPORTUNITY_KEYWORDS.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
  
  const hasTechKeyword = TECH_KEYWORDS.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
  
  return hasOpportunityKeyword && hasTechKeyword;
}

