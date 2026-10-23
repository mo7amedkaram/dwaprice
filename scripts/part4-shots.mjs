// Part 4 showcase: full-page screenshots of every listing page type at 360 and
// 1280 px (+ horizontal-overflow and small-tap-target checks), and the search
// suggestions for a misspelled Arabic name (keyboard driven, with the layout
// shift measured while typing). Uses the locally installed Chrome.
// usage: npm run build && npx next start -p 3100   then   BASE_URL=http://localhost:3100 node scripts/part4-shots.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE_URL || 'http://localhost:3000';
const out = fileURLToPath(new URL('../docs/part4/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });

const PAGES = [
  ['home', '/'],
  ['search-misspelled', `/search?q=${encodeURIComponent('كونجستل')}`],
  ['ingredient', '/active-ingredient/paracetamol'],
  ['ingredients-index', '/active-ingredient'],
  ['company', '/sharika/eva-pharma'],
  ['category', '/category/antibiotic'],
  ['category-filtered', '/category/antibiotic?form=syrup&sort=price-asc'],
  ['atc', '/atc/j01cr02-penicillin-with-beta-lactamase-inhibitor'],
  ['atc-index', '/atc'],
  ['last-prices', '/last-prices'],
  ['letter', '/adwiya/b'],
  ['letters-index', '/adwiya'],
  ['about', '/about'],
  ['contact', '/contact'],
  ['guide', '/guide'],
];

const report = { pages: [], search: [] };
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, path] of PAGES) {
    for (const width of [360, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const res = await page.goto(`${base}${path}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const checks = await page.evaluate(() => {
        const doc = document.documentElement;
        const small = [...document.querySelectorAll('a, button, input, select, summary')]
          .filter((el) => el.offsetParent !== null && !el.closest('p, dd, td') && !el.classList.contains('sr-only'))
          .filter((el) => el.getBoundingClientRect().height < 44)
          .map((el) => (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30));
        return {
          overflowX: doc.scrollWidth > window.innerWidth,
          height: doc.scrollHeight,
          robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
          h1: document.querySelector('h1')?.textContent?.trim(),
          smallTargets: small.slice(0, 5),
        };
      });
      const file = `${name}-${width}.png`;
      await page.screenshot({ path: `${out}${file}`, fullPage: true });
      report.pages.push({ name, path, width, status: res?.status(), file, ...checks });
      console.log(JSON.stringify(report.pages.at(-1)));
      await page.close();
    }
  }

  // Search suggestions for a misspelled Arabic name, keyboard only.
  for (const width of [360, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.evaluate(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: false });
    });
    const input = page.locator('#home-search');
    await input.focus();
    const typed = 'كونجستل'; // correct spelling: كونجستال (Congestal)
    const started = Date.now();
    await input.pressSequentially(typed, { delay: 60 });
    await page.locator('#home-search-list li[role="option"]').first().waitFor({ state: 'visible' });
    const shownAfter = Date.now() - started;
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const state = await page.evaluate(() => {
      const input = document.querySelector('#home-search');
      const active = input.getAttribute('aria-activedescendant');
      return {
        expanded: input.getAttribute('aria-expanded'),
        activeOption: active ? document.getElementById(active)?.textContent?.trim().slice(0, 60) : null,
        options: [...document.querySelectorAll('#home-search-list li[role="option"]')].map((li) => li.textContent.trim().slice(0, 50)),
        status: input.closest('form').querySelector('[role="status"]')?.textContent,
        cls: window.__cls,
      };
    });
    const file = `search-suggestions-${width}.png`;
    await page.screenshot({ path: `${out}${file}` });
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/dawa\//);
    const entry = { width, typed, suggestionsVisibleAfterMs: shownAfter, ...state, openedWithEnter: new URL(page.url()).pathname, file };
    report.search.push(entry);
    console.log(JSON.stringify(entry));
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${out}../shots-report.json`, JSON.stringify(report, null, 2));
