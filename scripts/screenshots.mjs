// Full-page screenshots of /design at 360, 768 and 1280 px, plus a horizontal-
// overflow check. Uses the locally installed Chrome (playwright-core, no download).
// usage: npm run build && npm start   (other terminal)   then   npm run screenshots
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE_URL || 'http://localhost:3000';
const path = process.argv[2] || '/design';
const out = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [360, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`${base}${path}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(() => {
      const doc = document.documentElement;
      const small = [...document.querySelectorAll('a, button, input, summary')]
        .filter((el) => el.offsetParent !== null && !el.closest('p') && !el.classList.contains('sr-only'))
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30));
      return {
        overflowX: doc.scrollWidth > window.innerWidth,
        scrollWidth: doc.scrollWidth,
        fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`),
        smallTargets: small,
      };
    });
    const file = `${out}design-${width}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(JSON.stringify({ width, file, ...report }));
    await page.close();
  }
} finally {
  await browser.close();
}
