import dotenv from 'dotenv';

dotenv.config();

const PRODUCTHUNT_API_URL = 'https://api.producthunt.com/v2/api/graphql';
const API_TOKEN = process.env.PRODUCTHUNT_API_TOKEN;

export async function productHuntRequest(query, variables = {}) {
  if (!API_TOKEN) {
    throw new Error('PRODUCTHUNT_API_TOKEN not set in .env');
  }

  const response = await fetch(PRODUCTHUNT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`,
      'User-Agent': 'Mozilla/5.0'
    },
    body: JSON.stringify({
      query,
      variables
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`Product Hunt API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Product Hunt API errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

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

export async function fetchProductHuntPosts() {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const dateStr = yesterday.toISOString();
    
    const data = await productHuntRequest(POSTS_QUERY, {
      postedAfter: dateStr,
      first: 50
    });
    
    if (!data || !data.posts || !data.posts.edges) {
      return [];
    }
    
    if (data.posts.edges.length === 0) {
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
    
    return posts;
  } catch (error) {
    return [];
  }
}

