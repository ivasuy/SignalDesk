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

