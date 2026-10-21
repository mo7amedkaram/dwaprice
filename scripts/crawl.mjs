// Internal-link crawler for the local build: click depth from the home page,
// orphans (sitemap URLs no page links to), broken links and redirecting links.
//
// usage: npm run build && npx next start -p 3100
//        BASE_URL=http://localhost:3100 node scripts/crawl.mjs [--full] [--sample=300] [--concurrency=4] [--max=N]
//
// Breadth-first from "/", level by level, so a page's depth is its shortest
// click distance from home. Follows every same-origin <a href> except /api/,
// /_next/, files, search results and filter URLs (form/rx/min/max/sort): those
// are noindex by design and would multiply the crawl; ?page=N and ?direction=
// links are followed. Redirects are followed at the same depth and reported
// (internal links should point at the final URL).
//
// Default mode is gentle on the shared database (it also serves the mobile app):
// every non-drug page is fetched (home, indexes, hubs with all their pages,
// A-Z, static), drug pages (/dawa/*) are only *discovered* (depth = linking
// page + 1, which is all depth and orphan checks need), and a random sample of
// drug pages (--sample) is fetched with their links checked, including the
// /badael and /dawaei-estemal sub-pages the sitemap expects. Sub-pages of
// unsampled drugs get depth = drug + 1 (the template links them; verified on
// the sample). --full fetches everything instead.
// Writes docs/part4/crawl-report.json and docs/part4/crawl-report.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const FULL = 'full' in args;
const SAMPLE = Number(args.sample ?? 300);
const MAX = Number(args.max || Infinity);
const CONCURRENCY = Number(args.concurrency || 4);
const outDir = fileURLToPath(new URL('../docs/part4/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const SKIP_PARAMS = new Set(['form', 'rx', 'min', 'max', 'sort', 'q']);
const skipped = { filter: 0, search: 0, file: 0, api: 0, external: 0 };

/** Canonical key of an internal URL: pathname (percent-encoded) + sorted query; null when not crawled. */
function keyOf(href, from) {
  let u;
  try {
    u = new URL(href.replace(/&amp;/g, '&'), from);
  } catch {
    return null;
  }
  if (u.origin !== new URL(BASE).origin) {
    if (/^https?:/.test(u.protocol)) skipped.external++;
    return null;
  }
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/_next/')) return skipped.api++, null;
  if (/\.(xml|txt|svg|png|jpe?g|webp|ico|json)$/i.test(u.pathname)) return skipped.file++, null;
  if (u.pathname === '/search') return skipped.search++, null;
  const params = [...u.searchParams.entries()];
  if (params.some(([k]) => SKIP_PARAMS.has(k))) return skipped.filter++, null;
  params.sort(([a], [b]) => a.localeCompare(b));
  const qs = new URLSearchParams(params).toString();
  return u.pathname + (qs ? `?${qs}` : '');
}

/** Page type, for the depth tables. */
function typeOf(key) {
  const [path, qs] = key.split('?');
  const paged = /(^|&)page=/.test(qs ?? '');
  let t;
  if (path === '/') t = 'home';
  else if (/^\/dawa\/[^/]+\/badael$/.test(path)) t = 'drug: alternatives';
  else if (/^\/dawa\/[^/]+\/dawaei-estemal$/.test(path)) t = 'drug: uses';
  else if (/^\/dawa\/[^/]+$/.test(path)) t = 'drug';
  else if (/^\/(active-ingredient|sharika|category|atc|adwiya)$/.test(path)) t = 'index page';
  else if (path.startsWith('/active-ingredient/')) t = 'ingredient';
  else if (path.startsWith('/sharika/')) t = 'company';
  else if (path.startsWith('/category/')) t = 'category';
  else if (path.startsWith('/atc/')) t = 'atc';
  else if (path.startsWith('/adwiya/')) t = 'A-Z letter';
  else if (path === '/last-prices') t = 'last prices';
  else t = 'static';
  return paged ? `${t} (page 2+)` : t;
}
const isDrugPage = (key) => /^\/dawa\//.test(key);

/** key -> { depth, parent, status ('unfetched' when only discovered), indexable, canonical, redirect, links } */
const pages = new Map();
const brokenLinks = [];
const redirectLinks = [];
let fetched = 0;
let totalMs = 0;
const startedAt = Date.now();

async function fetchPage(key) {
  const started = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(BASE + key, { redirect: 'manual', headers: { 'user-agent': 'dwaprice-crawl' } });
      const ms = performance.now() - started;
      if (res.status >= 300 && res.status < 400) return { status: res.status, location: res.headers.get('location'), ms };
      const html = (res.headers.get('content-type') ?? '').includes('text/html') ? await res.text() : '';
      return { status: res.status, html, ms };
    } catch (error) {
      if (attempt >= 2) return { status: 0, error: String(error), ms: performance.now() - started };
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

/**
 * Fetches `key`, records its status/robots/canonical and returns the new
 * internal links it found (added to `pages` at depth + 1). `follow(k)` decides
 * which new links are returned for fetching; the others stay "unfetched".
 */
async function visit(key, follow) {
  const page = pages.get(key);
  const res = await fetchPage(key);
  fetched++;
  totalMs += res.ms;
  page.status = res.status;
  const found = [];
  if (res.location) {
    const target = keyOf(res.location, BASE + key);
    page.redirect = target ?? res.location;
    redirectLinks.push({ from: page.parent, to: key, location: page.redirect, status: res.status });
    if (target && !pages.has(target)) {
      pages.set(target, { depth: page.depth, parent: key, status: 'unfetched' });
      found.push(target); // a redirect is not a click: same depth
    }
    return found;
  }
  if (res.status !== 200) {
    brokenLinks.push({ from: page.parent, to: key, status: res.status, error: res.error });
    return found;
  }
  const robots = /<meta name="robots" content="([^"]*)"/.exec(res.html)?.[1] ?? '';
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(res.html)?.[1];
  page.indexable = !/noindex/.test(robots);
  page.canonical = canonical ? new URL(canonical).pathname + new URL(canonical).search : null;
  page.links = new Set();
  for (const m of res.html.matchAll(/<a\s[^>]*?href="([^"#][^"]*)"/g)) {
    const k = keyOf(m[1], BASE + key);
    if (!k || page.links.has(k)) continue;
    page.links.add(k);
    if (!pages.has(k)) {
      pages.set(k, { depth: page.depth + 1, parent: key, status: 'unfetched' });
      if (follow(k)) found.push(k);
    }
  }
  return found;
}

async function pool(items, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length && fetched < MAX) await fn(items[i++]);
    }),
  );
}

