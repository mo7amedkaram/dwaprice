'use server';
// Server actions of the admin page: logins, access requests (approve / reject), clients
// (status, plan, billing, allowlist), keys (issue / revoke), plans.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { apiQuery } from './db';
import { issueKey, revokeKey } from './keys-admin';
import { loginAdmin } from './admin-auth';
import { clientIp, ipPrefix } from './net';
import { sendEmail } from './notify';
import { clearSession, getSession, setSession } from './session';
import { SITE } from '@/lib/site';
import type { KeyFormState } from './dashboard-actions';

const UUID = /^[0-9a-f-]{36}$/;

async function admin() {
  const s = await getSession('admin');
  if (!s) redirect('/admin/api/login');
  return s;
}

export interface AdminLoginState {
  error?: 'invalid' | 'locked' | 'limited';
  /** Echoed back so the field keeps its value after a failed attempt. */
  email?: string;
}

/** E-mail + password login (api.admin_users; scrypt, lockout after repeated failures, per-network limit). */
export async function adminLoginAction(_prev: AdminLoginState, form: FormData): Promise<AdminLoginState> {
  const h = await headers();
  const email = String(form.get('email') ?? '').slice(0, 200);
  const result = await loginAdmin(email, String(form.get('password') ?? ''), ipPrefix(clientIp(h)));
  if (!result.ok) return { error: result.reason, email };
  await setSession('admin', result.admin.id, result.admin.email);
  redirect('/admin/api');
}

export async function adminLogoutAction(): Promise<void> {
  await clearSession('admin');
  redirect('/admin/api/login');
}

