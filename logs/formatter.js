import { PLATFORM_LABELS } from './constants.js';
import { THEMES } from './themes.js';

export function formatTimestamp() {
  return THEMES.MUTED(`[${new Date().toISOString()}]`);
}

export function formatPlatformLabel(platform) {
  const label = PLATFORM_LABELS[platform] || `[${platform.toUpperCase()}]`;
  const color = THEMES.PLATFORM[platform] || THEMES.INFO;
  return color(label);
}

export function formatRunId(platform, runId) {
  const label = formatPlatformLabel(platform);
  return `${label}[runId=${runId}]`;
}

export function formatSectionHeader(text, color = THEMES.SECTION) {
  return `\n${color('========== ' + text + ' ==========')}\n`;
}

export function formatSectionFooter(text, color = THEMES.SECTION) {
  return `${color('========== ' + text + ' ==========')}\n`;
}

export function formatLogLevel(level, message) {
  const color = THEMES[level.toUpperCase()] || THEMES.INFO;
  return `${formatTimestamp()} ${color(level.toUpperCase())} ${message}`;
}

export function formatDuration(ms) {
  return `${ms}ms`;
}

export function formatISTTime(date) {
  const istDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hours = istDate.getHours().toString().padStart(2, '0');
  const minutes = istDate.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes} IST`;
}

export function formatPercentage(value, total) {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

