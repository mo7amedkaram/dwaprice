// Captures one real response from every endpoint of the Drug Prices API (sample, authenticated,
// Enterprise, errors) into docs/api/phase2/responses/<name>.json, each with status and the
// relevant headers, plus a summary table. Keys are read from the environment, never written.
// usage: API_BASE_URL=http://localhost:3100/api/v1 API_KEY_STARTER=dp_live_… API_KEY_ENTERPRISE=dp_live_… node scripts/api-responses.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.API_BASE_URL || 'http://localhost:3100/api/v1').replace(/\/$/, '');
const STARTER = process.env.API_KEY_STARTER;
const ENTERPRISE = process.env.API_KEY_ENTERPRISE;
if (!STARTER || !ENTERPRISE) throw new Error('API_KEY_STARTER and API_KEY_ENTERPRISE are required');
const out = fileURLToPath(new URL('../docs/api/phase2/responses/', import.meta.url));
mkdirSync(out, { recursive: true });

const KEEP_HEADERS = ['content-type', 'cache-control', 'etag', 'x-sample', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-quota-limit', 'x-quota-remaining', 'x-quota-reset', 'retry-after', 'location', 'access-control-allow-origin', 'content-disposition', 'x-dataset-version'];
const rows = [];

async function capture(name, path, { key = null, method = 'GET', body = null, headers = {}, truncate = 3, raw = false } = {}) {
  const h = { ...headers };
  if (key) h.Authorization = `Bearer ${key}`;
  if (body) h['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const shown = json && !raw ? trim(json, truncate) : raw ? text.slice(0, 1500) : text.slice(0, 1500);
  const kept = Object.fromEntries(KEEP_HEADERS.filter((k) => res.headers.get(k)).map((k) => [k, res.headers.get(k)]));
  writeFileSync(`${out}${name}.json`, JSON.stringify({ request: { method, path, auth: key ? (key === STARTER ? 'starter key' : 'enterprise key') : 'none', body }, status: res.status, headers: kept, body: shown }, null, 2));
  rows.push({ name, method, path: path.length > 70 ? path.slice(0, 67) + '…' : path, status: res.status, items: Array.isArray(json?.data) ? json.data.length : json?.data ? 1 : '-' });
  return { res, json, text };
}

/** Keeps responses readable: long arrays are cut to `n` items with a note. */
function trim(value, n) {
  if (Array.isArray(value)) {
    const cut = value.slice(0, n).map((v) => trim(v, n));
    return value.length > n ? [...cut, `… ${value.length - n} more item(s) omitted here (full response had ${value.length})`] : cut;
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'data' && Array.isArray(v) ? trim(v, n) : v && typeof v === 'object' ? trim(v, n) : v]));
  return value;
}

