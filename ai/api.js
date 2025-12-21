import dotenv from 'dotenv';

dotenv.config();

export async function openaiRequest(messages, options = {}) {
  const {
    model = 'gpt-3.5-turbo',
    temperature = 0.1,
    max_tokens = 100
  } = options;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens
    })
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

