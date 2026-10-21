import 'server-only';
// Reads for the admin page (/admin/api). Server components only.
import { redirect } from 'next/navigation';
import { apiQuery } from './db';
import { getClient, getPlan, getUsage, type ClientRow, type PlanInfo, type UsageDay } from './dashboard-data';
import { listKeys, type KeyRow } from './keys-admin';
import { getAdmin } from './admin-auth';
import { getSession, type Session } from './session';

export async function requireAdminSession(): Promise<Session> {
  const s = await getSession('admin');
  const admin = s ? await getAdmin(s.id) : null;
  if (!s || !admin || admin.status !== 'active') redirect('/admin/api/login'); // disabled or deleted admins are out, cookie or not
  return s;
}

export interface AccessRequestRow {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  use_case: string | null;
  expected_volume: string | null;
  plan_id: string | null;
  contact_pref: string | null;
  status: string;
  client_id: string | null;
  created_at: Date;
  reviewed_at: Date | null;
  reviewer_note: string | null;
}

export async function getAccessRequests(status: 'new' | 'approved' | 'rejected' | 'all' = 'new'): Promise<AccessRequestRow[]> {
  return apiQuery<AccessRequestRow>(
    `select * from api.access_requests where ($1 = 'all' or status = $1) order by created_at desc limit 200`,
    [status],
  );
}

export interface ClientListRow extends ClientRow {
  plan_name: string;
  active_keys: number;
  requests_30d: number;
}

export async function getClients(): Promise<ClientListRow[]> {
  const rows = await apiQuery<ClientListRow & { active_keys: string; requests_30d: string }>(
    `select c.id, c.company, c.contact_name, c.email, c.phone, c.plan_id, c.status, c.paid_until::text as paid_until, c.billing_reference,
            c.ip_allowlist::text[] as ip_allowlist, c.created_at, c.last_login_at, p.name as plan_name,
            (select count(*) from api.api_keys k where k.client_id = c.id and k.status = 'active') as active_keys,
            (select coalesce(sum(u.requests), 0) from api.usage_daily u join api.api_keys k on k.id = u.key_id where k.client_id = c.id and u.day >= (now() at time zone 'utc')::date - 30) as requests_30d
     from api.clients c join api.plans p on p.id = c.plan_id
     order by c.created_at desc limit 500`,
  );
  return rows.map((r) => ({ ...r, active_keys: Number(r.active_keys), requests_30d: Number(r.requests_30d) }));
}

export interface ClientDetail {
  client: ClientRow;
  plan: PlanInfo;
  keys: KeyRow[];
  usageByDay: UsageDay[];
  monthRequests: number;
  topEndpoints: Array<{ endpoint: string; requests: number }>;
  alerts: Array<{ id: string; at: Date; kind: string; details: Record<string, unknown> }>;
  webhooks: number;
  exports: number;
}

export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(clientId)) return null;
  const client = await getClient(clientId);
  if (!client) return null;
  const [plan, keys, usage, alerts, counts] = await Promise.all([
    getPlan(client.plan_id),
    listKeys(clientId),
    getUsage(clientId),
    apiQuery<{ id: string; at: Date; kind: string; details: Record<string, unknown> }>('select id, at, kind, details from api.alerts where client_id = $1 order by at desc limit 20', [clientId]),
    apiQuery<{ webhooks: string; exports: string }>('select (select count(*) from api.webhooks where client_id = $1) as webhooks, (select count(*) from api.exports where client_id = $1) as exports', [clientId]),
  ]);
  if (!plan) return null;
  return { client, plan, keys, usageByDay: usage.byDay, monthRequests: usage.monthRequests, topEndpoints: usage.topEndpoints, alerts, webhooks: Number(counts[0].webhooks), exports: Number(counts[0].exports) };
}

export async function getAllPlans(): Promise<PlanInfo[]> {
  const rows = await apiQuery<PlanInfo>('select id, name, name_ar, rpm, monthly_quota, max_keys, feed_window_days, features, price_egp_monthly, is_public, sort from api.plans order by sort');
  return rows.map((p) => ({ ...p, rpm: Number(p.rpm), monthly_quota: p.monthly_quota === null ? null : Number(p.monthly_quota), max_keys: Number(p.max_keys), feed_window_days: Number(p.feed_window_days), price_egp_monthly: p.price_egp_monthly === null ? null : Number(p.price_egp_monthly) }));
}

export async function getAdminStats(): Promise<{ new_requests: number; active_clients: number; requests_today: number; alerts_week: number; dataset_version: string | null }> {
  const rows = await apiQuery<Record<string, string | null>>(
    `select (select count(*) from api.access_requests where status = 'new') as new_requests,
            (select count(*) from api.clients where status = 'active') as active_clients,
            (select coalesce(sum(requests), 0) from api.usage_daily where day = (now() at time zone 'utc')::date) as requests_today,
            (select count(*) from api.alerts where at > now() - interval '7 days') as alerts_week,
            (select version from api.dataset_versions order by id desc limit 1) as dataset_version`,
  );
  const r = rows[0] ?? {};
  return { new_requests: Number(r.new_requests ?? 0), active_clients: Number(r.active_clients ?? 0), requests_today: Number(r.requests_today ?? 0), alerts_week: Number(r.alerts_week ?? 0), dataset_version: r.dataset_version ?? null };
}
