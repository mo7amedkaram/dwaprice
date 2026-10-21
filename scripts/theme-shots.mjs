// Screenshots of the home page, a drug page, its alternatives page and the search dropdown,
// each light and dark, at 360 and 1280 px. Dark is the device setting (no saved choice).
// usage: BASE_URL=http://localhost:3100 node scripts/theme-shots.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE_URL || 'http://localhost:3100';
const drug = process.env.DRUG_SLUG || 'augmentin-1gm-14-f-c-tabs';
const out = fileURLToPath(new URL('../docs/theme/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

const PAGES = [
  ['home', '/'],
  ['drug', `/dawa/${drug}`],
  ['alternatives', `/dawa/${drug}/badael`],
];

try {
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [360, 1280]) {
      const ctx = await browser.newContext({ colorScheme, viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      for (const [name, path] of PAGES) {
        const res = await page.goto(`${base}${path}`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await page.screenshot({ path: `${out}${name}-${colorScheme}-${width}.png`, fullPage: true });
        console.log(JSON.stringify({ name, path, colorScheme, width, status: res?.status(), theme, overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) }));
      }
      // search dropdown: the header field from md up, the sticky bar field on phones
      await page.goto(`${base}/`, { waitUntil: 'load' });
      const id = width >= 768 ? 'site-search-desktop' : 'site-search-mobile';
      await page.locator(`#${id}`).fill('بانادول');
      await page.waitForSelector(`#${id}-list:not([hidden]) [role="option"]`, { timeout: 15000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}search-${colorScheme}-${width}.png`, fullPage: false });
      console.log(JSON.stringify({ name: 'search', colorScheme, width, options: await page.locator('[role="option"]').count() }));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
