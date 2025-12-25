import {
  OPPORTUNITY_KEYWORDS,
  TECH_KEYWORDS,
  EXCLUSION_KEYWORDS
} from '../utils/constants.js';

export function isForHirePost(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return EXCLUSION_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

export function matchesKeywords(text, requireTechKeyword = true) {
  if (!text) return false;
  
  if (isForHirePost(text)) {
    return false;
  }
  
  const lowerText = text.toLowerCase();
  
  const hasOpportunityKeyword = OPPORTUNITY_KEYWORDS.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
  
  if (!hasOpportunityKeyword) {
    return false;
  }
  
  if (!requireTechKeyword) {
    return true;
  }
  
  const hasTechKeyword = TECH_KEYWORDS.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
  
  return hasTechKeyword;
}

