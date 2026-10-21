import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/api/AdminShell';
import { StatsStrip, UsageChart } from '@/components/api/Blocks';
import { Code } from '@/components/api/CodeBlock';
import { KeyCreateForm, RevokeKeyForm } from '@/components/api/Forms';
import { field } from '@/components/api/form-styles';
import { Badge, Ltr, SectionTitle, buttonClass } from '@/components/ui';
import { adminIssueKeyAction, adminRevokeKeyAction, setAllowlistAction, setBillingAction, setClientPlanAction, setClientStatusAction } from '@/lib/api/admin-actions';
import { getAllPlans, getClientDetail, requireAdminSession } from '@/lib/api/admin-data';
import { formatDate } from '@/lib/format';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({ kind: 'internal', path: '/admin/api/clients', title: 'إدارة الـ API: عميل', description: 'تفاصيل عميل.' });
export const dynamic = 'force-dynamic';

const n = (v: number | string) => Number(v).toLocaleString('en-US');

export default async function AdminClientPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  const { id } = await params;
  const [d, plans] = await Promise.all([getClientDetail(id), getAllPlans()]);
  if (!d) notFound();
  const c = d.client;
  const activeKeys = d.keys.filter((k) => k.status === 'active').length;
  return (
    <AdminShell current="/admin/api/clients" title={c.company} email={session.email}>
      <p className="mt-1 text-text-2">
        {c.contact_name} · <Ltr>{c.email}</Ltr>{c.phone && <> · <Ltr>{c.phone}</Ltr></>} · منذ {formatDate(c.created_at)} · آخر دخول {c.last_login_at ? formatDate(c.last_login_at) : '—'}{' '}
        <Badge tone={c.status === 'active' ? 'down' : 'up'}>{c.status}</Badge>
      </p>
      <StatsStrip className="mt-4" items={[
        { label: 'طلبات هذا الشهر', value: n(d.monthRequests), hint: d.plan.monthly_quota ? `من ${n(d.plan.monthly_quota)}` : 'بلا حصة' },
        { label: 'مفاتيح نشطة', value: `${activeKeys} / ${d.plan.max_keys}` },
        { label: 'Webhooks / تصديرات', value: `${d.webhooks} / ${d.exports}` },
        { label: 'تنبيهات', value: d.alerts.length },
      ]} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-border p-4">
          <h2 className="font-semibold text-ink">الحالة والخطة</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['active', 'suspended', 'closed'] as const).filter((s) => s !== c.status).map((s) => (
              <form key={s} action={setClientStatusAction}>
                <input type="hidden" name="client_id" value={c.id} />
                <input type="hidden" name="status" value={s} />
                <button type="submit" className={buttonClass(s === 'active' ? 'primary' : 'secondary')}>{s === 'active' ? 'تفعيل' : s === 'suspended' ? 'إيقاف' : 'إغلاق'}</button>
              </form>
            ))}
          </div>
          <form action={setClientPlanAction} className="mt-4 flex items-end gap-2">
            <input type="hidden" name="client_id" value={c.id} />
            <label className="type-small flex-1 text-text-2">الخطة<select name="plan_id" defaultValue={c.plan_id} className={field}>{plans.filter((p) => p.id !== 'sample').map((p) => <option key={p.id} value={p.id}>{p.name} — {p.rpm}/min, {p.monthly_quota ?? '∞'}/mo</option>)}</select></label>
            <button type="submit" className={buttonClass('secondary')}>حفظ</button>
          </form>
        </section>

        <section className="rounded-card border border-border p-4">
          <h2 className="font-semibold text-ink">الفوترة (يدوية)</h2>
          <form action={setBillingAction} className="mt-3 grid gap-2 md:grid-cols-2">
            <input type="hidden" name="client_id" value={c.id} />
            <label className="type-small text-text-2">مدفوع حتى<input type="date" name="paid_until" defaultValue={c.paid_until ?? ''} className={field} /></label>
            <label className="type-small text-text-2">مرجع الفاتورة / الدفع<input name="billing_reference" defaultValue={c.billing_reference ?? ''} className={field} /></label>
            <label className="type-small text-text-2 md:col-span-2">ملاحظات<textarea name="notes" rows={2} className={field} /></label>
            <div className="md:col-span-2"><button type="submit" className={buttonClass('secondary')}>حفظ الفوترة</button></div>
          </form>
          <p className="type-small mt-2 text-text-2">بعد تاريخ «مدفوع حتى» بسبعة أيام تتوقف المفاتيح (403 subscription_expired) حتى يُسجَّل دفع جديد.</p>
        </section>

        <section className="rounded-card border border-border p-4 lg:col-span-2">
          <h2 className="font-semibold text-ink">المفاتيح</h2>
          <ul className="mt-3 divide-y divide-border">
            {d.keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-medium text-ink">{k.name}</span>
                <Code>{k.key_prefix}…</Code>
                <span dir="ltr" className="type-small font-mono text-text-2">{k.scopes.join(', ')}</span>
                <Badge tone={k.status === 'active' ? 'down' : 'up'}>{k.status}</Badge>
                <span className="type-small text-text-2">أُنشئ {formatDate(k.created_at)}{k.last_used_at && <> · آخر استخدام {formatDate(k.last_used_at)}</>}{k.expires_at && <> · ينتهي {formatDate(k.expires_at)}</>}</span>
                {k.status === 'active' && <div className="ms-auto"><RevokeKeyForm action={adminRevokeKeyAction} hidden={{ client_id: c.id, key_id: k.id }} /></div>}
              </li>
            ))}
            {d.keys.length === 0 && <li className="py-2 text-text-2">لا مفاتيح.</li>}
          </ul>
          <div className="mt-3 rounded-card bg-surface p-3">
            <KeyCreateForm action={adminIssueKeyAction} hidden={{ client_id: c.id }} disabled={activeKeys >= d.plan.max_keys || c.status !== 'active'} />
          </div>
        </section>

        <section className="rounded-card border border-border p-4">
          <h2 className="font-semibold text-ink">قائمة IP المسموحة (Enterprise)</h2>
          <form action={setAllowlistAction} className="mt-3">
            <input type="hidden" name="client_id" value={c.id} />
            <label className="type-small text-text-2">CIDR مفصولة بفواصل<input name="ip_allowlist" defaultValue={c.ip_allowlist.join(', ')} dir="ltr" placeholder="203.0.113.0/24, 198.51.100.7" className={field} /></label>
            <button type="submit" className={buttonClass('secondary', 'mt-2')}>حفظ</button>
          </form>
        </section>

        <section className="rounded-card border border-border p-4">
          <h2 className="font-semibold text-ink">تنبيهات</h2>
          <ul className="type-small mt-2 space-y-1 text-text-2">
            {d.alerts.length === 0 && <li>لا تنبيهات.</li>}
            {d.alerts.map((a) => <li key={a.id}>{formatDate(a.at)} · <Ltr>{a.kind}</Ltr> · <Ltr>{JSON.stringify(a.details)}</Ltr></li>)}
          </ul>
        </section>
      </div>

      <section className="mt-8">
        <SectionTitle>الاستخدام في آخر 30 يومًا</SectionTitle>
        <UsageChart days={d.usageByDay} />
        {d.topEndpoints.length > 0 && (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {d.topEndpoints.map((e) => <li key={e.endpoint} className="flex justify-between rounded-control border border-border px-3 py-2"><Code>{e.endpoint}</Code><span className="price">{n(e.requests)}</span></li>)}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
