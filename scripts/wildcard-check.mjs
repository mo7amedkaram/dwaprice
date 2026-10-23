// Wildcard search, end to end against a running server (default http://localhost:3100): the API
// and results page (server path), then a real browser (index path): the first-focus hint, the "؟"
// popover, suggestions for Au*in / أو*ين / Br?fen with the typed letters highlighted, the friendly
// message for a symbols-only pattern, and that a name with a multiplication star still searches
// normally. Screenshots → docs/search/screenshots/wildcard-*.png.
// usage: BASE_URL=http://localhost:3100 node scripts/wildcard-check.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const out = fileURLToPath(new URL('../docs/search/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};
const api = async (q) => {
  const t = Date.now();
  const r = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}&limit=20`);
  const j = await r.json();
  return { ms: Date.now() - t, slugs: (j.results ?? []).map((x) => x.slug), status: r.status };
};

console.log('=== server path (/api/search, /search) ===');
const a = await api('Au*in');
check('API Au*in → Augmentin products', a.slugs.some((s) => s.startsWith('augmentin')) && a.slugs.length <= 20, `${a.ms} ms, ${a.slugs.length} results, first: ${a.slugs.slice(0, 4).join(', ')}`);
const b = await api('أو*ين');
check('API أو*ين → أوجمنتين', b.slugs.some((s) => s.startsWith('augmentin')), `${b.ms} ms, first: ${b.slugs.slice(0, 4).join(', ')}`);
const c = await api('Br?fen');
check('API Br?fen → only Brufen', c.slugs.length > 0 && c.slugs.every((s) => s.startsWith('brufen')), `${c.ms} ms, ${c.slugs.join(', ')}`);
const d = await api('*');
check('API symbols-only → no results, no error', d.status === 200 && d.slugs.length === 0, `${d.status}`);
const e = await api('a(b*c[');
check('API regex characters are harmless', e.status === 200, `${e.status}, ${e.slugs.length} results`);
const page1 = await (await fetch(`${base}/search?q=${encodeURIComponent('Au*in')}`)).text();
check('/search?q=Au*in shows the pattern notice and results', page1.includes('نتائج النمط') && page1.includes('/dawa/augmentin'));
const page2 = await (await fetch(`${base}/search?q=${encodeURIComponent('*')}`)).text();
check('/search?q=* shows the friendly message', page2.includes('حرفين على الأقل'));
const guide = await (await fetch(`${base}/guide`)).text();
check('/guide explains the feature with Au*in', guide.includes('Au*in') && guide.includes('Br?fen'));

console.log('\n=== browser path (index in the worker) ===');
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
try {
  await page.goto(`${base}/`, { waitUntil: 'load' });
  const input = page.locator('#home-search');
  await input.focus();
  check('hint appears on first focus', (await page.getByText('مش قاري الاسم كله؟').count()) > 0);
  await page.screenshot({ path: `${out}wildcard-hint-1280.png`, clip: { x: 0, y: 0, width: 1280, height: 420 } });
  await page.getByRole('button', { name: 'طريقة البحث بالنجمة' }).first().click();
  check('"؟" opens the help popover with both symbols', (await page.getByRole('dialog', { name: 'طريقة البحث بالنجمة' }).count()) > 0 && (await page.getByText('حرف واحد بالضبط').count()) > 0);
  await page.screenshot({ path: `${out}wildcard-help-1280.png`, clip: { x: 0, y: 0, width: 1280, height: 520 } });
  await page.keyboard.press('Escape');
  check('Escape closes the popover', (await page.getByRole('dialog', { name: 'طريقة البحث بالنجمة' }).count()) === 0);
  // wait for the index to be ready (status is published on window.__dwSearch)
  await input.focus();
  await page.waitForFunction(() => window.__dwSearch?.status === 'ready', null, { timeout: 30000 }).catch(() => null);
  const ready = await page.evaluate(() => window.__dwSearch?.status);
  check('index ready in the worker', ready === 'ready', String(ready));
  for (const [q, expect, label] of [['Au*in', 'augmentin', 'Au*in'], ['أو*ين', 'augmentin', 'أو*ين'], ['Br?fen', 'brufen', 'Br?fen']]) {
    await input.fill('');
    await input.fill(q);
    await page.waitForTimeout(400);
    const options = await page.locator('#home-search-list [role="option"]').allTextContents();
    const marks = await page.locator('#home-search-list mark').allTextContents();
    check(`suggestions for ${label} include ${expect} and highlight only the typed letters`, options.some((t) => t.toLowerCase().includes(expect)) && marks.length > 0 && marks.every((m) => m.length <= 3 || /^[^\s]+$/.test(m)), `${options.length} options; marks: ${[...new Set(marks)].slice(0, 6).join('|')}`);
    if (q === 'Au*in') await page.screenshot({ path: `${out}wildcard-suggestions-1280.png`, clip: { x: 0, y: 0, width: 1280, height: 700 } });
  }
  await input.fill('');
  await input.fill('*?');
  await page.waitForTimeout(400);
  check('symbols-only pattern shows the friendly message under the box', (await page.getByText('حرفين على الأقل').count()) > 0);
  await input.fill('');
  await input.fill('سيستان قطرة عين 30 وحدة * 0.7');
  await page.waitForTimeout(400);
  const normal = await page.locator('#home-search-list [role="option"]').allTextContents();
  check('a name with a multiplication star searches normally', normal.some((t) => t.includes('سيستان')), `${normal.length} options`);
  // mobile hint width
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/dawa/brufen-600mg-30-tab`, { waitUntil: 'load' });
  await page.locator('#site-search-mobile').focus();
  await page.waitForTimeout(300);
  check('no horizontal overflow at 390 with the hint/popover', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await page.getByRole('button', { name: 'طريقة البحث بالنجمة' }).first().click();
  await page.waitForTimeout(200);
  check('popover fits at 390 (no horizontal overflow)', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await page.screenshot({ path: `${out}wildcard-help-390.png`, clip: { x: 0, y: 0, width: 390, height: 600 } });
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
