// Lighthouse performance, mobile (Lighthouse's default emulation: Moto G Power, 4x CPU
// slowdown, slow-4G simulated throttling), N runs per page; prints every run and keeps the
// median run (by performance score) as JSON under docs/search/lighthouse/<label>-<page>.json.
// Lab Lighthouse has no INP (field-only); TBT is its lab proxy. INP while typing is
// measured by scripts/search-timing.mjs (longest input event).
// usage: BASE_URL=http://localhost:3100 LABEL=before RUNS=3 node scripts/lighthouse-perf.mjs / /dawa/alerid-10mg-30-f-c-tabs
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const label = process.env.LABEL || 'run';
const runs = Number(process.env.RUNS || 3);
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];
const out = fileURLToPath(new URL('../docs/search/lighthouse/', import.meta.url));
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'dw-lhp-'));

const pageName = (p) => (p === '/' ? 'home' : p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-'));
const metric = (lhr, id) => lhr.audits[id]?.numericValue ?? null;
const summary = (lhr) => ({
  score: Math.round(lhr.categories.performance.score * 100),
  lcp_ms: Math.round(metric(lhr, 'largest-contentful-paint')),
  cls: +(metric(lhr, 'cumulative-layout-shift') ?? 0).toFixed(3),
  tbt_ms: Math.round(metric(lhr, 'total-blocking-time')),
  fcp_ms: Math.round(metric(lhr, 'first-contentful-paint')),
  si_ms: Math.round(metric(lhr, 'speed-index')),
  tti_ms: Math.round(metric(lhr, 'interactive')),
  transfer_kb: Math.round((lhr.audits['network-requests']?.details?.items ?? []).reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
  js_kb: Math.round(
    (lhr.audits['network-requests']?.details?.items ?? []).filter((r) => r.resourceType === 'Script').reduce((s, r) => s + (r.transferSize || 0), 0) / 1024,
  ),
});

const results = {};
try {
  for (const path of paths) {
    const all = [];
    for (let i = 1; i <= runs; i++) {
      const file = join(tmp, `${pageName(path)}-${i}.json`);
      execSync(
        `npx --yes lighthouse@13.5.0 "${base}${path}" --only-categories=performance --output=json --output-path="${file}" --quiet --chrome-flags="--headless=new"`,
        { stdio: ['ignore', 'ignore', 'pipe'], timeout: 300_000 },
      );
      const lhr = JSON.parse(readFileSync(file, 'utf8'));
      all.push({ file, ...summary(lhr) });
      console.log(JSON.stringify({ path, run: i, ...all.at(-1), file: undefined }));
    }
    const sorted = [...all].sort((a, b) => a.score - b.score || a.lcp_ms - b.lcp_ms);
    const med = sorted[Math.floor((sorted.length - 1) / 2)];
    copyFileSync(med.file, `${out}${label}-${pageName(path)}.json`);
    results[path] = { ...med, file: undefined, runs: all.map((r) => r.score) };
    console.log(`MEDIAN ${label} ${path}: ${JSON.stringify(results[path])}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
