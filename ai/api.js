import dotenv from 'dotenv';
import { logAI } from '../logs/index.js';
import { getDailyDeliveryState } from '../db/state.js';

dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_REQUESTS_PER_MINUTE = 20;
const MAX_CONCURRENT_REQUESTS = 3;
const TOKEN_REFILL_INTERVAL_MS = 3000;

let availableTokens = MAX_REQUESTS_PER_MINUTE;
let concurrentRequests = 0;
let lastRefillTime = Date.now();

const requestQueue = [];
let isProcessingQueue = false;

const costCounters = {
  classification: 0,
  reply: 0,
  resume: 0
};

function refillTokens() {
  const now = Date.now();
  const elapsed = now - lastRefillTime;
  const tokensToAdd = Math.floor(elapsed / TOKEN_REFILL_INTERVAL_MS);
  
  if (tokensToAdd > 0) {
    availableTokens = Math.min(MAX_REQUESTS_PER_MINUTE, availableTokens + tokensToAdd);
    lastRefillTime = now;
  }
}

async function waitForToken() {
  while (availableTokens <= 0 || concurrentRequests >= MAX_CONCURRENT_REQUESTS) {
    refillTokens();
    
    if (availableTokens <= 0) {
      const waitTime = TOKEN_REFILL_INTERVAL_MS;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } else if (concurrentRequests >= MAX_CONCURRENT_REQUESTS) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  refillTokens();
  availableTokens--;
  concurrentRequests++;
}

async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) {
    return;
  }
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const { resolve, reject, messages, options, purpose } = requestQueue.shift();
    
    try {
      await waitForToken();
      const result = await makeGroqRequest(messages, options, purpose);
      concurrentRequests--;
      resolve(result);
    } catch (error) {
      concurrentRequests--;
      reject(error);
    }
  }
  
  isProcessingQueue = false;
}

async function makeGroqRequest(messages, options, purpose, retryCount = 0) {
  const startTime = Date.now();
  const { model, temperature = 0, top_p = 0.9, max_tokens = 100 } = options;
  const MAX_RETRIES = 1;
  
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY environment variable is not set');
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const response = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10) * 1000;
      logAI(`[RATE] Groq rate limited, retrying after ${retryAfter}ms`);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      return makeGroqRequest(messages, options, purpose, retryCount);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim() || '';
    
    logAI(`[AI] Provider=groq model=${model} purpose=${purpose} latency=${latency}ms`);
    
    if (purpose === 'classification') {
      costCounters.classification++;
    } else if (purpose === 'reply') {
      costCounters.reply++;
    } else if (purpose === 'resume') {
      costCounters.resume++;
    }
    
    return content;
  } catch (error) {
    if (error.name === 'AbortError' && retryCount < MAX_RETRIES) {
      logAI(`[AI] Groq timeout, retrying (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      return makeGroqRequest(messages, options, purpose, retryCount + 1);
    }
    throw error;
  }
}

export async function groqRequest(messages, options = {}, purpose = 'unknown') {
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, messages, options, purpose });
    processQueue();
  });
}

export function getCostCounters() {
  return { ...costCounters };
}

export function resetCostCounters() {
  costCounters.classification = 0;
  costCounters.reply = 0;
  costCounters.resume = 0;
}

let costLogInterval = null;

export function startCostLogging() {
  if (costLogInterval) {
    return;
  }
  
  costLogInterval = setInterval(async () => {
    try {
      const dailyState = await getDailyDeliveryState();
      if (!dailyState.active) {
        return;
      }
      
      const counters = getCostCounters();
      const total = counters.classification + counters.reply + counters.resume;
      if (total > 0) {
        logAI(`[COST] Groq calls today: classification=${counters.classification} replies=${counters.reply} resume=${counters.resume} total=${total}`);
      }
    } catch (error) {
    }
  }, 60000);
}

export function stopCostLogging() {
  if (costLogInterval) {
    clearInterval(costLogInterval);
    costLogInterval = null;
  }
}

export function getAICallCounts() {
  const counters = getCostCounters();
  return {
    classification: counters.classification || 0,
    reply: counters.reply || 0,
    resume: counters.resume || 0,
    total: (counters.classification || 0) + (counters.reply || 0) + (counters.resume || 0)
  };
}

startCostLogging();
