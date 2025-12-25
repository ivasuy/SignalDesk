import { formatTimestamp, formatISTTime, formatDuration } from './formatter.js';
import { THEMES } from './themes.js';
import { PLATFORM_LABELS } from './constants.js';
import { startLoader, stopLoader } from './loader.js';
import {
  renderPlatformRun,
  renderPipelineState,
  renderClassifierBatch,
  renderDeliveryQueue,
  renderCostSnapshot,
  renderHealth,
  renderDedupSummary,
  renderFetchCriteria
} from './tables.js';

// ============================================================================
// BASIC LOGGING FUNCTIONS
// ============================================================================

export function logInfo(message, metadata = {}) {
  console.log(`${formatTimestamp()} [INFO] ${message}`);
}

export function logWarn(message, metadata = {}) {
  console.log(THEMES.WARNING(`${formatTimestamp()} [WARN] ${message}`));
}

export function logError(message, metadata = {}) {
  const timestamp = formatTimestamp();
  if (metadata.platform || metadata.stage || metadata.postId) {
    const platform = metadata.platform || 'N/A';
    const stage = metadata.stage || 'N/A';
    const postId = metadata.postId || 'N/A';
    const action = metadata.action || 'continue';
    const reason = message.replace(/"/g, '\\"');
    console.error(THEMES.ERROR(`${timestamp} [ERROR] platform=${platform} stage=${stage} postId=${postId} reason="${reason}" action=${action}`));
  } else {
    console.error(THEMES.ERROR(`${timestamp} [ERROR] ${message}`));
  }
}

export function logFatal(message) {
  console.error(THEMES.ERROR(`${formatTimestamp()} [FATAL] ${message}`));
}

export function logSuccess(message) {
  console.log(THEMES.SUCCESS(`${formatTimestamp()} [SUCCESS] ${message}`));
}

// ============================================================================
// AI LOGGING
// ============================================================================

export function logAI(message, metadata = {}) {
  console.log(THEMES.INFO(`${formatTimestamp()} [AI] ${message}`));
}

// ============================================================================
// PLATFORM FUNCTIONS (for legacy integrations)
// ============================================================================

export function generateRunId(platform) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  return `${platform}-${year}${month}${day}-${hour}`;
}

export function logPlatformStart(platform, runId) {
  const label = PLATFORM_LABELS[platform] || `[${platform.toUpperCase()}]`;
  console.log(`${label} Fetch start`);
}

let platformLoaders = {};

export function logPlatformFetching(platform) {
  const label = PLATFORM_LABELS[platform] || `[${platform.toUpperCase()}]`;
  
  if (platformLoaders[platform]) {
    return;
  }
  
  platformLoaders[platform] = startLoader(`${label} Fetching data`);
}

export function stopPlatformFetching(platform) {
  if (platformLoaders[platform]) {
    stopLoader();
    delete platformLoaders[platform];
  }
}

export function logPlatformComplete(platform, runId) {
  console.log(THEMES.SUCCESS(`[${platform.toUpperCase()}] Complete\n`));
}

// Legacy function for old integrations (uses runId)
export function logPlatformSummary(platform, runId, summary) {
  console.log('\n' + renderPlatformRun(platform, runId, summary) + '\n');
}

export function logFetchCriteria(platform, criteria) {
  console.log('\n' + renderFetchCriteria(platform, criteria) + '\n');
}

export function logPipelineState(data) {
  console.log('\n' + renderPipelineState(data) + '\n');
}

// ============================================================================
// LEGACY LOGGING (for old integrations)
// ============================================================================

export function logQueue(message, metadata = {}) {
  if (metadata.renderQueue) {
    console.log('\n' + renderDeliveryQueue(metadata.renderQueue) + '\n');
  } else {
    console.log(THEMES.INFO(`${formatTimestamp()} [QUEUE] ${message}`));
  }
}

export function logStats(message, metadata = {}) {
  console.log(THEMES.MUTED(`${formatTimestamp()} [STATS] ${message}`));
}

export function logHealth(message, metadata = {}) {
  if (metadata.renderHealth) {
    console.log('\n' + renderHealth(metadata.renderHealth) + '\n');
  } else {
    console.log(THEMES.SUCCESS(`${formatTimestamp()} [HEALTH] ${message}`));
  }
}

export function logCost(message, metadata = {}) {
  if (metadata.renderCost) {
    console.log('\n' + renderCostSnapshot(metadata.renderCost) + '\n');
  } else {
    console.log(THEMES.WARNING(`${formatTimestamp()} [COST] ${message}`));
  }
}

export function logDedup(message, metadata = {}) {
  if (metadata.renderDedup) {
    console.log('\n' + renderDedupSummary(metadata.renderDedup) + '\n');
  } else {
    console.log(THEMES.MUTED(`${formatTimestamp()} [DEDUP] ${message}`));
  }
}

export function logPlatform(message, metadata = {}) {
  console.log(THEMES.INFO(`${formatTimestamp()} [PLATFORM] ${message}`));
}

export function logClassifier(message, metadata = {}) {
  if (metadata.renderBatch) {
    console.log('\n' + renderClassifierBatch(metadata.renderBatch) + '\n');
  } else {
    console.log(`${formatTimestamp()} [CLASSIFIER] ${message}`);
  }
}

export function logStageTiming(stage, durationMs) {
  logStats(`Stage=${stage} Duration=${formatDuration(durationMs)}`);
}

// ============================================================================
// WHATSAPP LOGGING
// ============================================================================

export function logWhatsApp(message) {
  console.log(THEMES.SUCCESS(`${formatTimestamp()} [WhatsApp] ${message}`));
}

export function logWhatsAppSent() {
  logWhatsApp('message sent');
}

export function logWhatsAppPDFSent() {
  logWhatsApp('PDF sent');
}

export function logWhatsAppReady() {
  console.log(THEMES.SUCCESS('WhatsApp client is ready'));
}

export function logWhatsAppAuthenticated() {
  console.log(THEMES.SUCCESS('WhatsApp authenticated'));
}

export function logWhatsAppQR() {
  console.log(THEMES.SECTION('Scan this QR code with WhatsApp:'));
}

// ============================================================================
// MONGODB LOGGING
// ============================================================================

export function logMongoDB(message) {
  console.log(THEMES.SUCCESS(`${formatTimestamp()} [MongoDB] ${message}`));
}

export function logMongoDBConnected() {
  logMongoDB('connected');
}

// ============================================================================
// LEARNING LOGGING
// ============================================================================

export function logLearning(message) {
  console.log(THEMES.SECTION(`${formatTimestamp()} [Learning] ${message}`));
}

// ============================================================================
// EXPORTS
// ============================================================================

export { formatISTTime, formatDuration };
