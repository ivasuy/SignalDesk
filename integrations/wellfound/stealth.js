import { chromium } from 'playwright';

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function humanDelay(base = 100) {
  const jitter = randomDelay(-base * 0.3, base * 0.3);
  return base + jitter;
}

async function humanMouseMove(page, fromX, fromY, toX, toY) {
  const steps = randomDelay(10, 20);
  const stepX = (toX - fromX) / steps;
  const stepY = (toY - fromY) / steps;
  
  for (let i = 0; i <= steps; i++) {
    const x = fromX + stepX * i + randomDelay(-2, 2);
    const y = fromY + stepY * i + randomDelay(-2, 2);
    
    await page.mouse.move(x, y, { steps: 1 });
    await page.waitForTimeout(randomDelay(5, 15));
  }
}

async function humanScroll(page, direction = 'down', distance = null) {
  const viewport = page.viewportSize();
  const scrollDistance = distance || randomDelay(200, 500);
  const steps = randomDelay(5, 10);
  const stepSize = scrollDistance / steps;
  
  for (let i = 0; i < steps; i++) {
    const delta = stepSize + randomDelay(-10, 10);
    await page.mouse.wheel(0, direction === 'down' ? delta : -delta);
    await page.waitForTimeout(randomDelay(50, 150));
  }
}

async function humanClick(page, selector, options = {}) {
  const element = await page.locator(selector).first();
  
  if (await element.isVisible()) {
    const box = await element.boundingBox();
    if (box) {
      const clickX = box.x + box.width / 2 + randomDelay(-5, 5);
      const clickY = box.y + box.height / 2 + randomDelay(-5, 5);
      
      await humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2, clickX, clickY);
      await page.waitForTimeout(randomDelay(100, 300));
      
      await page.mouse.click(clickX, clickY, { delay: randomDelay(50, 150) });
      await page.waitForTimeout(randomDelay(200, 500));
    }
  }
}

async function simulateHumanBehavior(page) {
  const viewport = page.viewportSize();
  
  await page.waitForTimeout(randomDelay(500, 1500));
  
  const randomX = randomDelay(100, viewport.width - 100);
  const randomY = randomDelay(100, viewport.height - 100);
  
  await humanMouseMove(page, viewport.width / 2, viewport.height / 2, randomX, randomY);
  await page.waitForTimeout(randomDelay(200, 800));
  
  if (Math.random() > 0.5) {
    await humanScroll(page, 'down', randomDelay(100, 300));
    await page.waitForTimeout(randomDelay(300, 700));
  }
}

async function injectStealthScripts(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });
    
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
    
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
    
    Object.defineProperty(navigator, 'platform', {
      get: () => 'MacIntel'
    });
    
    window.chrome = {
      runtime: {}
    };
    
    Object.defineProperty(navigator, 'permissions', {
      get: () => ({
        query: () => Promise.resolve({ state: 'granted' })
      })
    });
    
    const originalQuery = window.document.querySelector;
    window.document.querySelector = function(selector) {
      if (selector === 'head > meta[name="viewport"]') {
        return null;
      }
      return originalQuery.apply(document, arguments);
    };
    
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8
    });
    
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8
    });
    
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) {
        return 'Intel Inc.';
      }
      if (parameter === 37446) {
        return 'Intel Iris OpenGL Engine';
      }
      return getParameter.apply(this, arguments);
    };
    
    const canvasPrototype = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function() {
      return canvasPrototype.apply(this, arguments);
    };
    
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 0
    });
  });
}

export async function createStealthBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      '--disable-features=AutoplayIgnoreWebAudio',
      '--lang=en-US,en'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: ['geolocation'],
    geolocation: { latitude: 40.7128, longitude: -74.0060 },
    colorScheme: 'light',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    }
  });
  
  const page = await context.newPage();
  
  await injectStealthScripts(page);
  
  return { browser, context, page };
}

export async function navigateWithStealth(page, url, options = {}) {
  const waitUntil = options.waitUntil || 'domcontentloaded';
  const timeout = options.timeout || 60000;
  
  try {
    const response = await page.goto(url, { waitUntil, timeout }).catch(async (error) => {
      await page.waitForTimeout(randomDelay(3000, 5000));
      const currentUrl = page.url();
      if (currentUrl && currentUrl !== 'about:blank') {
        return null;
      }
      throw error;
    });
    
    await page.waitForTimeout(randomDelay(3000, 6000));
    
    const pageContent = await page.content().catch(() => '');
    const pageTitle = await page.title().catch(() => '');
    
    const isChallenge = pageContent.includes('Checking your browser') || 
                       pageContent.includes('Just a moment') || 
                       pageContent.includes('cf-browser-verification') ||
                       pageTitle.includes('Just a moment') ||
                       pageContent.includes('challenge-platform') ||
                       pageContent.includes('cf-challenge');
    
    if (isChallenge) {
      await page.waitForTimeout(randomDelay(10000, 15000));
      
      const newContent = await page.content().catch(() => '');
      const newTitle = await page.title().catch(() => '');
      const stillChallenge = newContent.includes('Checking your browser') || 
                            newContent.includes('Just a moment') ||
                            newTitle.includes('Just a moment');
      
      if (stillChallenge) {
        await page.waitForTimeout(randomDelay(10000, 15000));
      }
    }
    
    if (response && response.status() >= 400 && response.status() !== 403) {
      throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
    }
    
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    
    await page.waitForTimeout(randomDelay(2000, 4000));
    
    await simulateHumanBehavior(page);
    
    await page.waitForTimeout(randomDelay(1000, 2000));
    
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const viewportHeight = page.viewportSize().height;
    
    if (scrollHeight > viewportHeight) {
      const scrollSteps = Math.ceil(scrollHeight / viewportHeight);
      for (let i = 0; i < Math.min(scrollSteps, 3); i++) {
        await humanScroll(page, 'down', randomDelay(300, 600));
        await page.waitForTimeout(randomDelay(1000, 2000));
      }
      
      await humanScroll(page, 'up', randomDelay(200, 400));
      await page.waitForTimeout(randomDelay(1000, 1500));
    }
    
    return page;
  } catch (error) {
    const currentUrl = page.url();
    if (currentUrl && currentUrl !== 'about:blank') {
      await page.waitForTimeout(randomDelay(5000, 10000));
      return page;
    }
    throw new Error(`Navigation failed: ${error.message}`);
  }
}

export async function extractWithStealth(page, selector, options = {}) {
  await page.waitForTimeout(randomDelay(500, 1000));
  
  if (options.scrollTo) {
    await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, selector);
    await page.waitForTimeout(randomDelay(800, 1500));
  }
  
  const elements = await page.locator(selector).all();
  const results = [];
  
  for (let i = 0; i < elements.length; i++) {
    if (i > 0 && Math.random() > 0.7) {
      await humanScroll(page, 'down', randomDelay(100, 200));
      await page.waitForTimeout(randomDelay(300, 600));
    }
    
    const text = await elements[i].textContent();
    const href = await elements[i].getAttribute('href');
    
    if (text || href) {
      results.push({ text: text?.trim() || '', href: href || '' });
    }
  }
  
  return results;
}

export { humanDelay, randomDelay, humanMouseMove, humanScroll, humanClick, simulateHumanBehavior };
