// Functional checks of the instant search against a running production build:
//   A  /search-index/<file>: brotli / gzip / identity negotiation, immutable caching, 404 for old names
//   B  home page: the index loads only after the load event (idle), typing never calls /api/search,
//      a reload reads the index from the Cache API with zero network
//   C  drug page: no idle prefetch; focusing the header search box loads the index
//   D  Save-Data: no prefetch, still loads on focus
//   E  fallback: index blocked → suggestions from /api/search (one request per first-2-characters,
//      local filtering after), then recovery through the single retry
//   F  keyboard, ARIA, navigation; no layout shift while typing
//   G  voice: mocked SpeechRecognition (interim → live text, final → strong match pre-selected,
//      never navigates; permission error → Arabic message); no API → no button
// usage: BASE_URL=http://localhost:3100 node scripts/search-verify.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../data/search-index/manifest.json', import.meta.url)), 'utf8'));
const INDEX_URL = `${base}/search-index/${manifest.file}`;
const DRUG = process.env.DRUG_SLUG || 'alerid-10mg-30-f-c-tabs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- A: the route
{
  const get = (enc) => fetch(INDEX_URL, { headers: enc ? { 'Accept-Encoding': enc } : {} });
  const br = await get('br, gzip');
  check('A1 brotli served', br.status === 200 && br.headers.get('content-encoding') === 'br', `${br.status} ${br.headers.get('content-encoding')} ${br.headers.get('content-length')} bytes`);
  check('A1 immutable + vary + json', br.headers.get('cache-control') === 'public, max-age=31536000, immutable' && /accept-encoding/i.test(br.headers.get('vary') ?? '') && /application\/json/.test(br.headers.get('content-type') ?? ''), `${br.headers.get('cache-control')} | ${br.headers.get('vary')}`);
  const body = await br.json();
  check('A1 body decodes to the index', body.v === 1 && body.n === manifest.drugs && body.slug.length === body.n, `${body.n} drugs`);
  const gz = await get('gzip');
  check('A2 gzip served', gz.status === 200 && gz.headers.get('content-encoding') === 'gzip', `${gz.headers.get('content-length')} bytes`);
  const id = await get('identity');
  check('A3 identity served', id.status === 200 && !id.headers.get('content-encoding') && Number(id.headers.get('content-length')) === manifest.bytes.raw, `${id.headers.get('content-length')} bytes`);
  const old = await fetch(`${base}/search-index/index.000000000000.json`);
  check('A4 old version 404 no-store', old.status === 404 && old.headers.get('cache-control') === 'no-store');
  const bad = await fetch(`${base}/search-index/..%2Fmanifest.json`);
  check('A5 bad name rejected', bad.status === 404 || bad.status === 400, String(bad.status));
}

const browser = await chromium.launch({ channel: 'chrome' });
const indexRequests = (page) => {
  const hits = [];
  page.on('request', (r) => {
    if (r.url() === INDEX_URL) hits.push({ t: Date.now(), url: r.url() });
  });
  return hits;
};
const apiRequests = (page) => {
  const hits = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/search')) hits.push(r.url());
  });
  return hits;
};
const typeAndWait = async (page, sel, text) => {
  await page.focus(sel);
  await page.keyboard.type(text);
  await page.waitForFunction((id) => !document.getElementById(`${id}-list`).hidden && document.querySelectorAll(`#${id}-list [role="option"]`).length > 0, sel.slice(1), { timeout: 8000 }).catch(() => null);
  return page.evaluate((id) => [...document.querySelectorAll(`#${id}-list [role="option"]`)].slice(0, -1).map((o) => o.textContent), sel.slice(1));
};

