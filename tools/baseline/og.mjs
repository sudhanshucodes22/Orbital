// Renders app/opengraph-image.png from the real running page, so the social
// card is the actual design rather than a mock of it.
//
//   npm run build && npm run start
//   node og.mjs
//
// 1200x630 is the Open Graph standard. The globe needs a moment to load its
// texture and the reveal animations need to settle, hence the wait.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL_ = process.env.NEXT_URL ?? 'http://localhost:3000';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(URL_, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(3000);
// Reveal-on-scroll elements are hidden until their observer fires.
await page.evaluate(() => {
  for (const el of document.querySelectorAll('[data-reveal]')) {
    el.style.opacity = '1';
    el.style.transform = 'none';
  }
});
await page.waitForTimeout(400);
const out = path.join(REPO, 'app/opengraph-image.png');
await page.screenshot({ path: out });
console.log(`wrote app/opengraph-image.png (1200x630)`);
await browser.close();
