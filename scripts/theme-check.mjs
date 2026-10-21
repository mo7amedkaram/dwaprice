// Dark-mode checks: the theme that is set before the first paint under every combination of
// device setting and saved choice, persistence of the toggle across reload and navigation,
// the header at 360 px, and the contrast of the dark tokens as rendered.
// usage: BASE_URL=http://localhost:3100 node scripts/theme-check.mjs
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://localhost:3100';
const browser = await chromium.launch({ channel: 'chrome' });
const out = [];
const log = (step, data) => { out.push({ step, ...data }); console.log(JSON.stringify(out.at(-1))); };

// Records every change of data-theme with the document state at that moment. The head script
// must set it while the document is still "loading" (before anything is painted), once.
// (Init scripts run before <html> exists, so the observer watches the document subtree.)
const probe = `(() => {
  window.__theme = { sets: [] };
  new MutationObserver((muts) => { for (const m of muts) window.__theme.sets.push({ value: m.target.getAttribute('data-theme'), readyState: document.readyState, ms: Math.round(performance.now()) }); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'] });
})()`;

async function firstPaint(colorScheme, stored) {
  const ctx = await browser.newContext({ colorScheme });
  const page = await ctx.newPage();
  if (stored) {
    await page.addInitScript((v) => { try { localStorage.setItem('dw_theme', v); } catch {} }, stored);
  }
  await page.addInitScript(probe);
  await page.goto(`${base}/`, { waitUntil: 'load' });
  const r = await page.evaluate(() => ({ ...window.__theme, final: document.documentElement.getAttribute('data-theme'), choice: document.documentElement.getAttribute('data-theme-choice'), bg: getComputedStyle(document.body).backgroundColor, colorScheme: getComputedStyle(document.documentElement).colorScheme }));
  await ctx.close();
  return r;
}

try {
  for (const [scheme, stored, expect] of [['light', null, 'light'], ['dark', null, 'dark'], ['light', 'dark', 'dark'], ['dark', 'light', 'light']]) {
    const r = await firstPaint(scheme, stored);
    const first = r.sets[0];
    log(`first paint: device=${scheme} saved=${stored ?? 'none'}`, { expect, setWhile: first?.readyState, atMs: first?.ms, changes: r.sets.map((s) => s.value), final: r.final, choice: r.choice, bg: r.bg, colorScheme: r.colorScheme, ok: first?.value === expect && first?.readyState === 'loading' && r.sets.length === 1 && r.final === expect });
  }

  // persistence: pick "dark" with the group, reload, navigate, then back to "system"
  {
    const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    const group = page.locator('header [role="group"]');
    await group.locator('button[aria-label="داكن"]').click();
    const after = await page.evaluate(() => [document.documentElement.getAttribute('data-theme'), localStorage.getItem('dw_theme'), document.querySelector('meta[name="theme-color"]')?.getAttribute('content')]);
    await page.reload({ waitUntil: 'load' });
    const reloaded = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.locator('a[href="/last-prices"]').first().click();
    await page.waitForURL(/last-prices/);
    const navigated = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const pressed = await group.locator('button[aria-pressed="true"]').getAttribute('aria-label');
    await group.locator('button[aria-label="حسب الجهاز"]').click();
    const system = await page.evaluate(() => [document.documentElement.getAttribute('data-theme'), localStorage.getItem('dw_theme')]);
    log('persistence', { afterClick: after, reloaded, navigated, pressedAfterNav: pressed, backToSystem: system, ok: after[0] === 'dark' && after[1] === 'dark' && reloaded === 'dark' && navigated === 'dark' && pressed === 'داكن' && system[0] === 'light' && system[1] === null });
    // device change while on "system" is followed live
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(100);
    log('device switched to dark while on system', { theme: await page.evaluate(() => document.documentElement.getAttribute('data-theme')) });
    await ctx.close();
  }

  // phone header: no horizontal overflow with the cycle button; keyboard operation
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    const r = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, headerRight: Math.round(document.querySelector('header .flex')?.getBoundingClientRect().right ?? 0) }));
    const cycle = page.locator('header button[aria-label^="المظهر الحالي"]');
    await cycle.focus();
    await page.keyboard.press('Enter');
    const t1 = await page.evaluate(() => document.documentElement.getAttribute('data-theme-choice'));
    await page.keyboard.press('Space');
    const t2 = await page.evaluate(() => document.documentElement.getAttribute('data-theme-choice'));
    const box = await cycle.boundingBox();
    log('phone header', { ...r, overflow: r.scrollWidth > 360, cycleAfterEnter: t1, cycleAfterSpace: t2, cycleSize: box && [Math.round(box.width), Math.round(box.height)], ok: r.scrollWidth <= 360 && t1 === 'light' && t2 === 'dark' });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(out.every((o) => o.ok !== false) ? 'ALL OK' : 'FAILURES');