// ---------------------------------------------------------------- 1. breadth-first crawl
pages.set('/', { depth: 0, parent: null, status: 'unfetched' });
let level = ['/'];
const follow = (k) => FULL || !isDrugPage(k);
while (level.length && fetched < MAX) {
  const next = [];
  const depth = pages.get(level[0]).depth;
  // redirects append to the current level (same depth)
  await pool(level, async (key) => {
    for (const k of await visit(key, follow)) (pages.get(k).depth === depth ? level : next).push(k);
  });
  console.log(`depth ${depth}: ${level.length} fetched (total ${fetched}, next level ${next.length}, ${((Date.now() - startedAt) / 1000).toFixed(0)} s)`);
  level = next;
}

// ---------------------------------------------------------------- 2. sitemaps
const sitemap = [];
{
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  for (const f of [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)) {
    const body = await (await fetch(BASE + f)).text();
    for (const m of body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = new URL(m[1].replace(/&amp;/g, '&'));
      sitemap.push(u.pathname + u.search);
    }
  }
}
const inSitemap = new Set(sitemap);

// ---------------------------------------------------------------- 3. drug page sample
const templateIssues = [];
let sampled = [];
if (!FULL) {
  // deterministic sample (mulberry32, seed 42) of discovered drug pages that are in the sitemap
  let seed = 42;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const drugs = [...pages.keys()].filter((k) => typeOf(k) === 'drug' && inSitemap.has(k));
  for (let i = drugs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [drugs[i], drugs[j]] = [drugs[j], drugs[i]];
  }
  sampled = drugs.slice(0, SAMPLE);
  const second = [];
  await pool(sampled, async (key) => {
    // links found on a drug page: its sub-pages, and anything not seen yet (noindex hubs, other drugs)
    second.push(...(await visit(key, () => true)));
    const links = pages.get(key).links ?? new Set();
    for (const sub of ['/badael', '/dawaei-estemal']) {
      const expected = inSitemap.has(key + sub);
      const linked = links.has(key + sub);
      if (expected && !linked) templateIssues.push({ key, issue: `sitemap lists ${sub} but the drug page does not link it` });
    }
  });
  // status of every link target first seen on the sampled pages (sub-pages, hubs, other drugs), capped
  const targets = [...new Set(second)].slice(0, 2000);
  await pool(targets, (k) => visit(k, () => false));
  console.log(`sample: ${sampled.length} drug pages + ${targets.length} new link targets fetched (total ${fetched})`);
}

