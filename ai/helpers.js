import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function truncateText(text, maxLength = 1000) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function loadResumeData() {
  try {
    const resumePath = join(__dirname, '..', 'resume.json');
    const resumeData = readFileSync(resumePath, 'utf8');
    return JSON.parse(resumeData);
  } catch (error) {
    throw new Error(`Failed to load resume.json: ${error.message}`);
  }
}

export function parseTitleAndContent(text) {
  const titleMatch = text.match(/^Title:\s*(.+?)(?:\n|$)/i);
  const contentMatch = text.match(/(?:Content:|$)([\s\S]*)/i);
  const title = titleMatch ? titleMatch[1].trim() : text.split('\n')[0].substring(0, 200);
  const content = contentMatch ? contentMatch[1].trim() : text.substring(title.length).trim();
  return { title, content };
}

