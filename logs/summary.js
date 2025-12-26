import { THEMES } from './themes.js';
import { PLATFORM_LABELS } from './constants.js';
import { formatTimestamp } from './formatter.js';
import { renderBox, renderKeyValue } from './tables.js';

export function logPlatformSummary(platform, stats) {
  const label = PLATFORM_LABELS[platform] || `[${platform.toUpperCase()}]`;
  const platformColor = THEMES.PLATFORM[platform] || THEMES.INFO;
  
  const aiCalls = stats.aiCalls || {};
  const totalAICalls = (aiCalls.skillFilter || 0) + (aiCalls.classification || 0) + (aiCalls.capSelection || 0) + 
                       (aiCalls.reply || 0) + (aiCalls.coverLetter || 0) + (aiCalls.resume || 0);
  
  const title = `${platform.toUpperCase()} SUMMARY`;
  const rows = [
    renderKeyValue('Fetched', String(stats.fetched || 0)),
    renderKeyValue('Keyword Accepted', String(stats.keywordAccepted || 0)),
    renderKeyValue('AI Classified', String(stats.aiClassified || 0)),
    renderKeyValue('Cap Accepted', String(stats.capAccepted || 0)),
    renderKeyValue('Sent', String(stats.sent || 0)),
    '',
    renderKeyValue('AI Calls (Total)', String(totalAICalls || stats.aiCalls || 0)),
    renderKeyValue('  - Skill Filter', String(aiCalls.skillFilter || 0)),
    renderKeyValue('  - Classification', String(aiCalls.classification || 0)),
    renderKeyValue('  - Cap Selection', String(aiCalls.capSelection || 0)),
    renderKeyValue('  - Reply', String(aiCalls.reply || 0)),
    renderKeyValue('  - Cover Letter', String(aiCalls.coverLetter || 0)),
    renderKeyValue('  - Resume', String(aiCalls.resume || 0)),
    '',
    renderKeyValue('Errors', String(stats.errors || 0)),
    renderKeyValue('Duration', stats.duration || '0ms')
  ];
  
  console.log('\n' + platformColor(renderBox(title, rows)) + '\n');
}

export function logDailySummary(stats) {
  const title = 'DAILY PROCESSING SUMMARY';
  const rows = [
    renderKeyValue('Total Fetched', String(stats.totalFetched || 0)),
    renderKeyValue('Total Processed', String(stats.totalProcessed || 0)),
    renderKeyValue('Total Sent', String(stats.totalSent || 0)),
    '',
    renderKeyValue('Total AI Calls', String(stats.totalAICalls || 0)),
    renderKeyValue('  - Classification', String(stats.classificationCalls || 0)),
    renderKeyValue('  - Reply', String(stats.replyCalls || 0)),
    renderKeyValue('  - Resume', String(stats.resumeCalls || 0)),
    '',
    renderKeyValue('Total Errors', String(stats.totalErrors || 0)),
    renderKeyValue('Total Duration', stats.totalDuration || '0ms')
  ];
  
  console.log('\n' + THEMES.HEADER(renderBox(title, rows)) + '\n');
}

export function logPlatformBreakdown(platforms) {
  const title = 'PLATFORM BREAKDOWN';
  const rows = [];
  
  for (const [platform, stats] of Object.entries(platforms)) {
    const label = PLATFORM_LABELS[platform] || platform.toUpperCase();
    rows.push(`${label}:`);
    rows.push(renderKeyValue('  Fetched', String(stats.fetched || 0)));
    rows.push(renderKeyValue('  Keyword Accepted', String(stats.keywordAccepted || 0)));
    rows.push(renderKeyValue('  AI Classified', String(stats.aiClassified || 0)));
    rows.push(renderKeyValue('  Cap Accepted', String(stats.capAccepted || 0)));
    rows.push(renderKeyValue('  Sent', String(stats.sent || 0)));
    rows.push('');
  }
  
  if (rows.length > 0 && rows[rows.length - 1] === '') {
    rows.pop();
  }
  
  console.log('\n' + THEMES.SECTION(renderBox(title, rows)) + '\n');
}

