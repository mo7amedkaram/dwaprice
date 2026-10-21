// Lighthouse accessibility in both themes. Lighthouse has no prefers-color-scheme switch and its
// launcher always makes its own Chrome profile, so for each theme: a profile is prepared with the
// choice in localStorage (Playwright), Chrome itself is started headless on that profile with a
// debugging port, and Lighthouse attaches to it (--port). The final screenshot's top-left pixel
// proves which theme was audited (≈ #FFFFFF light, ≈ #0F172A dark).
// usage: BASE_URL=http://localhost:3100 node scripts/lighthouse-theme.mjs
import { chromium } from 'playwright-core';
import { execSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE_URL || 'http://localhost:3100';
const drug = process.env.DRUG_SLUG || 'alerid-10mg-30-f-c-tabs';
const out = fileURLToPath(new URL('../docs/theme/lighthouse/', import.meta.url));
mkdirSync(out, { recursive: true });
const PORT = 9333;
const PAGES = [['home', '/'], ['drug', `/dawa/${drug}`], ['alternatives', `/dawa/${drug}/badael`]];
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if (!CHROME) throw new Error('set CHROME_PATH');
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pixelOf = (page, dataUrl) =>
  page.evaluate(async (src) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const p = g.getImageData(4, 4, 1, 1).data; return `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
  }, dataUrl);

const helper = await chromium.launch({ channel: 'chrome' });
const helperPage = await helper.newPage();
try {
  for (const theme of ['light', 'dark']) {
    const profile = mkdtempSync(join(tmpdir(), 'dw-lh-'));
    const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome' });
    const setup = await ctx.newPage();
    await setup.goto(`${base}/`, { waitUntil: 'load' });
    await setup.evaluate((t) => localStorage.setItem('dw_theme', t), theme);
    await setup.goto(`${base}/about`, { waitUntil: 'load' }); // a second navigation flushes the storage to disk
    await ctx.close();

    const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(200); }
    }
    try {
      for (const [name, path] of PAGES) {
        const tmp = join(profile, `${name}-${theme}.json`);
        execSync(`npx --yes lighthouse@13.5.0 "${base}${path}" --port=${PORT} --only-categories=accessibility --only-audits=final-screenshot --preset=desktop --output=json --output-path="${tmp}" --quiet`, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 240000 });
        const lhr = JSON.parse(readFileSync(tmp, 'utf8'));
        copyFileSync(tmp, `${out}${name}-${theme}.json`);
        const score = Math.round(lhr.categories.accessibility.score * 100);
        const failing = Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 1).map((a) => `${a.id} (${a.details?.items?.length ?? '?'})`);
        const shot = lhr.audits['final-screenshot']?.details?.data;
        results.push({ page: name, theme, score, failing, finalScreenshotPixel: shot ? await pixelOf(helperPage, shot) : null, contrastAudit: lhr.audits['color-contrast']?.score });
        console.log(JSON.stringify(results.at(-1)));
      }
    } finally {
      chrome.kill();
      await sleep(500);
      rmSync(profile, { recursive: true, force: true });
    }
  }
} finally {
  await helper.close();
}
console.log(results.every((r) => r.score >= 95) ? 'ALL >= 95' : 'BELOW 95');
