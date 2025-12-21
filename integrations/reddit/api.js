import dotenv from 'dotenv';

dotenv.config();

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  
  if (accessToken && now < tokenExpiry) {
    return accessToken;
  }
  
  const credentials = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString('base64');
  
  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT
    },
    body: 'grant_type=client_credentials'
  });
  
  if (!response.ok) {
    throw new Error(`Reddit auth failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = now + (data.expires_in * 1000) - 60000;
  
  return accessToken;
}

export async function redditRequest(endpoint, options = {}) {
  const token = await getAccessToken();
  
  const response = await fetch(`https://oauth.reddit.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': process.env.REDDIT_USER_AGENT,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    throw new Error(`Reddit API failed: ${response.statusText}`);
  }
  
  return response.json();
}