// Sub-pages of unsampled drugs: linked by the drug page template (verified on the sample).
let inferred = 0;
for (const key of sitemap) {
  const m = /^(\/dawa\/[^/]+)\/(badael|dawaei-estemal)$/.exec(key);
  if (!m || pages.has(key)) continue;
  const drug = pages.get(m[1]);
  if (drug && !FULL) {
    pages.set(key, { depth: drug.depth + 1, parent: m[1], status: 'unfetched', inferred: true });
    inferred++;
  }
}

// ---------------------------------------------------------------- 4. report
const complete = fetched < MAX;
const orphans = sitemap.filter((k) => !pages.has(k));
const sitemapIssues = [];
const sitemapDepth = {};
const deepDrugs = [];
for (const key of sitemap) {
  const p = pages.get(key);
  if (!p) continue;
  const t = typeOf(key);
  const s = (sitemapDepth[t] ??= { urls: 0, fetched: 0, maxDepth: 0, depths: {} });
  s.urls++;
  s.maxDepth = Math.max(s.maxDepth, p.depth);
  s.depths[p.depth] = (s.depths[p.depth] ?? 0) + 1;
  if (t === 'drug' && p.depth > 3) deepDrugs.push({ key, depth: p.depth });
  if (p.status === 'unfetched') continue;
  s.fetched++;
  if (p.status !== 200) sitemapIssues.push({ key, issue: `status ${p.status}` });
  else if (p.indexable === false) sitemapIssues.push({ key, issue: 'noindex page listed in sitemap' });
  else if (p.canonical && p.canonical !== key) sitemapIssues.push({ key, issue: `canonical points to ${p.canonical}` });
}
const byType = {};
for (const [key, p] of pages) {
  if (p.status !== 200) continue;
  const s = (byType[typeOf(key)] ??= { pages: 0, indexable: 0, maxDepth: 0 });
  s.pages++;
  if (p.indexable) s.indexable++;
  s.maxDepth = Math.max(s.maxDepth, p.depth);
}
const pathTo = (key) => {
  const chain = [];
  for (let k = key; k; k = pages.get(k)?.parent) chain.unshift(decodeURIComponent(k));
  return chain;
};

const summary = {
  base: BASE,
  mode: FULL ? 'full' : `drug pages discovered + ${sampled.length} sampled`,
  finishedAt: new Date().toISOString(),
  complete,
  fetched,
  urlsKnown: pages.size,
  avgResponseMs: Math.round(totalMs / Math.max(1, fetched)),
  durationS: Math.round((Date.now() - startedAt) / 1000),
  skippedLinks: skipped,
  sitemapUrls: sitemap.length,
  orphans: orphans.length,
  indexableDrugsDeeperThan3: deepDrugs.length,
  brokenLinks: brokenLinks.length,
  redirectingLinks: redirectLinks.length,
  sitemapIssues: sitemapIssues.length,
  templateIssues: templateIssues.length,
  subPagesInferred: inferred,
};
const examplePaths = Object.fromEntries(
  Object.keys(sitemapDepth).map((t) => {
    const deepest = sitemap.filter((k) => typeOf(k) === t && pages.has(k)).sort((a, b) => pages.get(b).depth - pages.get(a).depth)[0];
    return [t, deepest ? pathTo(deepest) : []];
  }),
);
writeFileSync(
  `${outDir}crawl-report.json`,
  JSON.stringify(
    {
      summary,
      depthBySitemapType: sitemapDepth,
      fetchedByType: byType,
      examplePaths,
      orphans: orphans.slice(0, 200),
      deepDrugs: deepDrugs.slice(0, 50),
      brokenLinks: brokenLinks.slice(0, 200),
      redirectingLinks: redirectLinks.slice(0, 200),
      sitemapIssues: sitemapIssues.slice(0, 200),
      templateIssues: templateIssues.slice(0, 200),
    },
    null,
    2,
  ),
);

