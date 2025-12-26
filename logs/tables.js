import chalk from 'chalk';
import { THEMES } from './themes.js';

export { THEMES };

const BOX_CHARS = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  cross: '┼',
  topT: '┬',
  bottomT: '┴',
  leftT: '├',
  rightT: '┤'
};

function createBox(title, width = 78) {
  const titleLen = title.length;
  // Account for: left border (1) + space (1) + title + space (1) + right border (1) = titleLen + 4
  const padding = Math.max(0, width - titleLen - 4);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  
  const top = BOX_CHARS.topLeft + 
    BOX_CHARS.horizontal.repeat(leftPad) + 
    ' ' + title + ' ' + 
    BOX_CHARS.horizontal.repeat(rightPad) + 
    BOX_CHARS.topRight;
  
  // Bottom must match top width exactly - calculate from actual top width
  const topWidth = top.length;
  const bottom = BOX_CHARS.bottomLeft + BOX_CHARS.horizontal.repeat(topWidth - 2) + BOX_CHARS.bottomRight;
  
  return {
    top,
    width,
    renderRow: (content) => {
      const maxLen = width - 4;
      const truncated = content.length > maxLen ? content.substring(0, maxLen - 3) + '...' : content;
      const padded = truncated.padEnd(maxLen);
      return BOX_CHARS.vertical + ' ' + padded + ' ' + BOX_CHARS.vertical;
    },
    bottom
  };
}

export function renderBox(title, rows, width = 78) {
  const box = createBox(title, width);
  const lines = [box.top];
  
  for (const row of rows) {
    if (row === '') {
      lines.push(box.renderRow(''));
    } else {
      lines.push(box.renderRow(row));
    }
  }
  
  lines.push(box.bottom);
  return lines.join('\n');
}

export function renderKeyValue(key, value, width = 78) {
  const keyWidth = 20;
  const paddedKey = key.padEnd(keyWidth);
  return `${paddedKey}: ${value}`;
}

export function renderTable(rows, columnWidths) {
  const lines = [];
  const totalWidth = columnWidths.reduce((a, b) => a + b, 0) + columnWidths.length + 1;
  
  const top = BOX_CHARS.topLeft + 
    columnWidths.map(w => BOX_CHARS.horizontal.repeat(w)).join(BOX_CHARS.topT) + 
    BOX_CHARS.topRight;
  
  lines.push(top);
  
  for (const row of rows) {
    const cells = row.map((cell, i) => {
      const width = columnWidths[i];
      if (typeof cell === 'number') {
        return String(cell).padStart(width);
      }
      return String(cell).padEnd(width);
    });
    lines.push(BOX_CHARS.vertical + cells.join(BOX_CHARS.vertical) + BOX_CHARS.vertical);
  }
  
  lines.push(BOX_CHARS.bottomLeft + 
    columnWidths.map(w => BOX_CHARS.horizontal.repeat(w)).join(BOX_CHARS.bottomT) + 
    BOX_CHARS.bottomRight);
  
  return lines.join('\n');
}

export function renderPlatformRun(platform, runId, data) {
  const title = `${platform.toUpperCase()} RUN`;
  const rows = [
    renderKeyValue('Run ID', runId),
    renderKeyValue('Date Filter', data.dateFilter || 'N/A'),
    renderKeyValue('Collection', data.collection || 'N/A'),
    renderKeyValue('Total Fetched', String(data.totalFetched || 0)),
    renderKeyValue('Keyword Passed', String(data.afterKeywordFilter || 0)),
  ];
  const platformColor = THEMES.PLATFORM[platform] || THEMES.INFO;
  return platformColor(renderBox(title, rows));
}

export function renderPipelineState(data) {
  const title = 'PIPELINE STATE';
  const rows = [
    renderKeyValue('Ingestion', data.ingestionComplete ? '✓ Complete' : '○ Pending'),
    renderKeyValue('Buffer Size', `${data.bufferSize || 0} items`),
    renderKeyValue('Batch Size', String(data.batchSize || 8)),
    renderKeyValue('Est. Batches', String(data.estimatedBatches || 0)),
    renderKeyValue('Queue Pending', String(data.queuePending || 0)),
    renderKeyValue('Next Send', data.nextSend || 'N/A')
  ];
  return THEMES.WARNING(renderBox(title, rows));
}

