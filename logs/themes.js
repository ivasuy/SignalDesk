import chalk from 'chalk';

export const THEMES = {
  HEADER: chalk.magenta.bold,
  SECTION: chalk.cyan,
  INFO: chalk.white,
  SUCCESS: chalk.green,
  WARNING: chalk.yellow,
  ERROR: chalk.red,
  MUTED: chalk.gray,
  BRIGHT_CYAN: chalk.cyan.bold,
  BRIGHT_YELLOW: chalk.yellow.bold,
  PLATFORM: {
    reddit: chalk.hex('#FF4500'),
    github: chalk.white,
    hackernews: chalk.blue,
    producthunt: chalk.hex('#DA552F'),
    wellfound: chalk.hex('#FF69B4')
  }
};

