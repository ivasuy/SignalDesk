export async function hnRequest(endpoint) {
  const response = await fetch(`https://hacker-news.firebaseio.com/v0${endpoint}`);
  
  if (!response.ok) {
    throw new Error(`Hacker News API failed: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getItem(itemId) {
  return hnRequest(`/item/${itemId}.json`);
}

export async function getUser(userId) {
  return hnRequest(`/user/${userId}.json`);
}

export async function getJobStories() {
  return hnRequest('/jobstories.json');
}

export async function getNewStories() {
  return hnRequest('/newstories.json');
}

export async function getTopStories() {
  return hnRequest('/topstories.json');
}

export async function getUserSubmissions(userId) {
  const user = await getUser(userId);
  return user?.submitted || [];
}

export async function fetchJobDescription(job) {
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

export function normalizeJob(job, cleanTitle, cleanHTML) {
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

export async function findLatestHiringPost() {
  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
  
  try {
    const whoishiringSubmissions = await getUserSubmissions('whoishiring');
    
    for (const storyId of whoishiringSubmissions.slice(0, 30)) {
      const story = await getItem(storyId);
      
      if (!story || !story.title || !story.time) continue;
      
      if (story.time < ninetyDaysAgo) continue;
      
      const titleLower = story.title.toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .trim();
      
      const hiringPatterns = [
        'ask hn: who is hiring',
        'ask hn: who wants to be hired',
        'freelancer? seeking freelancer'
      ];
      
      if (hiringPatterns.some(pattern => titleLower.includes(pattern))) {
        return story;
      }
    }
  } catch (error) {
  }
  
  const [newStoryIds, topStoryIds] = await Promise.all([
    getNewStories(),
    getTopStories()
  ]);
  
  const allStoryIds = [...new Set([...newStoryIds, ...topStoryIds])].slice(0, 500);
  
  for (const storyId of allStoryIds) {
    const story = await getItem(storyId);
    
    if (!story || !story.title || !story.time) continue;
    
    if (story.time < ninetyDaysAgo) continue;
    
    const titleLower = story.title.toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();
    
    const hiringPatterns = [
      'ask hn: who is hiring',
      'ask hn: who wants to be hired',
      'freelancer? seeking freelancer'
    ];
    
    if (hiringPatterns.some(pattern => titleLower.includes(pattern))) {
      return story;
    }
  }
  
  return null;
}

export async function getTopLevelComments(postId) {
  const post = await getItem(postId);
  if (!post || !post.kids) return [];
  
  const comments = await Promise.all(
    post.kids.slice(0, 100).map(kidId => getItem(kidId))
  );
  
  return comments.filter(comment => 
    comment && 
    !comment.deleted && 
    !comment.dead &&
    comment.text
  );
}

export function normalizeComment(comment, parentPost, cleanTitle, cleanHTML) {
  const cleanedText = cleanHTML(comment.text);
  const title = cleanTitle(cleanedText.split('\n')[0] || cleanedText.substring(0, 200));
  
  return {
    id: `hn-${comment.id}`,
    title: title || 'Hacker News Comment',
    selftext: cleanedText,
    permalink: `https://news.ycombinator.com/item?id=${comment.id}`,
    created_utc: comment.time,
    author: comment.by || 'unknown',
    source: 'hackernews-ask-hiring',
    parentPostTitle: parentPost.title
  };
}

