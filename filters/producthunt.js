export function matchesProductHuntCollabFilter(name, tagline, description) {
  const text = `${name} ${tagline || ''} ${description || ''}`.toLowerCase();
  const collabKeywords = [
    'collab',
    'open source',
    'contributors',
    'hiring',
    'early stage',
    'looking for dev',
    'looking for engineer'
  ];
  return collabKeywords.some(keyword => text.includes(keyword));
}

export function shouldExcludeProductHunt(description) {
  if (!description) return false;
  const text = description.toLowerCase();
  const excludePatterns = ['launched', 'v1 complete', 'fully built', 'scaling'];
  return excludePatterns.some(pattern => text.includes(pattern));
}

export function shouldIncludeProductHuntPost(name, tagline, description) {
  if (!name) {
    return false;
  }
  
  if (shouldExcludeProductHunt(description)) {
    return false;
  }
  
  if (!matchesProductHuntCollabFilter(name, tagline, description)) {
    return false;
  }
  
  return true;
}