try {
  // ---------------------------------------------------------------- B: home page
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const idx = indexRequests(page);
    const api = apiRequests(page);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    const loadAt = Date.now();
    check('B1 index not requested during page load', idx.length === 0, `${idx.length} request(s) before load`);
    await page.waitForFunction(() => globalThis.__dwSearch?.ready === true, null, { timeout: 30000 });
    const dbg = await page.evaluate(() => ({ ...globalThis.__dwSearch }));
    check('B2 index loaded after load (idle), from network', idx.length === 1 && idx[0].t >= loadAt - 50 && dbg.from === 'network' && dbg.startedBy === 'idle', `started ${idx[0] ? idx[0].t - loadAt : '?'} ms after load; load ${dbg.loadMs} ms, build ${dbg.buildMs} ms, ${dbg.transferBytes} bytes transferred`);
    const items = await typeAndWait(page, '#home-search', 'بن');
    check('B3 2 characters → suggestions, no server call', items.length > 0 && api.length === 0, `${items.length} rows, ${api.length} /api/search requests`);
    await page.keyboard.type('ا');
    await sleep(300);
    check('B4 3rd character still no server call', api.length === 0);
    // reload: Cache API copy, zero network
    const idx2 = [];
    page.on('request', (r) => r.url() === INDEX_URL && idx2.push(1));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__dwSearch?.ready === true, null, { timeout: 30000 });
    const dbg2 = await page.evaluate(() => ({ ...globalThis.__dwSearch }));
    check('B5 repeat visit: index from Cache API, no network', dbg2.from === 'cache' && idx2.length === 0, `from=${dbg2.from}, ${idx2.length} network request(s), load ${dbg2.loadMs} ms`);
    const cacheKeys = await page.evaluate(async () => {
      const c = await caches.open('dw-search-index');
      return (await c.keys()).map((r) => r.url);
    });
    check('B6 exactly one version in the cache', cacheKeys.length === 1 && cacheKeys[0] === INDEX_URL, cacheKeys.join(', '));
    await context.close();
  }

  // ---------------------------------------------------------------- C: drug page
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const idx = indexRequests(page);
    await page.goto(`${base}/dawa/${DRUG}`, { waitUntil: 'load' });
    await sleep(3500);
    const status = await page.evaluate(() => globalThis.__dwSearch?.status);
    // The client is constructed lazily, so on a page with no prefetch it does not exist yet
    // (status undefined); if it does exist it must still be idle. Either way no index request.
    check('C1 drug page: no idle prefetch', idx.length === 0 && (status === undefined || status === 'idle'), `status=${status}, ${idx.length} request(s) 3.5 s after load`);
    await page.focus('#site-search-desktop');
    await page.waitForFunction(() => globalThis.__dwSearch?.ready === true, null, { timeout: 30000 });
    const dbg = await page.evaluate(() => ({ ...globalThis.__dwSearch }));
    check('C2 focus loads the index', idx.length === 1 && dbg.startedBy === 'focus', `load ${dbg.loadMs} ms (${dbg.from})`);
    await context.close();
  }

  // ---------------------------------------------------------------- D: Save-Data
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' }, configurable: true }));
    const page = await context.newPage();
    const idx = indexRequests(page);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await sleep(3500);
    const status = await page.evaluate(() => globalThis.__dwSearch?.status);
    check('D1 Save-Data: no idle prefetch', idx.length === 0 && status === 'idle', `status=${status}`);
    await page.focus('#home-search');
    await page.waitForFunction(() => globalThis.__dwSearch?.ready === true, null, { timeout: 30000 });
    check('D2 Save-Data: loads on focus', idx.length === 1);
    await context.close();
  }

  // ---------------------------------------------------------------- E: fallback and recovery
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    let blocked = true;
    await context.route(INDEX_URL, (route) => (blocked ? route.abort('failed') : route.continue()));
    const page = await context.newPage();
    const api = apiRequests(page);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__dwSearch?.status === 'failed', null, { timeout: 15000 }).catch(() => null);
    const st = await page.evaluate(() => globalThis.__dwSearch?.status);
    const items = await typeAndWait(page, '#home-search', 'بن');
    check('E1 index failed → suggestions from /api/search (limit=50)', st === 'failed' && items.length > 0 && api.length === 1 && /limit=50/.test(api[0]), `status=${st}, ${items.length} rows, ${api.length} request(s): ${api[0] ?? ''}`);
    await page.keyboard.type('ا');
    await sleep(400);
    const items3 = await page.evaluate(() => [...document.querySelectorAll('#home-search-list [role="option"]')].slice(0, -1).map((o) => o.textContent));
    check('E2 3rd character filtered locally (no new request)', api.length === 1 && items3.every((t) => /بنا/.test(t.replace(/[ً-ْ]/g, ''))), `${items3.length} rows, ${api.length} request(s)`);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('و'); // "بو": new first-2-characters → one new request
    await sleep(600);
    check('E3 new first 2 characters → one more request', api.length === 2, `${api.length} request(s)`);
    blocked = false; // the single retry (5 s after the failure) must now succeed
    await page.waitForFunction(() => globalThis.__dwSearch?.ready === true, null, { timeout: 15000 }).catch(() => null);
    const after = await page.evaluate(() => ({ ...globalThis.__dwSearch }));
    check('E4 retry once in the background → ready', after.ready === true, `status=${after.status}, error before: ${after.error ?? '-'}`);
    const before = await page.evaluate(() => [...document.querySelectorAll('#home-search-list [role="option"]')].map((o) => o.textContent).join('|'));
    await sleep(500);
    const stillSame = await page.evaluate(() => [...document.querySelectorAll('#home-search-list [role="option"]')].map((o) => o.textContent).join('|'));
    check('E5 switching to the index does not reorder the visible list', before === stillSame);
    await page.keyboard.type('ت');
    await sleep(300);
    check('E6 next keystroke answered by the index (no request)', api.length === 2);
    await context.close();
  }

  // ---------------------------------------------------------------- F: keyboard, ARIA, layout
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__dwSearch?.ready === true, null, { timeout: 30000 });
    await page.evaluate(() => {
      globalThis.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) globalThis.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await typeAndWait(page, '#home-search', 'اوجمنتين');
    const a = await page.evaluate(() => {
      const input = document.getElementById('home-search');
      return { role: input.getAttribute('role'), expanded: input.getAttribute('aria-expanded'), controls: input.getAttribute('aria-controls'), listRole: document.getElementById('home-search-list').getAttribute('role') };
    });
    check('F1 combobox ARIA', a.role === 'combobox' && a.expanded === 'true' && a.controls === 'home-search-list' && a.listRole === 'listbox', JSON.stringify(a));
    const marks = await page.evaluate(() => document.querySelectorAll('#home-search-list mark').length);
    check('F2 matched part highlighted', marks > 0, `${marks} <mark>`);
    await page.keyboard.press('ArrowDown');
    const b = await page.evaluate(() => ({ active: document.getElementById('home-search').getAttribute('aria-activedescendant'), selected: document.querySelector('#home-search-list [aria-selected="true"]')?.id }));
    check('F3 ArrowDown selects the first option', b.active === 'home-search-list-0' && b.selected === 'home-search-list-0', JSON.stringify(b));
    await page.keyboard.press('Escape');
    check('F4 Escape closes', await page.evaluate(() => document.getElementById('home-search-list').hidden));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/dawa\//, { timeout: 15000 });
    check('F5 Enter on a selected option opens the drug page', /\/dawa\//.test(page.url()), page.url().replace(base, ''));
    const cls = await page.evaluate(() => globalThis.__cls ?? 0);
    check('F6 no layout shift while typing (CLS)', cls === 0, `CLS ${cls}`);
    await page.goBack({ waitUntil: 'load' });
    await page.focus('#home-search');
    await page.keyboard.type('بنادول');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/search\?q=/, { timeout: 15000 });
    check('F7 Enter with no selection goes to the results page', /\/search\?q=/.test(page.url()), decodeURIComponent(page.url().replace(base, '')));
    await context.close();
  }

  // ---------------------------------------------------------------- G: voice (mocked recogniser)
  {
    const mock = (mode) => `
      class FakeRecognition extends EventTarget {
        constructor() { super(); this.lang = ''; this.interimResults = false; this.continuous = false; this.maxAlternatives = 1; }
        start() {
          globalThis.__voiceStarted = (globalThis.__voiceStarted || 0) + 1;
          globalThis.__voiceLang = this.lang;
          setTimeout(() => this.onstart && this.onstart(new Event('start')), 20);
          if (${JSON.stringify(mode)} === 'denied') {
            setTimeout(() => { this.onerror && this.onerror(Object.assign(new Event('error'), { error: 'not-allowed' })); this.onend && this.onend(new Event('end')); }, 60);
            return;
          }
          const result = (text, isFinal, alts = []) => Object.assign(new Event('result'), { resultIndex: 0, results: { length: 1, 0: Object.assign([{ transcript: text, confidence: 0.9 }, ...alts.map((t) => ({ transcript: t, confidence: 0.5 }))], { isFinal }) } });
          setTimeout(() => this.onresult && this.onresult(result('بانا', false)), 150);
          setTimeout(() => this.onresult && this.onresult(result('بانادول', true, ['panadol'])), 500);
          setTimeout(() => this.onend && this.onend(new Event('end')), 600);
        }
        stop() { this.abort(); }
        abort() { globalThis.__voiceAborted = true; this.onend && this.onend(new Event('end')); }
      }
      window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;`;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(mock('ok'));
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__dwSearch?.ready === true, null, { timeout: 30000 });
    const btn = page.locator('#home-search ~ button[aria-label="بحث بالصوت"], form:has(#home-search) button[aria-label="بحث بالصوت"]').first();
    check('G1 mic button rendered with aria-label, aria-pressed=false', (await btn.count()) === 1 && (await btn.getAttribute('aria-pressed')) === 'false');
    const voiceChunkBefore = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /voice/.test(r.name)).length);
    await btn.click();
    await page.waitForFunction(() => document.querySelector('form:has(#home-search) button[aria-label="بحث بالصوت"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 }).catch(() => null);
    const listening = await page.evaluate(() => ({ pressed: document.querySelector('form:has(#home-search) button[aria-label="بحث بالصوت"]')?.getAttribute('aria-pressed'), placeholder: document.getElementById('home-search').placeholder, lang: globalThis.__voiceLang, started: globalThis.__voiceStarted }));
    check('G2 tap starts listening: aria-pressed=true, placeholder, lang ar-EG, started once', listening.pressed === 'true' && listening.placeholder === 'اتكلم دلوقتي…' && listening.lang === 'ar-EG' && listening.started === 1, JSON.stringify(listening));
    await page.waitForFunction(() => document.getElementById('home-search').value === 'بانا', null, { timeout: 3000 }).catch(() => null);
    const interim = await page.evaluate(() => document.getElementById('home-search').value);
    check('G3 interim text goes into the box live', interim === 'بانا', `value="${interim}"`);
    await page.waitForFunction(() => document.getElementById('home-search').value === 'بانادول' && document.querySelector('#home-search-list [aria-selected="true"]'), null, { timeout: 5000 }).catch(() => null);
    // The recogniser ends shortly after the final result; wait for listening to clear before reading aria-pressed.
    await page.waitForFunction(() => document.querySelector('form:has(#home-search) button[aria-label="بحث بالصوت"]')?.getAttribute('aria-pressed') === 'false', null, { timeout: 3000 }).catch(() => null);
    const final = await page.evaluate(() => ({
      value: document.getElementById('home-search').value,
      selected: document.querySelector('#home-search-list [aria-selected="true"]')?.id,
      first: document.querySelector('#home-search-list [role="option"]')?.textContent,
      pressed: document.querySelector('form:has(#home-search) button[aria-label="بحث بالصوت"]')?.getAttribute('aria-pressed'),
      url: location.pathname,
    }));
    check('G4 final transcript: suggestions, strong top match pre-selected, no navigation, listening ended', final.value === 'بانادول' && final.selected === 'home-search-list-0' && final.url === '/' && final.pressed === 'false', JSON.stringify(final));
    const voiceChunkAfter = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /\/_next\/static\/chunks\//.test(r.name)).length);
    check('G5 voice code loaded lazily on the first tap (a new chunk after the tap)', voiceChunkAfter > voiceChunkBefore, `${voiceChunkBefore} → ${voiceChunkAfter} chunk requests`);
    // keyboard: Tab from the input reaches the mic button, Enter toggles
    await page.focus('#home-search');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check('G6 mic button is in the tab order', focused === 'بحث بالصوت', `focused: ${focused}`);
    const pressed = () => page.evaluate(() => document.querySelector('form:has(#home-search) button[aria-label="بحث بالصوت"]')?.getAttribute('aria-pressed'));
    const waitPressed = (want) => page.waitForFunction((w) => document.querySelector('form:has(#home-search) button[aria-label="بحث بالصوت"]')?.getAttribute('aria-pressed') === w, want, { timeout: 4000 }).catch(() => null);
    await page.evaluate(() => (globalThis.__voiceAborted = false));
    await page.keyboard.press('Enter'); // the dynamic import of ./voice then onstart (20 ms)
    await waitPressed('true');
    const pressedAgain = await pressed();
    await page.keyboard.press('Enter'); // tapping again cancels
    await waitPressed('false');
    const cancelled = { pressed: await pressed(), aborted: await page.evaluate(() => globalThis.__voiceAborted) };
    check('G7 Enter starts, Enter again cancels', pressedAgain === 'true' && cancelled.pressed === 'false' && cancelled.aborted === true, JSON.stringify({ pressedAgain, ...cancelled }));
    await context.close();

    const denied = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await denied.addInitScript(mock('denied'));
    const p2 = await denied.newPage();
    await p2.goto(`${base}/`, { waitUntil: 'load' });
    await p2.locator('form:has(#home-search) button[aria-label="بحث بالصوت"]').click();
    await p2.waitForSelector('form:has(#home-search) [role="alert"]', { timeout: 5000 }).catch(() => null);
    const alert = await p2.evaluate(() => document.querySelector('form:has(#home-search) [role="alert"]')?.textContent ?? '');
    check('G8 permission denied → short Arabic message with how to allow', /الميكروفون مرفوض/.test(alert) && /اسمح/.test(alert), alert);
    await denied.close();

    const none = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await none.addInitScript(() => {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    });
    const p3 = await none.newPage();
    await p3.goto(`${base}/`, { waitUntil: 'load' });
    await sleep(500);
    const count = await p3.locator('button[aria-label="بحث بالصوت"]').count();
    check('G9 no Web Speech API → no mic button at all', count === 0, `${count} button(s)`);
    await none.close();
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'ALL OK' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