export function renderClassifierBatch(data) {
  const title = 'CLASSIFIER BATCH';
  const rows = [
    renderKeyValue('Batch', `${data.batchNumber || 0} / ${data.totalBatches || 0}`),
    renderKeyValue('Batch Size', String(data.batchSize || 0)),
    renderKeyValue('Platforms', data.platforms?.join(', ') || 'N/A'),
    renderKeyValue('Processed', String(data.processed || 0)),
    renderKeyValue('Accepted', String(data.accepted || 0)),
    renderKeyValue('Rejected', String(data.rejected || 0)),
    renderKeyValue('Enqueued', String(data.enqueued || 0)),
    renderKeyValue('Duration', `${(data.duration || 0) / 1000}s`)
  ];
  return THEMES.SECTION(renderBox(title, rows));
}

export function renderDeliveryQueue(data) {
  const title = 'DELIVERY QUEUE';
  const rows = [
    renderKeyValue('Pending', String(data.pending || 0)),
    renderKeyValue('High Priority', String(data.highPriority || 0)),
    ''
  ];
  
  if (data.upcoming && data.upcoming.length > 0) {
    rows.push('Upcoming Sends :');
    rows.push(...data.upcoming.slice(0, 3).map(item => 
      `  ${item.time}  ${item.platform}  ${item.postId.substring(0, 20)}`
    ));
    rows.push('');
  }
  
  rows.push('Per Platform   :');
  rows.push(renderKeyValue('Reddit', String(data.platforms?.reddit || 0)));
  rows.push(renderKeyValue('GitHub', String(data.platforms?.github || 0)));
  rows.push(renderKeyValue('HackerNews', String(data.platforms?.hn || 0)));
  rows.push(renderKeyValue('ProductHunt', String(data.platforms?.producthunt || 0)));
  
  return chalk.blue(renderBox(title, rows));
}

export function renderError(data) {
  const title = 'ERROR';
  const rows = [
    renderKeyValue('Platform', data.platform || 'N/A'),
    renderKeyValue('Stage', data.stage || 'N/A'),
    renderKeyValue('Post ID', data.postId || 'N/A'),
    renderKeyValue('Reason', data.reason || 'N/A'),
    renderKeyValue('Action', data.action || 'N/A')
  ];
  return THEMES.ERROR(renderBox(title, rows));
}

export function renderCostSnapshot(data) {
  const title = 'COST SNAPSHOT';
  const rows = [
    renderKeyValue('Classification Calls', String(data.classificationCalls || 0)),
    renderKeyValue('Resume Generations', String(data.resumeGenerations || 0)),
    renderKeyValue('Active Platforms', String(data.activePlatforms || 0))
  ];
  return renderBox(title, rows);
}

export function renderHealth(data) {
  const title = 'HEALTH';
  const rows = [
    renderKeyValue('Platform', data.platform || 'N/A'),
    renderKeyValue('Keyword Pass %', `${data.keywordPassRate || 0}%`),
    renderKeyValue('AI Accept %', `${data.aiAcceptRate || 0}%`),
    renderKeyValue('Errors', String(data.errors || 0))
  ];
  return THEMES.SUCCESS(renderBox(title, rows));
}

export function renderDedupSummary(data) {
  const title = 'DEDUP SUMMARY';
  const rows = [
    renderKeyValue('Already Classified', String(data.already_classified || 0)),
    renderKeyValue('Already Sent', String(data.already_sent || 0)),
    renderKeyValue('Already In Buffer', String(data.already_in_buffer || 0)),
    renderKeyValue('Total Skipped', String(data.total || 0))
  ];
  return THEMES.BRIGHT_YELLOW(renderBox(title, rows));
}

export function renderFetchCriteria(platform, criteria) {
  const title = `${platform.toUpperCase()} FETCH CRITERIA`;
  const rows = [];
  for (const [key, value] of Object.entries(criteria)) {
    const valueStr = String(value);
    if (valueStr.includes('\n')) {
      const lines = valueStr.split('\n');
      rows.push(renderKeyValue(key, lines[0]));
      for (let i = 1; i < lines.length; i++) {
        rows.push('  ' + lines[i]);
      }
    } else {
      rows.push(renderKeyValue(key, valueStr));
    }
  }
  return THEMES.SECTION(renderBox(title, rows));
}