const n = (x) => x.toLocaleString('en-US');
const hist = (d) => Object.entries(d).map(([k, v]) => `${k}: ${n(v)}`).join(', ');
const list = (items, fmt) => (items.length ? items.slice(0, 20).map(fmt).join('; ') + (items.length > 20 ? ` … (+${items.length - 20})` : '') : 'none');
const md = [
  '# Crawl report (part 4)',
  '',
  `Local production build at \`${BASE}\`, ${summary.finishedAt}. Mode: ${summary.mode}. ${complete ? 'Crawl complete.' : `**Stopped at --max=${MAX}: partial.**`}`,
  '',
  FULL
    ? 'Every reachable page was fetched.'
    : 'Every non-drug page was fetched (home, index pages, every hub page and its ?page=N pages, A-Z pages, last prices, static pages). Drug pages are recorded when a fetched page links them (their depth is exact); a random sample of drug pages was fetched with every new link target on them, and the sub-pages (/badael, /dawaei-estemal) of the other drugs are counted at drug depth + 1 (the drug template links them; checked on the sample).',
  '',
  '| | |',
  '|---|---|',
  `| Pages fetched | ${n(fetched)} (avg ${summary.avgResponseMs} ms; ${n(summary.durationS)} s) |`,
  `| Sitemap URLs (all indexable URLs) | ${n(sitemap.length)} |`,
  `| **Orphans** (in a sitemap, no crawled page links them) | **${n(orphans.length)}** |`,
  `| **Indexable drug pages deeper than 3 clicks** | **${n(deepDrugs.length)}** |`,
  `| **Broken links** (4xx/5xx/network) | **${n(brokenLinks.length)}** |`,
  `| Links that redirect | ${n(redirectLinks.length)} |`,
  `| Sitemap URLs fetched that are noindex / non-200 / canonical elsewhere | ${n(sitemapIssues.length)} |`,
  `| Sampled drug pages missing a sub-page link the sitemap expects | ${n(templateIssues.length)} |`,
  `| Links not followed | filters ${n(skipped.filter)}, search ${n(skipped.search)}, files ${n(skipped.file)}, api ${n(skipped.api)}, external ${n(skipped.external)} |`,
  '',
  '## Click depth of sitemap URLs',
  '',
  '| Type | URLs | Fetched | Max depth | Depth: URLs |',
  '|---|---:|---:|---:|---|',
  ...Object.entries(sitemapDepth).map(([t, s]) => `| ${t} | ${n(s.urls)} | ${n(s.fetched)} | ${s.maxDepth} | ${hist(s.depths)} |`),
  '',
  '## Deepest path per type',
  '',
  ...Object.entries(examplePaths).map(([t, p]) => `- **${t}**: ${p.map((x) => `\`${x}\``).join(' → ')}`),
  '',
  '## Fetched pages by type',
  '',
  '| Type | Pages (200) | Indexable | Max depth |',
  '|---|---:|---:|---:|',
  ...Object.entries(byType).map(([t, s]) => `| ${t} | ${n(s.pages)} | ${n(s.indexable)} | ${s.maxDepth} |`),
  '',
  '## Issues',
  '',
  `- Orphans: ${list(orphans, (o) => `\`${decodeURIComponent(o)}\``)}`,
  `- Drug pages deeper than 3: ${list(deepDrugs, (d) => `\`${d.key}\` (${d.depth})`)}`,
  `- Broken links: ${list(brokenLinks, (b) => `\`${b.from}\` → \`${decodeURIComponent(b.to)}\` (${b.status})`)}`,
  `- Redirecting links: ${list(redirectLinks, (b) => `\`${decodeURIComponent(b.from ?? '')}\` → \`${decodeURIComponent(b.to)}\` (${b.status} → \`${decodeURIComponent(b.location)}\`)`)}`,
  `- Sitemap issues: ${list(sitemapIssues, (s) => `\`${decodeURIComponent(s.key)}\` ${s.issue}`)}`,
  `- Template issues: ${list(templateIssues, (s) => `\`${s.key}\` ${s.issue}`)}`,
  '',
].join('\n');
writeFileSync(`${outDir}crawl-report.md`, md);
console.log(JSON.stringify(summary, null, 2));
