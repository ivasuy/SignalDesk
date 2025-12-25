
/**
 * Bucket items by recency (for GitHub issues)
 */
export function bucketByRecency(items, dateField = 'created_at') {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const twoDays = 2 * oneDay;
  const sevenDays = 7 * oneDay;
  
  const buckets = {
    last24h: [],
    oneToTwoDays: [],
    twoToSevenDays: []
  };
  
  for (const item of items) {
    const created = new Date(item[dateField]).getTime();
    const age = now - created;
    
    if (age <= oneDay) {
      buckets.last24h.push(item);
    } else if (age <= twoDays) {
      buckets.oneToTwoDays.push(item);
    } else if (age <= sevenDays) {
      buckets.twoToSevenDays.push(item);
    }
  }
  
  return buckets;
}

/**
 * Filter items by time buckets (for HackerNews - uses Unix timestamps)
 */
export function filterByTimeBuckets(items, timeField = 'time') {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - (24 * 60 * 60);
  const twoDaysAgo = now - (2 * 24 * 60 * 60);
  const oneWeekAgo = now - (7 * 24 * 60 * 60);
  
  const sorted = items
    .filter(item => item[timeField] >= oneWeekAgo)
    .sort((a, b) => b[timeField] - a[timeField]);
  
  return {
    last24h: sorted.filter(item => item[timeField] >= oneDayAgo),
    oneToTwoDays: sorted.filter(item => item[timeField] >= twoDaysAgo && item[timeField] < oneDayAgo),
    twoToSevenDays: sorted.filter(item => item[timeField] >= oneWeekAgo && item[timeField] < twoDaysAgo)
  };
}

/**
 * Process batches with early stopping logic (for GitHub)
 */
export async function processBatchesWithEarlyStop(buckets, processFn, logger = { log: () => {} }) {
  let processed24h = await processFn(buckets.last24h, 'last24h');
  logger.log(`Processed 24h bucket: ${processed24h} opportunities`);
  
  if (processed24h === 0) {
    let processed1to2 = await processFn(buckets.oneToTwoDays, 'oneToTwoDays');
    logger.log(`Processed 1-2d bucket: ${processed1to2} opportunities`);
    
    if (processed1to2 === 0) {
      logger.log('Two consecutive buckets produced zero opportunities. Stopping early.');
    } else {
      await processFn(buckets.twoToSevenDays, 'twoToSevenDays');
    }
  } else {
    await processFn(buckets.oneToTwoDays, 'oneToTwoDays');
    await processFn(buckets.twoToSevenDays, 'twoToSevenDays');
  }
}

/**
 * Process batches sequentially (for HackerNews)
 */
export async function processBatchesSequentially(buckets, processFn) {
  await processFn(buckets.last24h, '24h');
  await processFn(buckets.oneToTwoDays, '1day');
  await processFn(buckets.twoToSevenDays, 'week');
}


/**
 * Calculate batch size and estimated batches for classification buffer
 * Ensures estimatedBatches never exceeds MAX_BATCHES
 * 
 * @param {number} remaining - Number of items in classification buffer
 * @param {number} maxBatches - Maximum number of batches allowed (default: 5)
 * @returns {Object} { batchSize, estimatedBatches }
 */
export function calculateBatchSize(remaining, maxBatches = 5) {
  if (remaining === 0) {
    return { batchSize: 0, estimatedBatches: 0 };
  }
  
  // If remaining <= maxBatches, use remaining as batchSize (results in 1 batch)
  if (remaining <= maxBatches) {
    return { batchSize: remaining, estimatedBatches: 1 };
  }
  
  // Calculate batch size to ensure max batches is never exceeded
  // batchSize = ceil(remaining / maxBatches)
  // But ensure batchSize >= 5 when remaining >= 5
  let batchSize = Math.ceil(remaining / maxBatches);
  if (remaining >= 5 && batchSize < 5) {
    batchSize = 5;
  }
  
  // Ensure batchSize doesn't exceed remaining
  batchSize = Math.min(batchSize, remaining);
  
  // Calculate estimated batches
  const estimatedBatches = Math.ceil(remaining / batchSize);
  
  // Ensure estimatedBatches never exceeds maxBatches
  const finalEstimatedBatches = Math.min(estimatedBatches, maxBatches);
  
  return { batchSize, estimatedBatches: finalEstimatedBatches };
}

