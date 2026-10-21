import 'server-only';
// Reads for the developer dashboard (/developer). Server components only.
import { redirect } from 'next/navigation';
import { apiQuery } from './db';
import { listKeys, type KeyRow } from './keys-admin';
import { getSession, type Session } from './session';

export async function requireClientSession(): Promise<Session> {
  const s = await getSession('client');
  if (!s) redirect('/developer/login');
  return s;
}

export interface ClientRow {
  id: string;
  company: string;
  contact_name: string;
  email: string;
  phone: string | null;
  plan_id: string;
  status: string;
  paid_until: string | null;
  billing_reference: string | null;
  ip_allowlist: string[];
  created_at: Date;
  last_login_at: Date | null;
}

export interface PlanInfo {
  id: string;
  name: string;
  name_ar: string;
  rpm: number;
  monthly_quota: number | null;
  max_keys: number;
  feed_window_days: number;
  features: Record<string, unknown>;
  price_egp_monthly: number | null;
  is_public: boolean;
  sort: number;
}

export interface UsageDay {
  day: string;
  requests: number;
  errors: number;
}

export interface ClientOverview {
  client: ClientRow;
  plan: PlanInfo;
  keys: KeyRow[];
  usageByDay: UsageDay[];
  monthRequests: number;
  topEndpoints: Array<{ endpoint: string; requests: number }>;
  alerts: Array<{ at: Date; kind: string; details: Record<string, unknown> }>;
}

export async function getClient(clientId: string): Promise<ClientRow | null> {
  const rows = await apiQuery<ClientRow>(`select id, company, contact_name, email, phone, plan_id, status, paid_until::text as paid_until, billing_reference, ip_allowlist::text[] as ip_allowlist, created_at, last_login_at from api.clients where id = $1`, [clientId]);
  return rows[0] ?? null;
}

export async function getPlan(planId: string): Promise<PlanInfo | null> {
  const rows = await apiQuery<PlanInfo>('select id, name, name_ar, rpm, monthly_quota, max_keys, feed_window_days, features, price_egp_monthly, is_public, sort from api.plans where id = $1', [planId]);
  const p = rows[0];
  return p ? { ...p, rpm: Number(p.rpm), monthly_quota: p.monthly_quota === null ? null : Number(p.monthly_quota), max_keys: Number(p.max_keys), feed_window_days: Number(p.feed_window_days), price_egp_monthly: p.price_egp_monthly === null ? null : Number(p.price_egp_monthly) } : null;
}

export async function getUsage(clientId: string, days = 30): Promise<{ byDay: UsageDay[]; monthRequests: number; topEndpoints: Array<{ endpoint: string; requests: number }> }> {
  const [byDay, month, top] = await Promise.all([
    apiQuery<{ day: string; requests: string; errors: string }>(
      `select d::date::text as day, coalesce(sum(u.requests), 0) as requests, coalesce(sum(u.errors_4xx + u.errors_5xx), 0) as errors
       from generate_series((now() at time zone 'utc')::date - ($2::int - 1), (now() at time zone 'utc')::date, interval '1 day') d
       left join api.api_keys k on k.client_id = $1
       left join api.usage_daily u on u.key_id = k.id and u.day = d::date
       group by d order by d`,
      [clientId, days],
    ),
    apiQuery<{ n: string }>(
      `select coalesce(sum(u.requests), 0) as n from api.usage_daily u join api.api_keys k on k.id = u.key_id
       where k.client_id = $1 and u.day >= date_trunc('month', now() at time zone 'utc')::date`,
      [clientId],
    ),
    apiQuery<{ endpoint: string; requests: string }>(
      `select u.endpoint, sum(u.requests) as requests from api.usage_daily u join api.api_keys k on k.id = u.key_id
       where k.client_id = $1 and u.day >= (now() at time zone 'utc')::date - 30 group by u.endpoint order by 2 desc limit 8`,
      [clientId],
    ),
  ]);
  return {
    byDay: byDay.map((r) => ({ day: r.day, requests: Number(r.requests), errors: Number(r.errors) })),
    monthRequests: Number(month[0]?.n ?? 0),
    topEndpoints: top.map((r) => ({ endpoint: r.endpoint, requests: Number(r.requests) })),
  };
}

export async function getClientOverview(clientId: string): Promise<ClientOverview | null> {
  const client = await getClient(clientId);
  if (!client) return null;
  const [plan, keys, usage, alerts] = await Promise.all([
    getPlan(client.plan_id),
    listKeys(clientId),
    getUsage(clientId),
    apiQuery<{ at: Date; kind: string; details: Record<string, unknown> }>('select at, kind, details from api.alerts where client_id = $1 order by at desc limit 5', [clientId]),
  ]);
  if (!plan) return null;
  return { client, plan, keys, usageByDay: usage.byDay, monthRequests: usage.monthRequests, topEndpoints: usage.topEndpoints, alerts };
}

export async function getPublicPlans(): Promise<PlanInfo[]> {
  const rows = await apiQuery<PlanInfo>('select id, name, name_ar, rpm, monthly_quota, max_keys, feed_window_days, features, price_egp_monthly, is_public, sort from api.plans where is_public order by sort');
  return rows.map((p) => ({ ...p, rpm: Number(p.rpm), monthly_quota: p.monthly_quota === null ? null : Number(p.monthly_quota), max_keys: Number(p.max_keys), feed_window_days: Number(p.feed_window_days), price_egp_monthly: p.price_egp_monthly === null ? null : Number(p.price_egp_monthly) }));
}
