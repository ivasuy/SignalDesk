import chalk from 'chalk';

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let currentFrame = 0;
let loaderInterval = null;

export function startLoader(message) {
  if (loaderInterval) {
    clearInterval(loaderInterval);
  }
  
  currentFrame = 0;
  process.stdout.write('\r');
  
  loaderInterval = setInterval(() => {
    const frame = frames[currentFrame % frames.length];
    process.stdout.write(`\r${chalk.cyan(frame)} ${chalk.gray(message)}`);
    currentFrame++;
  }, 100);
  
  return loaderInterval;
}

export function stopLoader(finalMessage = '') {
  if (loaderInterval) {
    clearInterval(loaderInterval);
    loaderInterval = null;
  }
  
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  
  if (finalMessage) {
    console.log(finalMessage);
  }
}