/** Approve: create the client from the request, mark it, invite the applicant to the dashboard. */
export async function approveRequestAction(form: FormData): Promise<void> {
  await admin();
  const id = String(form.get('request_id') ?? '');
  const planId = String(form.get('plan_id') ?? '');
  if (!UUID.test(id)) return;
  const reqs = await apiQuery<{ id: string; name: string; company: string; email: string; phone: string | null; status: string }>('select id, name, company, email, phone, status from api.access_requests where id = $1', [id]);
  const r = reqs[0];
  if (!r || r.status !== 'new') return;
  const plans = await apiQuery<{ id: string }>('select id from api.plans where id = $1', [planId]);
  if (!plans[0]) return;
  const paidUntil = String(form.get('paid_until') ?? '').trim() || null;
  const created = await apiQuery<{ id: string }>(
    `insert into api.clients (company, contact_name, email, phone, plan_id, paid_until, billing_reference, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [r.company, r.name, r.email.toLowerCase(), r.phone, planId, paidUntil, String(form.get('billing_reference') ?? '').trim() || null, `approved from request ${r.id}`],
  );
  await apiQuery(`update api.access_requests set status = 'approved', client_id = $2, reviewed_at = now(), reviewer_note = $3 where id = $1`, [id, created[0].id, String(form.get('note') ?? '').trim() || null]);
  await sendEmail({
    to: r.email,
    subject: `تم تفعيل حسابك في ${SITE.name} API`,
    text: `مرحبًا ${r.name}،\n\nتم تفعيل حساب ${r.company} على خطة ${planId}. ادخل إلى لوحة المطورين بهذا البريد الإلكتروني لإنشاء مفتاح الـ API ومتابعة الاستخدام:\n${SITE.url}/developer/login\n\nالتوثيق: ${SITE.url}/api/docs\n`,
  });
  revalidatePath('/admin/api');
  redirect(`/admin/api/clients/${created[0].id}`);
}

export async function rejectRequestAction(form: FormData): Promise<void> {
  await admin();
  const id = String(form.get('request_id') ?? '');
  if (!UUID.test(id)) return;
  await apiQuery(`update api.access_requests set status = 'rejected', reviewed_at = now(), reviewer_note = $2 where id = $1 and status = 'new'`, [id, String(form.get('note') ?? '').trim() || null]);
  revalidatePath('/admin/api');
}

export async function setClientStatusAction(form: FormData): Promise<void> {
  await admin();
  const id = String(form.get('client_id') ?? '');
  const status = String(form.get('status') ?? '');
  if (!UUID.test(id) || !['active', 'suspended', 'closed'].includes(status)) return;
  await apiQuery('update api.clients set status = $2, updated_at = now() where id = $1', [id, status]);
  revalidatePath(`/admin/api/clients/${id}`);
  revalidatePath('/admin/api/clients');
}

export async function setClientPlanAction(form: FormData): Promise<void> {
  await admin();
  const id = String(form.get('client_id') ?? '');
  const planId = String(form.get('plan_id') ?? '');
  if (!UUID.test(id)) return;
  await apiQuery('update api.clients set plan_id = $2, updated_at = now() where id = $1 and exists (select 1 from api.plans where id = $2)', [id, planId]);
  revalidatePath(`/admin/api/clients/${id}`);
}

export async function setBillingAction(form: FormData): Promise<void> {
  await admin();
  const id = String(form.get('client_id') ?? '');
  if (!UUID.test(id)) return;
  const paidUntil = String(form.get('paid_until') ?? '').trim();
  await apiQuery('update api.clients set paid_until = $2, billing_reference = $3, notes = $4, updated_at = now() where id = $1', [
    id, /^\d{4}-\d{2}-\d{2}$/.test(paidUntil) ? paidUntil : null, String(form.get('billing_reference') ?? '').trim().slice(0, 200) || null, String(form.get('notes') ?? '').trim().slice(0, 2000) || null,
  ]);
  revalidatePath(`/admin/api/clients/${id}`);
}

export async function setAllowlistAction(form: FormData): Promise<void> {
  await admin();
  const id = String(form.get('client_id') ?? '');
  if (!UUID.test(id)) return;
  const list = String(form.get('ip_allowlist') ?? '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (list.some((c) => !/^[0-9a-fA-F.:]+(\/\d{1,3})?$/.test(c))) return;
  await apiQuery('update api.clients set ip_allowlist = $2::cidr[], updated_at = now() where id = $1', [id, list]);
  revalidatePath(`/admin/api/clients/${id}`);
}

export async function adminIssueKeyAction(_prev: KeyFormState, form: FormData): Promise<KeyFormState> {
  await admin();
  const id = String(form.get('client_id') ?? '');
  if (!UUID.test(id)) return { error: 'invalid client' };
  try {
    const issued = await issueKey(id, String(form.get('name') ?? 'default').trim() || 'default');
    revalidatePath(`/admin/api/clients/${id}`);
    return { key: issued.key, prefix: issued.row.key_prefix, name: issued.row.name };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function adminRevokeKeyAction(form: FormData): Promise<void> {
  await admin();
  const id = String(form.get('client_id') ?? '');
  const keyId = String(form.get('key_id') ?? '');
  if (UUID.test(id) && UUID.test(keyId)) await revokeKey(id, keyId);
  revalidatePath(`/admin/api/clients/${id}`);
}

export async function updatePlanAction(form: FormData): Promise<void> {
  await admin();
  const id = String(form.get('plan_id') ?? '');
  const num = (k: string, nullable = false) => {
    const v = String(form.get(k) ?? '').trim();
    if (v === '' && nullable) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  const rpm = num('rpm'), quota = num('monthly_quota', true), maxKeys = num('max_keys'), window = num('feed_window_days'), price = num('price_egp_monthly', true);
  if ([rpm, maxKeys, window].some((n) => Number.isNaN(n as number)) || Number.isNaN(quota as number) || Number.isNaN(price as number)) return;
  const current = await apiQuery<{ features: Record<string, unknown> }>('select features from api.plans where id = $1', [id]);
  if (!current[0]) return;
  const features = { ...current[0].features, export: form.get('export') === 'on', webhooks: form.get('webhooks') === 'on', ip_allowlist: form.get('ip_allowlist') === 'on', support: String(form.get('support') ?? '').trim().slice(0, 120) };
  await apiQuery(
    `update api.plans set rpm = $2, monthly_quota = $3, max_keys = $4, feed_window_days = $5, price_egp_monthly = $6, is_public = $7, features = $8, updated_at = now() where id = $1`,
    [id, rpm, quota, maxKeys, window, price, form.get('is_public') === 'on', JSON.stringify(features)],
  );
  revalidatePath('/admin/api/plans');
  revalidatePath('/api');
  revalidatePath('/api/en');
}
