// Integration tests of the Drug Prices API against a running server (docs/API_SPEC.md).
// Runs only when API_BASE_URL is set (e.g. http://localhost:3100/api/v1) and API_DATABASE_URL
// is available (environment or .env.local); creates its own clients/keys/plan and removes them.
//
//   npm run build && npx next start -p 3100
//   API_BASE_URL=http://localhost:3100/api/v1 npx vitest run tests/api-integration.test.ts
import { createServer, type Server } from 'node:http';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKey } from '@/lib/api/keys';
import { findForbiddenFields } from '@/lib/api/records';

function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const BASE = process.env.API_BASE_URL?.replace(/\/$/, '');
const DB = envVar('API_DATABASE_URL');
const SECRET = envVar('API_SECRET');
const run = BASE && DB ? describe : describe.skip;

type Json = Record<string, unknown>;
interface Res {
  status: number;
  headers: Headers;
  json: Json;
  text: string;
}
// Sample calls carry no key and are limited per source network (/24); the suite makes a few
// hundred of them, so each one comes from another test network (locally the proxy header is
// trusted; in production the platform sets it to the real client address).
let net = 0;
async function call(path: string, key?: string | null, init: RequestInit = {}): Promise<Res> {
  const headers = new Headers(init.headers);
  if (key) headers.set('Authorization', `Bearer ${key}`);
  else if (path.startsWith('/sample/')) headers.set('x-forwarded-for', `198.${18 + Math.floor(net / 250)}.${net++ % 250}.10`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
  const text = await res.text();
  let json: Json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { status: res.status, headers: res.headers, json, text };
}
const data = <T = Json>(r: Res) => r.json.data as T;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const ids = (r: Res) => (data<Json[]>(r) ?? []).map((d) => d.id as string);

run('Drug Prices API (integration)', () => {
  const db = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  const clients: string[] = [];
  const keys: Record<string, string> = {};
  let sampleIds: Set<string>;

  async function makeClient(name: string, plan: string, status = 'active', keyOpts: { scopes?: string[]; status?: string; expires?: string } = {}): Promise<{ clientId: string; key: string; keyId: string }> {
    const [c] = (await db.query(`insert into api.clients (company, contact_name, email, plan_id, status) values ($1, 'Test', 'test@example.com', $2, $3) returning id`, [`[test] ${name}`, plan, status])).rows;
    clients.push(c.id);
    const k = generateKey();
    const [row] = (
      await db.query(`insert into api.api_keys (client_id, name, key_prefix, key_hash, scopes, status, expires_at) values ($1, 'test', $2, $3, $4, $5, $6) returning id`, [
        c.id, k.prefix, k.hash, keyOpts.scopes ?? ['drugs:read', 'changes:read', 'export', 'webhooks'], keyOpts.status ?? 'active', keyOpts.expires ?? null,
      ])
    ).rows;
    return { clientId: c.id, key: k.key, keyId: row.id };
  }

  beforeAll(async () => {
    await db.connect();
    await db.query(`insert into api.plans (id, name, name_ar, rpm, monthly_quota, max_keys, feed_window_days, features, is_public, sort)
                    values ('test-rpm5', 'Test 5/min', 'اختبار', 5, 1000, 3, 90, '{"export": true, "webhooks": true}', false, 99) on conflict (id) do nothing`);
    keys.starter = (await makeClient('starter', 'starter', 'active', { scopes: ['drugs:read', 'changes:read'] })).key;
    keys.readonly = (await makeClient('readonly', 'starter', 'active', { scopes: ['drugs:read'] })).key;
    keys.limited = (await makeClient('limited', 'test-rpm5')).key;
    keys.enterprise = (await makeClient('enterprise', 'enterprise')).key;
    keys.suspended = (await makeClient('suspended', 'starter', 'suspended')).key;
    keys.revoked = (await makeClient('revoked', 'starter', 'active', { status: 'revoked' })).key;
    keys.expired = (await makeClient('expired', 'starter', 'active', { expires: '2020-01-01T00:00:00Z' })).key;
    const all: string[] = [];
    let cursor: string | null = null;
    do {
      const r: Res = await call(`/sample/drugs?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      all.push(...ids(r));
      cursor = (r.json.page as { next_cursor: string | null }).next_cursor;
    } while (cursor);
    sampleIds = new Set(all);
  }, 60_000);

  afterAll(async () => {
    if (clients.length) await db.query('delete from api.clients where id = any($1::uuid[])', [clients]);
    await db.query(`delete from api.plans where id = 'test-rpm5'`);
    await db.end();
  });

  // ------------------------------------------------------------------ auth
  describe('authentication', () => {
    it('rejects a missing, malformed, unknown, revoked or expired key with 401 and one error shape', async () => {
      for (const [label, key] of [['missing', null], ['malformed', 'not-a-key'], ['unknown', generateKey().key], ['revoked', keys.revoked], ['expired', keys.expired]] as const) {
        const r = await call('/drugs?limit=1', key);
        expect(r.status, label).toBe(401);
        expect(r.json).toMatchObject({ error: { code: 'unauthorized', message: expect.any(String), details: null } });
        expect(r.headers.get('cache-control')).toBe('no-store');
      }
    });
    it('answers 403 for a suspended client, a missing scope and a plan without the feature', async () => {
      const s = await call('/drugs?limit=1', keys.suspended);
      expect(s.status).toBe(403);
      expect(s.json).toMatchObject({ error: { code: 'forbidden', details: { reason: 'client_suspended' } } });
      const scope = await call('/price-changes?since=2026-01-01T00:00:00Z', keys.readonly);
      expect(scope.status).toBe(403);
      expect(scope.json).toMatchObject({ error: { code: 'forbidden', details: { required_scope: 'changes:read' } } });
      const feature = await call('/exports', keys.starter, { method: 'POST', body: JSON.stringify({ format: 'csv' }), headers: { 'Content-Type': 'application/json' } });
      expect(feature.status).toBe(403);
      expect(feature.json).toMatchObject({ error: { code: 'forbidden', details: { plan: 'starter', required_scope: 'export' } } });
    });
    it('accepts a valid key and returns rate-limit, quota and ETag headers; If-None-Match gives 304', async () => {
      const r = await call('/drugs?limit=2', keys.starter);
      expect(r.status).toBe(200);
      for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-quota-limit', 'x-quota-remaining', 'x-quota-reset', 'etag', 'x-request-id']) expect(r.headers.get(h), h).toBeTruthy();
      expect(r.headers.get('x-ratelimit-limit')).toBe('60');
      expect(r.headers.get('x-quota-limit')).toBe('50000');
      const again = await call('/drugs?limit=2', keys.starter, { headers: { 'If-None-Match': r.headers.get('etag')! } });
      expect(again.status).toBe(304);
    });
  });

  // ------------------------------------------------------------------ limits
  describe('plan limits', () => {
    it('enforces the per-minute limit of the plan (5/min on the test plan) with Retry-After', async () => {
      const seen: number[] = [];
      let last: Res | null = null;
      for (let i = 0; i < 7; i++) {
        last = await call(`/meta?i=${i}`, keys.limited);
        seen.push(last.status);
        if (last.status === 429) break;
      }
      expect(seen.filter((s) => s === 200).length).toBe(5);
      expect(last!.status).toBe(429);
      expect(last!.json).toMatchObject({ error: { code: 'rate_limited', details: { retry_after: expect.any(Number) } } });
      expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(last!.headers.get('x-ratelimit-remaining')).toBe('0');
    });
  });

  // ------------------------------------------------------------------ sample isolation
  describe('the sample cannot reach the catalogue', () => {
    it('is a fixed set of 50 drugs, marked sample', async () => {
      expect(sampleIds.size).toBe(50);
      const r = await call('/sample/meta');
      expect(r.status).toBe(200);
      expect(r.json.sample).toBe(true);
      expect(r.headers.get('x-sample')).toBe('true');
      expect(r.headers.get('access-control-allow-origin')).toBe('*');
      expect((data(r).counts as Json).drugs).toBe(50);
    });
    it('search, filters, by-id, by-barcode, alternatives, companies and ingredients stay inside the set', async () => {
      // names of real products that are not in the sample
      const real = await call('/drugs?limit=100&sort=-updated_at', keys.starter);
      const outside = data<Json[]>(real).filter((d) => !sampleIds.has(d.id as string)).slice(0, 15);
      expect(outside.length).toBeGreaterThan(5);
      for (const d of outside) {
        const byName = await call(`/sample/drugs?q=${encodeURIComponent((d.trade_name_ar as string) ?? (d.trade_name_en as string))}`);
        expect(byName.status).toBe(200);
        for (const id of ids(byName)) expect(sampleIds.has(id), `search leaked ${id}`).toBe(true);
        const byId = await call(`/sample/drugs/${d.id}`);
        expect(byId.status, `by id ${d.id}`).toBe(404);
        if (d.barcode) {
          const byBarcode = await call(`/sample/drugs/by-barcode/${d.barcode}`);
          expect(byBarcode.status).toBe(200);
          for (const id of ids(byBarcode)) expect(sampleIds.has(id)).toBe(true);
        }
        const byCompany = await call(`/sample/drugs?company=${(d.company as Json | null)?.id ?? 'none'}`);
        for (const id of ids(byCompany)) expect(sampleIds.has(id)).toBe(true);
      }
      for (const q of ['بانادول', 'panadol', 'كونجستال', 'augmentin', 'برو', 'او']) {
        const r = await call(`/sample/drugs?q=${encodeURIComponent(q)}&limit=100`);
        expect(r.status).toBe(200);
        for (const id of ids(r)) expect(sampleIds.has(id), `q=${q} leaked ${id}`).toBe(true);
      }
      for (const id of [...sampleIds].slice(0, 50)) {
        const alt = await call(`/sample/drugs/${id}/alternatives?strength=any&limit=100`);
        expect(alt.status).toBe(200);
        for (const a of ids(alt)) expect(sampleIds.has(a), `alternatives of ${id} leaked ${a}`).toBe(true);
      }
      const changes = await call(`/sample/price-changes?since=${daysAgo(3)}&limit=100`);
      expect(changes.status).toBe(200);
      for (const e of data<Json[]>(changes)) expect(sampleIds.has(e.drug_id as string)).toBe(true);
      const sampleCompanies = new Set<string>();
      const sampleIngredients = new Set<string>();
      for (const id of sampleIds) {
        const d = data(await call(`/sample/drugs/${id}`));
        if (d.company) sampleCompanies.add((d.company as Json).id as string);
        if (d.manufacturer) sampleCompanies.add((d.manufacturer as Json).id as string);
        for (const i of d.ingredients as Json[]) if (i.id) sampleIngredients.add(i.id as string);
      }
      for (const id of ids(await call('/sample/companies?limit=100'))) expect(sampleCompanies.has(id)).toBe(true);
      for (const id of ids(await call('/sample/ingredients?limit=100'))) expect(sampleIngredients.has(id)).toBe(true);
    }, 120_000);
  });

  // ------------------------------------------------------------------ forbidden fields
  describe('no forbidden field in any response', () => {
    it('scans every endpoint, real and sample', async () => {
      const sampleId = [...sampleIds][0];
      const real = data<Json[]>(await call('/drugs?limit=1&has_barcode=true', keys.starter))[0];
      const paths = [
        '/drugs?limit=100', '/drugs?q=paracetamol&limit=50', `/drugs/${real.id}`, `/drugs/by-barcode/${real.barcode}`, `/drugs/${real.id}/alternatives?strength=any`,
        `/drugs/${real.id}/price-history`, `/price-changes?since=${daysAgo(300)}&limit=100`, '/companies?limit=100', '/ingredients?limit=100', '/meta',
      ];
      for (const p of paths) {
        const r = await call(p, keys.enterprise);
        expect(r.status, p).toBe(200);
        expect(findForbiddenFields(r.json), p).toEqual([]);
      }
      for (const p of ['/sample/drugs?limit=100', `/sample/drugs/${sampleId}`, `/sample/drugs/${sampleId}/alternatives`, `/sample/drugs/${sampleId}/price-history`, `/sample/price-changes?since=${daysAgo(3)}`, '/sample/companies', '/sample/ingredients', '/sample/meta']) {
        const r = await call(p);
        expect(r.status, p).toBe(200);
        expect(findForbiddenFields(r.json), p).toEqual([]);
      }
    }, 60_000);
    it('types are consistent: numbers are numbers, unknown is null, dates are ISO', async () => {
      const rows = data<Json[]>(await call('/drugs?limit=100&sort=-price', keys.starter));
      for (const d of rows) {
        const price = d.price as Json;
        expect(['number', 'object']).toContain(typeof price.current); // number or null
        expect(price.current === null || typeof price.current === 'number').toBe(true);
        expect(price.currency).toBe('EGP');
        expect(price.effective_date === null || /^\d{4}-\d{2}-\d{2}$/.test(price.effective_date as string)).toBe(true);
        expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(d.updated_at as string)).toBe(true);
        for (const v of Object.values(d)) expect(v).not.toBe('');
        expect(d.links).toMatchObject({ web_url: expect.stringMatching(/^https:\/\/dwaprice\.com\/dawa\//) });
      }
    });
  });

  // ------------------------------------------------------------------ pagination
  describe('pagination', () => {
    it('cursors continue without overlap, are opaque and bound to the filters', async () => {
      const p1 = await call('/drugs?limit=50&dosage_form=tablet', keys.starter);
      const cursor = (p1.json.page as Json).next_cursor as string;
      expect(cursor).toBeTruthy();
      const p2 = await call(`/drugs?limit=50&dosage_form=tablet&cursor=${encodeURIComponent(cursor)}`, keys.starter);
      expect(p2.status).toBe(200);
      const a = new Set(ids(p1));
      for (const id of ids(p2)) expect(a.has(id)).toBe(false);
      const other = await call(`/drugs?limit=50&dosage_form=syrup&cursor=${encodeURIComponent(cursor)}`, keys.starter);
      expect(other.status).toBe(400);
      expect((other.json.error as Json).code).toBe('invalid_cursor');
      const bad = await call('/drugs?cursor=abc.def', keys.starter);
      expect((bad.json.error as Json).code).toBe('invalid_cursor');
    });
    it('validates parameters with details per parameter', async () => {
      const r = await call('/drugs?limit=500&dosage_form=pill&atc=123', keys.starter);
      expect(r.status).toBe(400);
      const details = (r.json.error as Json).details as Array<{ param: string }>;
      expect(details.map((d) => d.param).sort()).toEqual(['atc', 'dosage_form', 'limit']);
    });
  });

  // ------------------------------------------------------------------ catalogue behaviour
  describe('catalogue endpoints', () => {
    it('returns a list for a barcode shared by several packs', async () => {
      const [shared] = (await db.query(`select barcode from api.drug_state where is_current and barcode is not null group by barcode having count(*) > 1 limit 1`)).rows;
      const r = await call(`/drugs/by-barcode/${shared.barcode}`, keys.starter);
      expect(r.status).toBe(200);
      expect(data<Json[]>(r).length).toBeGreaterThan(1);
      expect(data<Json[]>(await call('/drugs/by-barcode/00000000', keys.starter))).toEqual([]);
    });
    it('answers 404 for an unknown id and 301 for a retired one', async () => {
      const r = await call('/drugs/no-such-drug-xyz', keys.starter);
      expect(r.status).toBe(404);
      expect((r.json.error as Json).code).toBe('not_found');
      const [retired] = (await db.query(`select slug, current_slug from web.slug_lookup where entity_type = 'drug' and not is_current and current_slug is not null limit 1`)).rows;
      if (retired) {
        const m = await call(`/drugs/${retired.slug}`, keys.starter);
        expect(m.status).toBe(301);
        expect(m.headers.get('location')).toContain(`/drugs/${retired.current_slug}`);
      }
    });
    it('sorts alternatives cheapest first with same-strength matches before other strengths', async () => {
      const r = await call('/drugs/augmentin-1gm-14-tablets/alternatives?strength=any&limit=100', keys.starter);
      expect(r.status).toBe(200);
      const rows = data<Json[]>(r);
      expect(rows.length).toBeGreaterThan(0);
      let seenOther = false;
      let lastPrice = -1;
      for (const a of rows) {
        if (a.match === 'other_strength') seenOther = true;
        else {
          expect(seenOther).toBe(false);
          const p = (a.price as Json).current as number | null;
          if (p !== null) {
            expect(p).toBeGreaterThanOrEqual(lastPrice);
            lastPrice = p;
          }
        }
      }
    });
  });

  // ------------------------------------------------------------------ delta feed
  describe('delta feed', () => {
    it('derives events from price/status differences (api.diff_events)', async () => {
      const rec = (price: number | null, status: string) => JSON.stringify({ price: { current: price, effective_date: '2026-10-14' }, status });
      const rows = async (oldPrice: number | null, oldStatus: string, json: string) => (await db.query(`select type, data from api.diff_events($1, $2, $3::jsonb) order by type`, [oldPrice, oldStatus, json])).rows;
      expect(await rows(31, 'listed', rec(50, 'listed'))).toEqual([{ type: 'price_changed', data: { old: 31, new: 50, effective_date: '2026-10-14', change_pct: 61.29 } }]);
      expect(await rows(50, 'listed', rec(50, 'not_available'))).toEqual([{ type: 'status_changed', data: { old: 'listed', new: 'not_available' } }]);
      expect((await rows(31, 'listed', rec(50, 'cancelled'))).map((r) => r.type)).toEqual(['price_changed', 'status_changed']);
      expect(await rows(50, 'listed', rec(50, 'listed'))).toEqual([]);
      expect(await rows(null, 'listed', rec(50, 'listed'))).toEqual([{ type: 'price_changed', data: { old: null, new: 50, effective_date: '2026-10-14', change_pct: null } }]);
    });
    it('requires since (or a cursor), rejects since outside the plan window, pages in id order with latest_detected_at', async () => {
      const none = await call('/price-changes', keys.starter);
      expect(none.status).toBe(400);
      const old = await call('/price-changes?since=2020-01-01T00:00:00Z', keys.starter); // starter window: 7 days
      expect(old.status).toBe(400);
      expect((old.json.error as Json).code).toBe('since_too_old');
      const future = await call('/price-changes?since=2999-01-01T00:00:00Z', keys.enterprise);
      expect(future.status).toBe(200);
      expect(data<Json[]>(future)).toEqual([]);
      expect(future.json.latest_detected_at).toBeNull();
      const feed = await call(`/price-changes?since=${daysAgo(300)}&limit=100`, keys.enterprise); // enterprise window: 365 days
      expect(feed.status).toBe(200);
      const events = data<Json[]>(feed);
      let lastId = 0;
      for (const e of events) {
        expect((e.id as number) > lastId).toBe(true);
        lastId = e.id as number;
        expect(['price_changed', 'added', 'status_changed', 'removed', 'renamed']).toContain(e.type);
        if (e.type !== 'removed' && e.drug) expect((e.drug as Json).id).toBe(e.drug_id);
        if (e.type === 'price_changed') expect((e.data as Json).new).toBe(((e.drug as Json).price as Json).current);
      }
      if (events.length) expect(feed.json.latest_detected_at).toBe(events[events.length - 1].detected_at);
      const [{ n }] = (await db.query('select count(*)::int as n from api.events')).rows;
      if (n <= 100) expect(events.length).toBe(n);
    });
  });

  // ------------------------------------------------------------------ enterprise
  describe('enterprise: export and webhooks', () => {
    it('creates a signed export link, streams CSV with the client canaries, rejects a forged link', async () => {
      const created = await call('/exports', keys.enterprise, { method: 'POST', body: JSON.stringify({ format: 'csv' }), headers: { 'Content-Type': 'application/json' } });
      expect(created.status).toBe(202);
      const exp = data<Json>(created);
      expect(exp.url).toMatch(/\/exports\/[0-9a-f-]+\/download\?exp=\d+&sig=[0-9a-f]+$/);
      const status = await call(`/exports/${exp.id}`, keys.enterprise);
      expect(status.status).toBe(200);
      const res = await fetch(exp.url as string);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel
      const csv = bytes.subarray(3).toString('utf8');
      const lines = csv.trim().split('\r\n');
      expect(lines[0]).toContain('id,trade_name_en');
      const [{ n }] = (await db.query('select count(*)::int as n from api.drug_state where is_current')).rows;
      expect(lines.length - 1).toBe(n + 3);
      const canaries = (await db.query('select id from api.canaries where client_id = (select client_id from api.api_keys where key_hash = $1)', [createHash('sha256').update(keys.enterprise).digest('hex')])).rows.map((r) => r.id as string);
      expect(canaries.length).toBe(3);
      for (const c of canaries) {
        expect(csv).toContain(`${c},`);
        expect((await call(`/drugs/${c}`, keys.enterprise)).status).toBe(404); // canaries never leave the export
      }
      const forged = await fetch((exp.url as string).replace(/sig=[0-9a-f]+/, 'sig=0000000000000000000000000000dead'));
      expect(forged.status).toBe(403);
      const json = await call('/exports', keys.enterprise, { method: 'POST', body: JSON.stringify({ format: 'json' }), headers: { 'Content-Type': 'application/json' } });
      const parsed = JSON.parse(await (await fetch(data<Json>(json).url as string)).text()) as { data: Json[]; dataset_version: string };
      expect(parsed.data.length).toBe(n + 3);
      expect(findForbiddenFields(parsed)).toEqual([]);
    }, 120_000);

    it('registers a webhook, delivers a signed test call to a local receiver, deletes it', async () => {
      let received: { body: string; sig: string | undefined } | null = null;
      const server: Server = createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          received = { body, sig: req.headers['x-dwaprice-signature'] as string | undefined };
          res.writeHead(200).end('ok');
        });
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const port = (server.address() as { port: number }).port;
      try {
        const bad = await call('/webhooks', keys.enterprise, { method: 'POST', body: JSON.stringify({ url: 'ftp://x', events: ['nope'] }), headers: { 'Content-Type': 'application/json' } });
        expect(bad.status).toBe(400);
        const created = await call('/webhooks', keys.enterprise, { method: 'POST', body: JSON.stringify({ url: `http://127.0.0.1:${port}/hook`, events: ['price_changed'] }), headers: { 'Content-Type': 'application/json' } });
        expect(created.status).toBe(201);
        const hook = data<Json>(created);
        expect(hook.secret).toMatch(/^whsec_/);
        const test = await call(`/webhooks/${hook.id}/test`, keys.enterprise, { method: 'POST' });
        expect(test.status).toBe(200);
        expect((data<Json>(test).status as number)).toBe(200);
        expect(received).not.toBeNull();
        const expected = `sha256=${createHmac('sha256', hook.secret as string).update(received!.body).digest('hex')}`;
        expect(received!.sig).toBe(expected);
        expect(ids(await call('/webhooks', keys.enterprise))).toContain(hook.id);
        const del = await call(`/webhooks/${hook.id}`, keys.enterprise, { method: 'DELETE' });
        expect(del.status).toBe(204);
        expect((await call('/webhooks', keys.starter)).status).toBe(403);
      } finally {
        server.close();
      }
    });
  });

  describe('internal jobs', () => {
    it('needs the secret and reports what it ran', async () => {
      expect((await call('/internal/jobs')).status).toBe(401);
      if (SECRET) {
        const r = await call('/internal/jobs?job=all', null, { headers: { 'x-jobs-secret': SECRET } });
        expect(r.status).toBe(200);
        expect(r.json.ok).toBe(true);
        expect(r.json).toHaveProperty('abuse');
        expect(r.json).toHaveProperty('webhooks');
      }
    });
  });
});
