// Part 3 showcase: for each page, full-page screenshots at 360 and 1280 px, the
// rendered <head> as served (plus the JSON-LD the page renders in <body>),
// overflow / tap-target checks and whether page content is fetched client-side.
// usage: BASE_URL=http://localhost:3000 node scripts/showcase.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE_URL || 'http://localhost:3000';
const PAGES = [
  { name: '1-popular-alerid', path: '/dawa/alerid-10mg-30-f-c-tabs' },
  { name: '2-no-history-alphafen', path: '/dawa/alphafen-100mg-5ml-susp-120ml' },
  { name: '3-duplicate-fucidin-30g', path: '/dawa/fucidin-2-ointment-30gm' },
  { name: '4-rx-montelurama', path: '/dawa/montelurama-10mg-20-f-c-tabs' },
  { name: '5-dosing-sample-design', path: '/design#dosing' },
  { name: '6-alternatives-montelurama', path: '/dawa/montelurama-10mg-20-f-c-tabs/badael' },
  { name: '7-uses-montelurama', path: '/dawa/montelurama-10mg-20-f-c-tabs/dawaei-estemal' },
];
const out = fileURLToPath(new URL('../docs/part3/', import.meta.url));
mkdirSync(`${out}screenshots`, { recursive: true });
mkdirSync(`${out}heads`, { recursive: true });

/** <head> one tag per line (framework scripts and chunk links dropped), then the JSON-LD from <body>. */
function prettyHead(html) {
  const head = (html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/></g, '>\n<')
    .split('\n')
    .filter((l) => l.trim() && !/^<link[^>]*\/_next\/static/.test(l))
    .join('\n');
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.stringify(JSON.parse(m[1].replace(/\\u003c/g, '<')), null, 2),
  );
  return `${head}\n\n<!-- JSON-LD (rendered in <body>) -->\n${ld.map((j) => `<script type="application/ld+json">\n${j}\n</script>`).join('\n')}`;
}

const browser = await chromium.launch({ channel: 'chrome' });
const summary = [];
try {
  for (const p of PAGES) {
    const res = await fetch(`${base}${p.path.split('#')[0]}`);
    const html = await res.text();
    if (!p.path.startsWith('/design')) {
      writeFileSync(`${out}heads/${p.name}.html`, `<!-- ${p.path} (HTTP ${res.status}); framework script/chunk tags omitted -->\n${prettyHead(html)}\n`);
    }
    for (const width of [360, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${base}${p.path}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const check = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        smallTargets: [...document.querySelectorAll('a, button, input, summary')]
          .filter((el) => el.offsetParent !== null && !el.closest('p') && !el.classList.contains('sr-only'))
          .filter((el) => el.getBoundingClientRect().height < 44).length,
        h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
        contentFetches: performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'fetch' && !e.name.includes('_rsc=')).length,
      }));
      if (p.path.startsWith('/design')) {
        await (await page.$('section:has(#dosing)')).screenshot({ path: `${out}screenshots/${p.name}-${width}.png` });
      } else {
        await page.screenshot({ path: `${out}screenshots/${p.name}-${width}.png`, fullPage: true });
      }
      summary.push({ page: p.name, width, status: res.status, ...check });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(`${out}showcase.json`, JSON.stringify(summary, null, 1));
for (const s of summary) console.log(JSON.stringify(s));
