import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';
import { execSync, exec } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logWhatsApp, logWhatsAppSent, logWhatsAppPDFSent, logWhatsAppReady, logWhatsAppAuthenticated, logWhatsAppQR, logError } from '../../logs/index.js';
import { connectDB } from '../../db/connection.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let client = null;
let isReady = false;

function getChromePath() {
  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];

  for (const path of chromePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  try {
    if (process.platform === 'darwin') {
      const result = execSync('mdfind "kMDItemCFBundleIdentifier == \'com.google.Chrome\'"', { encoding: 'utf8' }).trim();
      if (result) {
        const chromePath = result.split('\n')[0] + '/Contents/MacOS/Google Chrome';
        if (existsSync(chromePath)) {
          return chromePath;
        }
      }
    }
  } catch (error) {
    
  }

  return undefined;
}

function killChromeProcesses() {
  return new Promise((resolve) => {
    try {
      if (process.platform === 'darwin') {
        exec('pkill -9 -f "Google Chrome" 2>/dev/null || true', () => {
          exec('pkill -9 -f "chromium" 2>/dev/null || true', () => {
            setTimeout(resolve, 500);
          });
        });
      } else {
        exec('pkill -9 -f "chrome" 2>/dev/null || true', () => {
          setTimeout(resolve, 500);
        });
      }
    } catch (error) {
      setTimeout(resolve, 500);
    }
  });
}

async function cleanupLockFiles() {
  try {
    await killChromeProcesses();
    
    const projectRoot = join(__dirname, '..', '..');
    const sessionDir = join(projectRoot, '.wwebjs_auth', 'session');
    const lockFile = join(sessionDir, 'SingletonLock');
    const lockFileAlt = join(sessionDir, 'SingletonSocket');
    
    const filesToClean = [lockFile, lockFileAlt];
    
    for (const file of filesToClean) {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
          logWhatsApp(`Cleaned up lock file: ${file.split('/').pop()}`);
        } catch (error) {
          logWhatsApp(`Lock file exists but could not be deleted: ${error.message}`);
        }
      }
    }
  } catch (error) {
    logWhatsApp(`Error during cleanup: ${error.message}`);
  }
}

async function cleanupWhatsApp() {
  if (client) {
    try {
      await client.destroy();
      logWhatsApp('WhatsApp client destroyed');
    } catch (error) {
      logError(`Error destroying WhatsApp client: ${error.message}`);
    }
    client = null;
    isReady = false;
  }
  cleanupLockFiles();
}

export function initializeWhatsApp() {
  return new Promise(async (resolve, reject) => {
    await cleanupLockFiles();
    
    setTimeout(() => {
      const chromePath = getChromePath();
      
      const puppeteerOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      };

      if (chromePath) {
        puppeteerOptions.executablePath = chromePath;
      }

      client = new Client({
        authStrategy: new LocalAuth({
          dataPath: join(__dirname, '..', '..', '.wwebjs_auth')
        }),
        puppeteer: puppeteerOptions
      });

      client.on('qr', (qr) => {
        logWhatsAppQR();
        qrcode.generate(qr, { small: true });
      });

      client.on('ready', () => {
        isReady = true;
        logWhatsAppReady();
        resolve();
      });

      client.on('authenticated', () => {
        logWhatsAppAuthenticated();
      });

      client.on('auth_failure', (msg) => {
        logError(`WhatsApp authentication failed: ${msg}`);
        reject(new Error('WhatsApp authentication failed'));
      });

      client.on('disconnected', (reason) => {
        logWhatsApp(`WhatsApp client disconnected: ${reason}`);
        isReady = false;
      });

      let retryCount = 0;
      const maxRetries = 3;

      const attemptInitialize = async () => {
        client.initialize().catch(async (error) => {
          if ((error.message.includes('SingletonLock') || error.message.includes('Failed to launch')) && retryCount < maxRetries) {
            retryCount++;
            await cleanupLockFiles();
            logWhatsApp(`Retrying after cleaning lock files (attempt ${retryCount}/${maxRetries})...`);
            setTimeout(() => {
              attemptInitialize();
            }, 3000);
          } else {
            reject(error);
          }
        });
      };

      attemptInitialize();
    }, 1000);
  });
}

export { cleanupWhatsApp };

function formatPhoneNumber(number) {
  let cleaned = number.replace(/[^\d]/g, '');
  
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  if (!cleaned.startsWith('91') && cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  
  return cleaned + '@c.us';
}

export async function sendWhatsAppMessage(message, pdfPath = null, postData = null) {
  if (!isReady || !client) {
    throw new Error('WhatsApp client is not ready');
  }

  try {
    const receiverNumber = process.env.RECEIVER_WHATSAPP_NUMBER;
    if (!receiverNumber) {
      throw new Error('RECEIVER_WHATSAPP_NUMBER not set in .env');
    }
    
    const chatId = formatPhoneNumber(receiverNumber);
    
    const sendMessage = async (targetChatId) => {
      await client.sendMessage(targetChatId, message);
      
      if (pdfPath && existsSync(pdfPath)) {
        const media = MessageMedia.fromFilePath(pdfPath);
        await client.sendMessage(targetChatId, media, { caption: 'Tailored Resume' });
        logWhatsAppPDFSent();
      }
    };
    
    try {
      await sendMessage(chatId);
      logWhatsAppSent();
      
      if (postData) {
          await updatePostAfterSending(postData);
      }
    } catch (sendError) {
      if (sendError.message.includes('LID')) {
        const numberOnly = receiverNumber.replace(/[^\d]/g, '');
        const alternativeChatId = `${numberOnly}@s.whatsapp.net`;
        await sendMessage(alternativeChatId);
        logWhatsApp('Message sent (alternative format)');
        
        if (postData) {
          await updatePostAfterSending(postData);
        }
      } else {
        throw sendError;
      }
    }
  } catch (error) {
    throw new Error(`WhatsApp send failed: ${error.message}`);
  }
}


async function updatePostAfterSending(postData) {
  try {
    const db = await connectDB();
    const query = postData._id ? { _id: postData._id } : { postId: postData.postId };
    await db.collection('opportunities').updateOne(
      query,
      {
        $set: {
          replyTextSent: postData.replyTextSent || '',
          personaUsed: postData.personaUsed || 'engineer',
          toneUsed: postData.toneUsed || 'professional',
          replyMode: postData.replyMode || null, 
          sentAt: new Date(),
          feedbackStatus: 'pending',
          feedbackRequestedAt: null,
          actionDecision: postData.actionDecision || 'reply_only',
          resumeJSON: postData.resumeJSON || null
        }
      }
    );
  } catch (error) {
    logError(`Error updating post after sending: ${error.message}`);
  }
}