const since = new Date(Date.now() - 2 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const sinceOld = new Date(Date.now() - 300 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

// ---- sample (no key)
await capture('sample-meta', '/sample/meta');
await capture('sample-drugs-list', '/sample/drugs?limit=3');
await capture('sample-drugs-search-misspelled', '/sample/drugs?q=' + encodeURIComponent('اوجمنتن'));
await capture('sample-drugs-search-non-sample-name', '/sample/drugs?q=' + encodeURIComponent('بانادول'));
await capture('sample-drug-get', '/sample/drugs/augmentin-1gm-14-tablets', { truncate: 10 });
await capture('sample-drug-get-non-sample-id', '/sample/drugs/congestal-20-tabs');
await capture('sample-drugs-by-barcode', '/sample/drugs/by-barcode/6221051011317');
await capture('sample-drug-alternatives', '/sample/drugs/augmentin-1gm-14-tablets/alternatives?strength=any');
await capture('sample-drug-price-history', '/sample/drugs/augmentin-1gm-14-tablets/price-history', { truncate: 20 });
await capture('sample-price-changes', `/sample/price-changes?since=${since}`);
await capture('sample-companies', '/sample/companies?limit=5');
await capture('sample-ingredients', '/sample/ingredients?limit=5');

// ---- authenticated (starter)
await capture('meta', '/meta', { key: STARTER });
await capture('drugs-list', '/drugs?limit=3&dosage_form=syrup&sort=price', { key: STARTER });
await capture('drugs-search', '/drugs?q=' + encodeURIComponent('كونجستل') + '&limit=3', { key: STARTER });
await capture('drugs-filter-atc-updated', '/drugs?atc=J01C&prescription_status=prescription&limit=3', { key: STARTER });
await capture('drug-get', '/drugs/congestal-20-tabs', { key: STARTER, truncate: 10 });
await capture('drug-get-not-found', '/drugs/no-such-drug', { key: STARTER });
await capture('drugs-by-barcode', '/drugs/by-barcode/6221051011317', { key: STARTER, truncate: 10 });
await capture('drug-alternatives', '/drugs/augmentin-1gm-14-tablets/alternatives?limit=3', { key: STARTER });
await capture('drug-price-history', '/drugs/interofer-100mg-5ml-5-amp-for-i-v-inj/price-history', { key: STARTER, truncate: 20 });
await capture('price-changes', `/price-changes?since=${since}&limit=3`, { key: STARTER });
await capture('price-changes-since-too-old', `/price-changes?since=${sinceOld}`, { key: STARTER });
await capture('companies', '/companies?q=eva&limit=3', { key: STARTER });
await capture('ingredients', '/ingredients?q=' + encodeURIComponent('بارا') + '&limit=3', { key: STARTER });
const list = await capture('drugs-list-page-1', '/drugs?limit=2&company=sigma', { key: STARTER });
if (list.json?.page?.next_cursor) await capture('drugs-list-page-2', `/drugs?limit=2&company=sigma&cursor=${encodeURIComponent(list.json.page.next_cursor)}`, { key: STARTER });

// ---- errors
await capture('error-401-no-key', '/drugs?limit=1');
await capture('error-401-bad-key', '/drugs?limit=1', { key: 'dp_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
await capture('error-400-validation', '/drugs?limit=500&dosage_form=pill', { key: STARTER });
await capture('error-400-invalid-cursor', '/drugs?cursor=abc.def', { key: STARTER });
await capture('error-403-plan-feature', '/exports', { key: STARTER, method: 'POST', body: { format: 'csv' } });
const etag = (await fetch(`${BASE}/meta`, { headers: { Authorization: `Bearer ${STARTER}` } })).headers.get('etag');
await capture('etag-304', '/meta', { key: STARTER, headers: { 'If-None-Match': etag }, raw: true });

// ---- enterprise
const exp = await capture('export-create', '/exports', { key: ENTERPRISE, method: 'POST', body: { format: 'csv' } });
if (exp.json?.data?.id) {
  await capture('export-get', `/exports/${exp.json.data.id}`, { key: ENTERPRISE });
  const dl = await fetch(exp.json.data.url);
  const csv = await dl.text();
  const lines = csv.split('\r\n');
  writeFileSync(`${out}export-download-csv.json`, JSON.stringify({ request: { method: 'GET', path: '/exports/{id}/download?exp=…&sig=…', auth: 'signed URL' }, status: dl.status, headers: Object.fromEntries(KEEP_HEADERS.filter((k) => dl.headers.get(k)).map((k) => [k, dl.headers.get(k)])), rows: lines.length - 2, first_lines: lines.slice(0, 3).map((l) => l.slice(0, 400)) }, null, 2));
  rows.push({ name: 'export-download-csv', method: 'GET', path: '/exports/{id}/download (signed)', status: dl.status, items: lines.length - 2 });
}
const wh = await capture('webhook-create', '/webhooks', { key: ENTERPRISE, method: 'POST', body: { url: 'https://example.com/hooks/dwaprice', events: ['price_changed', 'status_changed'] } });
await capture('webhooks-list', '/webhooks', { key: ENTERPRISE });
if (wh.json?.data?.id) {
  await capture('webhook-test', `/webhooks/${wh.json.data.id}/test`, { key: ENTERPRISE, method: 'POST' });
  await capture('webhook-delete', `/webhooks/${wh.json.data.id}`, { key: ENTERPRISE, method: 'DELETE', raw: true });
}

writeFileSync(`${out}INDEX.md`, ['# Captured responses (phase 2)', '', `Base URL: \`${BASE}\`, captured ${new Date().toISOString()}. Long arrays are cut to a few items in these files.`, '', '| file | request | status | items |', '|---|---|---:|---:|', ...rows.map((r) => `| \`${r.name}.json\` | \`${r.method} ${r.path}\` | ${r.status} | ${r.items} |`), ''].join('\n'));
console.table(rows);
