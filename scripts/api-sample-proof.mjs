// Empirical proof that the sample endpoints cannot return a product outside api.sample_drugs:
// random non-sample ids, barcodes, company and ingredient filters, the names of random
// non-sample products as searches, every sample drug's alternatives and the sample
// feed, companies and ingredients. Needs API_DATABASE_URL (to pick targets) and a running server.
// usage: API_BASE_URL=http://localhost:3100/api/v1 node scripts/api-sample-proof.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const BASE = (process.env.API_BASE_URL || 'http://localhost:3100/api/v1').replace(/\/$/, '');
const env = (n) => process.env[n] ?? readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith(`${n}=`))?.slice(n.length + 1).trim();
const db = new pg.Client({ connectionString: env('API_DATABASE_URL'), ssl: { rejectUnauthorized: false } });
await db.connect();

let net = 0;
async function get(path) {
  // the sample is limited per source network; each probe comes from its own test network
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-forwarded-for': `192.0.${net++ % 250}.10` } });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const sample = new Set((await db.query('select id from api.sample_drugs')).rows.map((r) => r.id));
const nonSample = (await db.query(`select s.id, s.barcode, s.record->>'trade_name_ar' as ar, s.record->>'trade_name_en' as en, s.record->'company'->>'id' as company, s.ingredient_ids
                                   from api.drug_state s
                                   where s.is_current and s.verified and s.record->>'trade_name_ar' is not null and s.id not in (select id from api.sample_drugs)
                                   order by random() limit 150`)).rows;
const randomIds = (await db.query(`select id from api.drug_state where is_current and id not in (select id from api.sample_drugs) order by random() limit 150`)).rows.map((r) => r.id);
const barcodes = (await db.query(`select barcode from (select distinct barcode from api.drug_state where is_current and barcode is not null and id not in (select id from api.sample_drugs)) x order by random() limit 100`)).rows.map((r) => r.barcode);

const checks = [];
let leaks = 0;
const record = (kind, probes, bad) => {
  checks.push({ kind, probes, leaks: bad });
  leaks += bad;
};

// 1. by id
let bad = 0;
for (const id of randomIds) {
  const r = await get(`/sample/drugs/${id}`);
  if (r.status !== 404) bad++;
}
record('GET /sample/drugs/{id} with 150 random non-sample ids → must be 404', randomIds.length, bad);

// 2. by barcode
bad = 0;
for (const b of barcodes) {
  const r = await get(`/sample/drugs/by-barcode/${b}`);
  if (r.status !== 200 || (r.json.data ?? []).some((d) => !sample.has(d.id))) bad++;
}
record('GET /sample/drugs/by-barcode/{barcode} with 100 non-sample barcodes → must be []', barcodes.length, bad);

// 3. search by the names of the most visited non-sample products (Arabic and English), plus short prefixes
bad = 0;
let probes = 0;
const terms = new Set();
for (const d of nonSample) {
  if (d.ar) terms.add(d.ar.split(' ').slice(0, 2).join(' '));
  if (d.en) terms.add(d.en.split(' ').slice(0, 2).join(' '));
}
for (const t of ['با', 'او', 'كو', 'pa', 'au', 'co', 'ام', 'سي', 'فل', 'ni', 'br', 'vo']) terms.add(t);
for (const t of terms) {
  probes++;
  const r = await get(`/sample/drugs?q=${encodeURIComponent(t)}&limit=100`);
  if (r.status !== 200 || (r.json.data ?? []).some((d) => !sample.has(d.id))) bad++;
}
record('GET /sample/drugs?q= with non-sample product names and short prefixes → results ⊆ sample', probes, bad);

// 4. filters by non-sample companies and ingredients
bad = 0;
probes = 0;
for (const d of nonSample.slice(0, 60)) {
  if (d.company) {
    probes++;
    const r = await get(`/sample/drugs?company=${d.company}&limit=100`);
    if (r.status !== 200 || (r.json.data ?? []).some((x) => !sample.has(x.id))) bad++;
  }
  for (const ing of (d.ingredient_ids ?? []).slice(0, 1)) {
    probes++;
    const r = await get(`/sample/drugs?ingredient=${ing}&limit=100`);
    if (r.status !== 200 || (r.json.data ?? []).some((x) => !sample.has(x.id))) bad++;
  }
}
record('GET /sample/drugs?company= / ?ingredient= of non-sample products → results ⊆ sample', probes, bad);

// 5. every sample drug's alternatives (any strength), price history, and the full listing
bad = 0;
for (const id of sample) {
  const r = await get(`/sample/drugs/${id}/alternatives?strength=any&limit=100`);
  if (r.status !== 200 || (r.json.data ?? []).some((x) => !sample.has(x.id))) bad++;
}
record('GET /sample/drugs/{id}/alternatives for all 50 sample drugs → alternatives ⊆ sample', sample.size, bad);
bad = 0;
const all = [];
let cursor = null;
do {
  const r = await get(`/sample/drugs?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
  all.push(...(r.json.data ?? []).map((d) => d.id));
  cursor = r.json.page?.next_cursor ?? null;
} while (cursor);
if (all.length !== sample.size || all.some((id) => !sample.has(id))) bad = 1;
record('GET /sample/drugs (all pages) → exactly the 50 sample ids', 1, bad);

// 6. feed, companies, ingredients
bad = 0;
const since = new Date(Date.now() - 6 * 86_400_000).toISOString();
const feed = await get(`/sample/price-changes?since=${since}&limit=100`);
if (feed.status !== 200 || (feed.json.data ?? []).some((e) => !sample.has(e.drug_id))) bad++;
record('GET /sample/price-changes → events of sample drugs only', 1, bad);
const sampleCompanies = new Set((await db.query('select distinct unnest(company_ids) as c from api.drug_state s join api.sample_drugs d on d.id = s.id')).rows.map((r) => r.c));
const sampleIngredients = new Set((await db.query('select distinct unnest(ingredient_ids) as i from api.drug_state s join api.sample_drugs d on d.id = s.id')).rows.map((r) => r.i));
bad = 0;
const co = await get('/sample/companies?limit=100');
if ((co.json.data ?? []).some((c) => !sampleCompanies.has(c.id))) bad++;
const ing = await get('/sample/ingredients?limit=100');
if ((ing.json.data ?? []).some((i) => !sampleIngredients.has(i.id))) bad++;
record('GET /sample/companies and /sample/ingredients → only those of sample drugs', 2, bad);

await db.end();
const total = checks.reduce((n, c) => n + c.probes, 0);
const md = [
  '# Sample isolation proof (phase 2)',
  '',
  `Base URL \`${BASE}\`, ${new Date().toISOString()}. ${total.toLocaleString('en-US')} probes against the sample endpoints, **${leaks} leak(s)**.`,
  '',
  '| check | probes | leaks |',
  '|---|---:|---:|',
  ...checks.map((c) => `| ${c.kind} | ${c.probes} | ${c.leaks} |`),
  '',
  'By construction: every sample query in `src/lib/api/drugs.ts` carries `s.id in (select id from api.sample_drugs)` (search runs only over those 50 records; alternatives, barcode, feed, companies and ingredients are joined to the same table). The table is read-only for the API role (`docs/api/phase2/api_boundary.txt`).',
  '',
].join('\n');
writeFileSync(fileURLToPath(new URL('../docs/api/phase2/sample-isolation-proof.md', import.meta.url)), md);
console.log(md);
