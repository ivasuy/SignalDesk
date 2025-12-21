import chalk from 'chalk';

const colors = {
  mongodb: chalk.green,
  reddit: chalk.hex('#FF4500'), // Orange-red (Reddit's color)
  hackernews: chalk.blue,
  wellfound: chalk.hex('#FF69B4'), // Pink color
  producthunt: chalk.hex('#DA552F'), // Product Hunt orange
  github: chalk.white, // GitHub color
  error: chalk.red,
  success: chalk.green,
  info: chalk.cyan,
  warning: chalk.yellow,
  timestamp: chalk.gray,
  highlight: chalk.bold.white
};

function formatTimestamp() {
  return colors.timestamp(`[${new Date().toISOString()}]`);
}

export const logger = {
  mongodb: {
    log: (message) => console.log(`${formatTimestamp()} ${colors.mongodb('MongoDB')} ${message}`),
    connected: () => console.log(`${formatTimestamp()} ${colors.mongodb('MongoDB connected')}`)
  },
  
  reddit: {
    log: (message) => console.log(`${formatTimestamp()} ${colors.reddit('Reddit')} ${message}`),
    scrapingStart: () => console.log(`\n${formatTimestamp()} ${colors.reddit('========== Reddit Scraping Started ==========')}`),
    scrapingComplete: () => console.log(`${formatTimestamp()} ${colors.reddit('========== Reddit Scraping Ended ==========')}\n`),
    summary: (message) => console.log(`${formatTimestamp()} ${colors.reddit('========== Reddit Scraping Summary ==========')}`),
    subreddit: (subreddit, message) => console.log(`  ${colors.reddit(`r/${subreddit}`)}: ${message}`),
    error: (subreddit, message) => console.error(`  ${colors.error('✗')} ${colors.reddit(`Error processing r/${subreddit}`)}: ${colors.error(message)}`)
  },
  
  hackernews: {
    log: (message) => console.log(`${formatTimestamp()} ${colors.hackernews('HackerNews')} ${message}`),
    scrapingStart: () => console.log(`\n${formatTimestamp()} ${colors.hackernews('========== Hacker News Scraping Started ==========')}`),
    scrapingComplete: () => console.log(`${formatTimestamp()} ${colors.hackernews('========== Hacker News Complete ==========')}\n`),
    summary: () => console.log(`${formatTimestamp()} ${colors.hackernews('========== Hacker News Summary ==========')}`),
    stats: (source, message) => console.log(`${colors.hackernews(source)}: ${message}`)
  },
  
  wellfound: {
    log: (message) => console.log(`${formatTimestamp()} ${colors.wellfound('Wellfound')} ${message}`),
    scrapingStart: () => console.log(`\n${formatTimestamp()} ${colors.wellfound('========== Wellfound Scraping Started ==========')}`),
    scrapingComplete: () => console.log(`${formatTimestamp()} ${colors.wellfound('========== Wellfound Scraping Complete ==========')}\n`),
    summary: () => console.log(`${formatTimestamp()} ${colors.wellfound('========== Wellfound Scraping Summary ==========')}`)
  },
  
  producthunt: {
    log: (message) => console.log(`${formatTimestamp()} ${colors.producthunt('ProductHunt')} ${message}`),
    scrapingStart: () => console.log(`\n${formatTimestamp()} ${colors.producthunt('========== Product Hunt Scraping Started ==========')}`),
    scrapingComplete: () => console.log(`${formatTimestamp()} ${colors.producthunt('========== Product Hunt Scraping Complete ==========')}\n`),
    summary: () => console.log(`${formatTimestamp()} ${colors.producthunt('========== Product Hunt Scraping Summary ==========')}`)
  },
  
  github: {
    log: (message) => console.log(`${formatTimestamp()} ${colors.github('GitHub')} ${message}`),
    scrapingStart: () => console.log(`\n${formatTimestamp()} ${colors.github('========== GitHub Scraping Started ==========')}`),
    scrapingComplete: () => console.log(`${formatTimestamp()} ${colors.github('========== GitHub Scraping Complete ==========')}\n`),
    summary: () => console.log(`${formatTimestamp()} ${colors.github('========== GitHub Scraping Summary ==========')}`)
  },
  
  learning: {
    log: (message) => console.log(`${formatTimestamp()} ${colors.info('Learning')} ${message}`)
  },
  
  whatsapp: {
    log: (message) => console.log(`${formatTimestamp()} ${colors.success('WhatsApp')} ${message}`),
    sent: () => console.log(`${formatTimestamp()} ${colors.success('WhatsApp message sent')}`),
    pdfSent: () => console.log(`${formatTimestamp()} ${colors.success('WhatsApp PDF sent')}`),
    ready: () => console.log(`${colors.success('WhatsApp client is ready')}`),
    authenticated: () => console.log(`${colors.success('WhatsApp authenticated')}`),
    qr: () => console.log(`${colors.info('Scan this QR code with WhatsApp:')}`)
  },
  
  error: {
    log: (message) => console.error(`${formatTimestamp()} ${colors.error('ERROR')} ${colors.error(message)}`),
    fatal: (message) => console.error(`${formatTimestamp()} ${colors.error('FATAL ERROR')} ${colors.error(message)}`),
    warning: (message) => console.warn(`${formatTimestamp()} ${colors.warning('WARNING')} ${colors.warning(message)}`)
  },
  
  stats: {
    total: (scraped, filtered, classified, opportunities, highValue) => {
      console.log(`${formatTimestamp()} ${colors.highlight('Total')}: ${colors.info(scraped)} scraped → ${colors.info(filtered)} keyword matched → ${colors.info(classified)} AI classified → ${colors.success(opportunities)} opportunities ${colors.highlight(`(${highValue} high-value)`)}`);
    },
    subreddit: (subreddit, scraped, filtered, classified, opportunities, highValue) => {
      const parts = [
        colors.info(scraped),
        colors.info(filtered),
        colors.info(classified),
        colors.success(opportunities),
        colors.highlight(`(${highValue} high-value)`)
      ];
      console.log(`  ${colors.reddit(`r/${subreddit}`)}: ${parts[0]} scraped → ${parts[1]} keyword matched → ${parts[2]} AI classified → ${parts[3]} opportunities ${parts[4]}`);
    },
    hackernews: (source, scraped, filtered, classified, opportunities, highValue) => {
      const parts = [
        colors.info(scraped),
        colors.info(filtered),
        colors.info(classified),
        colors.success(opportunities),
        colors.highlight(`(${highValue} high-value)`)
      ];
      console.log(`${colors.hackernews(source)}: ${parts[0]} scraped → ${parts[1]} filtered → ${parts[2]} classified → ${parts[3]} opportunities ${parts[4]}`);
    },
    wellfound: (scraped, titleFiltered, classified, opportunities, highValue) => {
      const parts = [
        colors.info(scraped),
        colors.info(titleFiltered),
        colors.info(classified),
        colors.success(opportunities),
        colors.highlight(`(${highValue} high-value)`)
      ];
      console.log(`${colors.wellfound('Wellfound')}: ${parts[0]} scraped → ${parts[1]} title filtered → ${parts[2]} classified → ${parts[3]} opportunities ${parts[4]}`);
    },
    producthunt: (scraped, buildableEvaluated, buildableSelected, collabEvaluated, collabSelected, highValueCollab) => {
      const parts = [
        colors.info(scraped),
        colors.info(buildableEvaluated),
        colors.success(buildableSelected),
        colors.info(collabEvaluated),
        colors.success(collabSelected),
        colors.highlight(`(${highValueCollab} high-value)`)
      ];
      console.log(`${colors.producthunt('ProductHunt')}: ${parts[0]} scraped → ${parts[1]} buildable evaluated → ${parts[2]} selected → ${parts[3]} collab evaluated → ${parts[4]} selected ${parts[5]}`);
    },
    github: (scraped, skillFiltered, aiClassified, opportunities) => {
      const parts = [
        colors.info(scraped),
        colors.info(skillFiltered),
        colors.info(aiClassified),
        colors.success(opportunities)
      ];
      console.log(`${colors.github('GitHub')}: ${parts[0]} scraped → ${parts[1]} skill filtered → ${parts[2]} AI classified → ${parts[3]} opportunities`);
    }
  },
  
  info: (message) => console.log(`${formatTimestamp()} ${colors.info('INFO')} ${message}`),
  success: (message) => console.log(`${formatTimestamp()} ${colors.success('SUCCESS')} ${colors.success(message)}`)
};

