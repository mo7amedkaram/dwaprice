// Webhooks (Enterprise): registration, signed batch deliveries of api.events, retries with
// back-off for 24 h, then pause + admin alert. Delivery runs from the jobs endpoint.
import { createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { ipInCidr } from './net';
import { apiQuery } from './db';
import { errors } from './errors';
import { apiHandler } from './handler';
import { notifyAdmin } from './notify';
import { EVENT_TYPES, type EventType } from './params';
import { finalizeRecord, iso, type StateRow } from './records';

const MAX_WEBHOOKS = 5;
const BATCH = 100;

// Webhook targets must be public addresses (the API server would otherwise be a proxy into the
// private network). API_ALLOW_PRIVATE_WEBHOOKS=true relaxes this for local tests only.
const PRIVATE_CIDRS = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '::1/128', 'fc00::/7', 'fe80::/10', '::ffff:0:0/96'];
const allowPrivate = () => process.env.API_ALLOW_PRIVATE_WEBHOOKS === 'true';
const isPrivateIp = (ip: string) => PRIVATE_CIDRS.some((c) => ipInCidr(ip, c));

/** Rejects localhost and private/link-local addresses, resolving host names. */
export async function assertPublicTarget(url: URL): Promise<void> {
  if (allowPrivate()) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw errors.validation('url: must be a public address', [{ param: 'url', issue: 'private_target' }]);
  let addresses: string[];
  try {
    addresses = (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw errors.validation('url: host name does not resolve', [{ param: 'url', issue: 'unresolvable' }]);
  }
  if (addresses.some(isPrivateIp)) throw errors.validation('url: must be a public address', [{ param: 'url', issue: 'private_target' }]);
}

interface WebhookRow {
  id: string;
  client_id: string;
  url: string;
  events: string[];
  secret: string;
  status: 'active' | 'paused';
  last_event_id: string;
  failing_since: Date | null;
  attempts: number;
  next_attempt_at: Date | null;
  last_delivery_at: Date | null;
  last_status: number | null;
  created_at: Date;
}

const present = (w: WebhookRow) => ({
  id: w.id,
  url: w.url,
  events: w.events,
  status: w.status,
  created_at: iso(w.created_at),
  last_delivery_at: iso(w.last_delivery_at),
  last_status: w.last_status,
});

export const listWebhooks = apiHandler({
  mode: 'auth',
  endpoint: 'webhooks:list',
  scope: 'webhooks',
  feature: 'webhooks',
  fn: async (ctx) => ({
    body: { data: (await apiQuery<WebhookRow>('select * from api.webhooks where client_id = $1 order by created_at', [ctx.auth!.clientId])).map(present) },
    noCache: true,
  }),
});

export const createWebhook = apiHandler({
  mode: 'auth',
  endpoint: 'webhooks:create',
  scope: 'webhooks',
  feature: 'webhooks',
  fn: async (ctx) => {
    let body: { url?: unknown; events?: unknown; secret?: unknown } = {};
    try {
      body = await ctx.req.json();
    } catch {
      throw errors.validation('body must be JSON', [{ param: 'body', issue: 'invalid_json' }]);
    }
    const issues: Array<{ param: string; issue: string }> = [];
    let url: URL | null = null;
    try {
      url = new URL(String(body.url));
      if (!['https:', 'http:'].includes(url.protocol) || String(body.url).length > 500) url = null;
    } catch {
      url = null;
    }
    if (!url) issues.push({ param: 'url', issue: 'must be an http(s) URL' });
    const events = Array.isArray(body.events) ? body.events.filter((e): e is EventType => typeof e === 'string' && (EVENT_TYPES as readonly string[]).includes(e)) : [];
    if (!events.length) issues.push({ param: 'events', issue: `must list at least one of ${EVENT_TYPES.join(', ')}` });
    if (body.secret !== undefined && (typeof body.secret !== 'string' || body.secret.length < 16 || body.secret.length > 128)) issues.push({ param: 'secret', issue: 'must be 16–128 characters' });
    if (issues.length) throw errors.validation(issues.map((i) => `${i.param}: ${i.issue}`).join('; '), issues);
    await assertPublicTarget(url!);
    const count = await apiQuery<{ n: string }>('select count(*) as n from api.webhooks where client_id = $1', [ctx.auth!.clientId]);
    if (Number(count[0].n) >= MAX_WEBHOOKS) throw errors.validation(`at most ${MAX_WEBHOOKS} webhooks per account`, [{ param: 'url', issue: 'limit' }]);
    const secret = typeof body.secret === 'string' ? body.secret : `whsec_${randomBytes(24).toString('hex')}`;
    const rows = await apiQuery<WebhookRow>(
      `insert into api.webhooks (client_id, url, events, secret, last_event_id)
       values ($1, $2, $3, $4, coalesce((select max(id) from api.events), 0)) returning *`,
      [ctx.auth!.clientId, url!.toString(), [...new Set(events)], secret],
    );
    return { status: 201, body: { data: { ...present(rows[0]), secret } }, noCache: true };
  },
});

export const deleteWebhook = apiHandler<{ id: string }>({
  mode: 'auth',
  endpoint: 'webhooks:delete',
  scope: 'webhooks',
  feature: 'webhooks',
  fn: async (ctx, { id }) => {
    const rows = await apiQuery<{ id: string }>('delete from api.webhooks where id = $1 and client_id = $2 returning id', [id, ctx.auth!.clientId]);
    if (!rows[0]) throw errors.notFound('No webhook with that id');
    return { status: 204, body: {}, noCache: true };
  },
});

export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function post(w: WebhookRow, payload: Record<string, unknown>): Promise<{ status: number; durationMs: number; error?: string }> {
  const body = JSON.stringify(payload);
  const started = performance.now();
  try {
    await assertPublicTarget(new URL(w.url)); // re-checked at delivery: DNS may have changed
    const res = await fetch(w.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'dwaprice-webhooks/1.0',
        'X-Dwaprice-Signature': signBody(w.secret, body),
        'X-Dwaprice-Delivery': String(payload.id),
        'X-Dwaprice-Webhook-Id': w.id,
      },
      body,
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    });
    return { status: res.status, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { status: 0, durationMs: Math.round(performance.now() - started), error: String((error as Error).message ?? error).slice(0, 200) };
  }
}

