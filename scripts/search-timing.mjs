// Keystroke → suggestions time of the search box, measured inside the browser:
//   t0 = the `input` event of the keystroke (the character is in the field)
//   t1 = the first animation frame after the listbox content changed (the paint that shows it)
// Reported for the 2nd character (first suggestions) and the 3rd (an update), per query,
// with the longest input-event duration seen (Event Timing API: the lab "INP" of typing).
// Each run uses a fresh browser context (nothing cached from the previous one).
// usage: BASE_URL=http://localhost:3100 node scripts/search-timing.mjs [--cpu 4] [--path /] [--input home-search]
//        [--wait-index]  wait until the local search index is ready before typing (window.__dwSearch.ready)
//        [--queries بنا,اوج,pan]  3-character queries (default list below)
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const path = opt('--path', '/');
const inputId = opt('--input', 'home-search');
const cpu = Number(opt('--cpu', '1'));
const waitIndex = args.includes('--wait-index');
const queries = opt('--queries', 'بنا,اوج,pan,amo,كون,سيت').split(',');

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};
const fmt = (ms) => (ms === null ? 'n/a' : `${ms.toFixed(1)} ms`);

// Warm the server for the measured prefixes first: the first query of a term costs the database
// ~1 s locally (cold caches), which would make the run order decide the numbers.
for (const q of queries) {
  for (const n of [2, 3]) await fetch(`${base}/api/search?q=${encodeURIComponent(q.slice(0, n))}`).catch(() => null);
}

const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
try {
  for (const q of queries) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar-EG' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.goto(`${base}${path}`, { waitUntil: 'load' });
    if (waitIndex) {
      await page.waitForFunction(() => globalThis.__dwSearch?.ready === true, null, { timeout: 60_000 });
    } else {
      await page.waitForTimeout(500);
    }
    const sel = `#${inputId}`;
    await page.focus(sel);
    await page.evaluate((id) => {
      const input = document.getElementById(id);
      const list = document.getElementById(`${id}-list`);
      const rec = (globalThis.__rec = { t0: 0, t1: 0, snapshot: '', events: [] });
      // The suggestion rows only: the last option ("all results for «…»") repeats the typed
      // text and changes with every keystroke, which is not a suggestion update.
      globalThis.__items = () => {
        if (list.hidden) return '';
        const options = [...list.querySelectorAll('[role="option"]')];
        return (options.length > 1 ? options.slice(0, -1) : options).map((o) => o.textContent).join('|');
      };
      input.addEventListener('input', () => {
        rec.t0 = performance.now();
        rec.t1 = 0;
      });
      new MutationObserver(() => {
        if (rec.t1 || !rec.t0) return;
        const now = globalThis.__items();
        if (now !== '' && now !== rec.snapshot) {
          requestAnimationFrame(() => {
            if (!rec.t1) rec.t1 = performance.now();
          });
        }
      }).observe(list, { attributes: true, childList: true, subtree: true, characterData: true });
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) rec.events.push({ name: e.name, duration: e.duration });
        }).observe({ type: 'event', durationThreshold: 16 });
      } catch {
        /* no Event Timing API */
      }
    }, inputId);

    const measure = async (ch) => {
      await page.evaluate(() => {
        const rec = globalThis.__rec;
        rec.snapshot = globalThis.__items();
        rec.t0 = 0;
        rec.t1 = 0;
      });
      await page.keyboard.type(ch);
      await page.waitForFunction(() => globalThis.__rec.t1 > 0, null, { timeout: 6_000 }).catch(() => null);
      return page.evaluate(() => {
        const { t0, t1 } = globalThis.__rec;
        return t1 > 0 ? +(t1 - t0).toFixed(1) : null;
      });
    };

    await page.keyboard.type(q[0]);
    await page.waitForTimeout(700); // 1 character: nothing should appear; let any pending work settle
    const k2 = await measure(q[1]);
    await page.waitForTimeout(400);
    const k3 = await measure(q[2]);
    await page.waitForTimeout(300);
    const extra = await page.evaluate(() => ({
      maxEvent: Math.max(0, ...globalThis.__rec.events.map((e) => e.duration)),
      options: document.querySelectorAll('[role="option"]').length,
      search: globalThis.__dwSearch ? { ...globalThis.__dwSearch } : null,
    }));
    rows.push({ query: q, cpu, k2_ms: k2, k3_ms: k3, maxEventMs: extra.maxEvent, options: extra.options, search: extra.search });
    console.log(JSON.stringify(rows.at(-1)));
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(
  `SUMMARY base=${base} path=${path} cpu=${cpu}x waitIndex=${waitIndex}: 2nd char → suggestions median ${fmt(median(rows.map((r) => r.k2_ms)))}, ` +
    `3rd char → update median ${fmt(median(rows.map((r) => r.k3_ms)))}, longest input event ${fmt(median(rows.map((r) => r.maxEventMs)))} (median of per-run max)`,
);
