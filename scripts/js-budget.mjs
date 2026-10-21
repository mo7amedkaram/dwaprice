// Sums the JavaScript a page downloads (compressed transfer size) with headless Chrome.
// usage: BASE_URL=http://localhost:3000 node scripts/js-budget.mjs /path [/path ...]
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://localhost:3000';
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const path of paths) {
    const page = await browser.newPage();
    const scripts = [];
    page.on('requestfinished', async (req) => {
      if (req.resourceType() !== 'script') return;
      const res = await req.response();
      const sizes = await req.sizes();
      scripts.push({ url: req.url().replace(base, ''), gz: sizes.responseBodySize, encoding: res?.headers()['content-encoding'] ?? '' });
    });
    await page.goto(`${base}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500); // let lazy chunks and prefetches finish
    const total = scripts.reduce((s, x) => s + x.gz, 0);
    console.log(JSON.stringify({ path, scripts: scripts.length, totalKB: +(total / 1024).toFixed(1), encodings: [...new Set(scripts.map((s) => s.encoding))] }));
    for (const s of scripts.sort((a, b) => b.gz - a.gz)) console.log(`   ${(s.gz / 1024).toFixed(1).padStart(6)} KB  ${s.url.slice(0, 90)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
