// Bearer-key authentication: key hash lookup (cached 60 s), key/client/plan checks,
// scopes and plan features. docs/API_SPEC.md §3.
import { apiQuery } from './db';
import { errors } from './errors';
import { bearerKey, hashKey } from './keys';
import { ipAllowed } from './net';

export interface PlanRow {
  id: string;
  name: string;
  rpm: number;
  monthly_quota: number | null;
  max_keys: number;
  feed_window_days: number;
  features: Record<string, unknown>;
}

export interface AuthContext {
  keyId: string;
  keyPrefix: string;
  clientId: string;
  scopes: string[];
  plan: PlanRow;
}

interface KeyRow {
  id: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  key_status: string;
  expires_at: string | Date | null;
  client_id: string;
  client_status: string;
  ip_allowlist: string[];
  paid_until: string | null;
  plan_id: string;
  plan_name: string;
  rpm: number;
  monthly_quota: string | number | null;
  max_keys: number;
  feed_window_days: number;
  features: Record<string, unknown>;
}

const TTL_MS = 60_000;
const cache = new Map<string, { row: KeyRow | null; exp: number }>();

async function lookup(hash: string): Promise<KeyRow | null> {
  const hit = cache.get(hash);
  if (hit && hit.exp > Date.now()) return hit.row;
  const rows = await apiQuery<KeyRow>(
    `select k.id, k.key_prefix, k.key_hash, k.scopes, k.status as key_status, k.expires_at,
            c.id as client_id, c.status as client_status, c.ip_allowlist::text[] as ip_allowlist, c.paid_until::text as paid_until,
            p.id as plan_id, p.name as plan_name, p.rpm, p.monthly_quota, p.max_keys, p.feed_window_days, p.features
     from api.api_keys k
     join api.clients c on c.id = k.client_id
     join api.plans p on p.id = c.plan_id
     where k.key_hash = $1`,
    [hash],
  );
  const row = rows[0] ?? null;
  if (cache.size > 5000) cache.clear();
  cache.set(hash, { row, exp: Date.now() + (row ? TTL_MS : 30_000) });
  return row;
}

/** Drops a cached key (after revoke/rotate from the same process). */
export function forgetKey(hash: string): void {
  cache.delete(hash);
}

export const GRACE_DAYS = 7;

export async function authenticate(headers: Headers, ip: string): Promise<AuthContext> {
  const key = bearerKey(headers.get('authorization'));
  if (!key) throw errors.unauthorized();
  const row = await lookup(hashKey(key));
  if (!row || row.key_status !== 'active') throw errors.unauthorized('Unknown or revoked API key');
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) throw errors.unauthorized('This API key has expired (rotated)');
  if (row.client_status !== 'active') throw errors.forbidden('This account is suspended', { reason: `client_${row.client_status}` });
  if (row.paid_until) {
    const grace = new Date(`${row.paid_until}T00:00:00Z`);
    grace.setUTCDate(grace.getUTCDate() + GRACE_DAYS);
    if (grace.getTime() < Date.now()) throw errors.forbidden('The subscription has expired', { reason: 'subscription_expired', paid_until: row.paid_until });
  }
  if (!ipAllowed(ip, row.ip_allowlist ?? [])) throw errors.ipNotAllowed();
  return {
    keyId: row.id,
    keyPrefix: row.key_prefix,
    clientId: row.client_id,
    scopes: row.scopes,
    plan: {
      id: row.plan_id,
      name: row.plan_name,
      rpm: Number(row.rpm),
      monthly_quota: row.monthly_quota === null ? null : Number(row.monthly_quota),
      max_keys: Number(row.max_keys),
      feed_window_days: Number(row.feed_window_days),
      features: row.features ?? {},
    },
  };
}

export function requireScope(auth: AuthContext, scope: string): void {
  if (!auth.scopes.includes(scope)) throw errors.forbidden(`This key does not have the ${scope} scope`, { required_scope: scope, plan: auth.plan.id });
}

export function requireFeature(auth: AuthContext, feature: 'export' | 'webhooks', label: string): void {
  if (auth.plan.features[feature] !== true) throw errors.forbidden(`${label} is available on the Enterprise plan`, { plan: auth.plan.id, required_scope: feature });
}

/** The sample plan's per-IP limits (api.plans.features of plan "sample"); cached. */
let samplePlan: { rpm: number; daily: number; exp: number } | null = null;
export async function sampleLimits(): Promise<{ rpm: number; daily: number }> {
  if (samplePlan && samplePlan.exp > Date.now()) return samplePlan;
  const rows = await apiQuery<{ features: Record<string, number> }>("select features from api.plans where id = 'sample'");
  const f = rows[0]?.features ?? {};
  samplePlan = { rpm: Number(f.ip_rpm) || 30, daily: Number(f.ip_daily) || 300, exp: Date.now() + TTL_MS };
  return samplePlan;
}