export const testWebhook = apiHandler<{ id: string }>({
  mode: 'auth',
  endpoint: 'webhooks:test',
  scope: 'webhooks',
  feature: 'webhooks',
  fn: async (ctx, { id }) => {
    const rows = await apiQuery<WebhookRow>('select * from api.webhooks where id = $1 and client_id = $2', [id, ctx.auth!.clientId]);
    if (!rows[0]) throw errors.notFound('No webhook with that id');
    const result = await post(rows[0], { id: `test_${randomBytes(6).toString('hex')}`, created_at: new Date().toISOString(), test: true, events: [] });
    await apiQuery('insert into api.webhook_deliveries (webhook_id, status, duration_ms, error) values ($1, $2, $3, $4)', [id, result.status, result.durationMs, result.error ?? null]);
    return { body: { data: { status: result.status, duration_ms: result.durationMs, error: result.error ?? null } }, noCache: true };
  },
});

/** Delivers pending events to every active webhook whose retry time has come. */
export async function processWebhooks(): Promise<{ delivered: number; failed: number; paused: number }> {
  const out = { delivered: 0, failed: 0, paused: 0 };
  const hooks = await apiQuery<WebhookRow & { plan_features: Record<string, unknown>; client_status: string }>(
    `select w.*, p.features as plan_features, c.status as client_status
     from api.webhooks w join api.clients c on c.id = w.client_id join api.plans p on p.id = c.plan_id
     where w.status = 'active' and (w.next_attempt_at is null or w.next_attempt_at <= now())`,
  );
  for (const w of hooks) {
    if (w.client_status !== 'active' || w.plan_features.webhooks !== true) continue;
    const events = await apiQuery<{ id: string; type: string; detected_at: Date; drug_id: string; data: Record<string, unknown>; s_id: string | null; record: Record<string, unknown> | null; price: string | null; first_seen_at: Date; last_changed_at: Date; last_price_changed_at: Date | null; is_current: boolean }>(
      `select e.id, e.type, e.detected_at, e.drug_id, e.data, s.id as s_id, s.record, s.price, s.first_seen_at, s.last_changed_at, s.last_price_changed_at, s.is_current
       from api.events e left join api.drug_state s on s.id = e.drug_id
       where e.id > $1 and e.type = any($2::text[]) order by e.id limit $3`,
      [w.last_event_id, w.events, BATCH],
    );
    if (!events.length) continue;
    const deliveryId = `dlv_${randomBytes(8).toString('hex')}`;
    const payload = {
      id: deliveryId,
      created_at: new Date().toISOString(),
      events: events.map((e) => ({
        id: Number(e.id),
        type: e.type,
        detected_at: iso(e.detected_at),
        drug_id: e.drug_id,
        data: e.data,
        drug: e.s_id && e.is_current && e.record ? finalizeRecord({ id: e.s_id, record: e.record, price: e.price, first_seen_at: e.first_seen_at, last_changed_at: e.last_changed_at, last_price_changed_at: e.last_price_changed_at } as StateRow) : null,
      })),
    };
    const result = await post(w, payload);
    const lastId = events[events.length - 1].id;
    await apiQuery('insert into api.webhook_deliveries (webhook_id, event_from, event_to, status, duration_ms, error) values ($1, $2, $3, $4, $5, $6)', [
      w.id, events[0].id, lastId, result.status, result.durationMs, result.error ?? null,
    ]);
    if (result.status >= 200 && result.status < 300) {
      out.delivered++;
      await apiQuery('update api.webhooks set last_event_id = $2, attempts = 0, failing_since = null, next_attempt_at = null, last_delivery_at = now(), last_status = $3 where id = $1', [w.id, lastId, result.status]);
    } else {
      out.failed++;
      const attempts = w.attempts + 1;
      const failingSince = w.failing_since ?? new Date();
      const paused = Date.now() - new Date(failingSince).getTime() > 24 * 3600_000;
      const backoffMin = Math.min(60, 2 ** Math.min(attempts, 6));
      await apiQuery(
        `update api.webhooks set attempts = $2, failing_since = $3, next_attempt_at = now() + ($4 || ' minutes')::interval, last_status = $5, status = $6 where id = $1`,
        [w.id, attempts, failingSince, String(backoffMin), result.status, paused ? 'paused' : 'active'],
      );
      if (paused) {
        out.paused++;
        await apiQuery('insert into api.alerts (kind, client_id, details) values ($1, $2, $3)', ['webhook_paused', w.client_id, JSON.stringify({ webhook_id: w.id, url: w.url, last_status: result.status, error: result.error ?? null })]);
        await notifyAdmin(`Webhook paused for client ${w.client_id}`, `Webhook ${w.id} (${w.url}) failed for 24 hours (last status ${result.status}${result.error ? `, ${result.error}` : ''}) and was paused.`);
      }
    }
  }
  return out;
}
