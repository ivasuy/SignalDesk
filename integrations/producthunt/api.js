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

