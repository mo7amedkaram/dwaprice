// Screenshots for the five-change brief, at phone widths. Uses Playwright device-mode viewports
// (iPhone 390x844, Android 412x915). The on-screen keyboard can't render in headless Chrome, so
// the "keyboard" shot resizes the viewport to the height left above a typical keyboard and the
// suggestions list sizes itself to it (visualViewport); that is what that shot demonstrates.
// usage: BASE_URL=http://localhost:3100 node scripts/p6-shots.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const out = fileURLToPath(new URL('../docs/part6/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });
const DRUG = process.env.DRUG_SLUG || 'alerid-10mg-30-f-c-tabs'; // has English info + بدائل
const BOTH = process.env.BOTH_SLUG || 'augmentin-1gm-14-tablets'; // has both المثائل and البدائل
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome' });
const shot = async (page, name) => page.screenshot({ path: `${out}${name}.png` });

async function openSuggestions(page, inputId, query) {
  await page.waitForSelector(`#${inputId}`);
  await page.focus(`#${inputId}`);
  await page.waitForFunction(() => globalThis.__dwSearch?.ready === true, null, { timeout: 30000 }).catch(() => null);
  await page.type(`#${inputId}`, query, { delay: 40 });
  await page.waitForFunction((id) => !document.getElementById(`${id}-list`).hidden && document.querySelectorAll(`#${id}-list [role="option"]`).length > 0, inputId, { timeout: 8000 }).catch(() => null);
  await sleep(300);
}

try {
  // --- home with suggestions open, both phone sizes ---
  for (const [w, h, tag] of [[390, 844, '390'], [412, 915, '412']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await openSuggestions(page, 'home-search', 'بن');
    await shot(page, `home-${tag}-suggestions`);
    await ctx.close();
  }

  // --- home: "keyboard" simulated (viewport cut to the space above a keyboard) ---
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await openSuggestions(page, 'home-search', 'بن');
    await page.setViewportSize({ width: 390, height: 380 }); // ~iPhone height minus keyboard; visualViewport shrinks, list resizes
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await sleep(500);
    await shot(page, 'home-390-keyboard');
    const listH = await page.evaluate(() => {
      const ul = document.getElementById('home-search-list');
      return ul ? getComputedStyle(ul).maxHeight : null;
    });
    console.log('home-390-keyboard list max-height =', listH);
    await ctx.close();
  }

  // --- drug page top (price card then معلومات الدواء), and the English toggle both states ---
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/dawa/${DRUG}`, { waitUntil: 'load' });
    await page.waitForSelector('#info');
    await page.evaluate(() => document.getElementById('info')?.scrollIntoView({ block: 'center' }));
    await sleep(300);
    await shot(page, 'drug-390-info-ar');
    // switch the info section to English
    const enBtn = page.locator('#info ~ *, section[aria-labelledby="info"]').first();
    await page.locator('button[aria-pressed]', { hasText: 'English' }).first().click().catch(() => null);
    await sleep(300);
    await shot(page, 'drug-390-info-en');
    // top of the page: price card above معلومات الدواء
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(300);
    await shot(page, 'drug-390-top');
    void enBtn;
    await ctx.close();
  }

  // --- بدائل ومثائل page (both sections) ---
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/dawa/${BOTH}/badael`, { waitUntil: 'load' });
    await page.waitForSelector('#similars');
    await sleep(300);
    await shot(page, 'badael-390-top');
    await page.evaluate(() => document.getElementById('substitutes')?.scrollIntoView({ block: 'start' }));
    await sleep(300);
    await shot(page, 'badael-390-substitutes');
    await ctx.close();
  }
  console.log('screenshots written to', out);
} finally {
  await browser.close();
}
