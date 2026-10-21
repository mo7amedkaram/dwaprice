import Link from 'next/link';
import { AdminShell } from '@/components/api/AdminShell';
import { StatsStrip } from '@/components/api/Blocks';
import { field } from '@/components/api/form-styles';
import { Badge, Ltr, buttonClass, cx } from '@/components/ui';
import { approveRequestAction, rejectRequestAction } from '@/lib/api/admin-actions';
import { getAccessRequests, getAdminStats, getAllPlans, requireAdminSession } from '@/lib/api/admin-data';
import { formatDate } from '@/lib/format';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({ kind: 'internal', path: '/admin/api', title: 'إدارة الـ API: الطلبات', description: 'مراجعة طلبات الوصول.' });
export const dynamic = 'force-dynamic';

const STATUSES = [['new', 'جديدة'], ['approved', 'مقبولة'], ['rejected', 'مرفوضة'], ['all', 'الكل']] as const;
const VOLUME: Record<string, string> = { 'lt-10k': '< 10k/شهر', '10k-100k': '10k–100k', '100k-1m': '100k–1M', 'gt-1m': '> 1M' };

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireAdminSession();
  const sp = await searchParams;
  const status = (STATUSES.some(([s]) => s === sp.status) ? sp.status : 'new') as 'new' | 'approved' | 'rejected' | 'all';
  const [requests, plans, stats] = await Promise.all([getAccessRequests(status), getAllPlans(), getAdminStats()]);
  return (
    <AdminShell current="/admin/api" title="طلبات الوصول" email={session.email}>
      <StatsStrip className="mt-4" items={[
        { label: 'طلبات جديدة', value: stats.new_requests },
        { label: 'عملاء نشطون', value: stats.active_clients },
        { label: 'طلبات API اليوم', value: stats.requests_today.toLocaleString('en-US') },
        { label: 'تنبيهات (7 أيام)', value: stats.alerts_week, hint: stats.dataset_version ? <Ltr>{stats.dataset_version}</Ltr> : undefined },
      ]} />
      <nav aria-label="حالة الطلبات" className="mt-6 flex flex-wrap gap-2">
        {STATUSES.map(([s, label]) => (
          <Link key={s} prefetch={false} href={`/admin/api?status=${s}`} aria-current={s === status ? 'page' : undefined} className={cx('tap inline-flex items-center rounded-control border px-3 font-medium', s === status ? 'border-primary bg-primary text-on-primary' : 'border-border text-ink hover:border-primary hover:text-primary')}>{label}</Link>
        ))}
      </nav>
      {requests.length === 0 && <p className="mt-6 text-text-2">لا طلبات.</p>}
      <ul className="mt-4 space-y-4">
        {requests.map((r) => (
          <li key={r.id} className="rounded-card border border-border bg-bg p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">{r.company} <span className="font-normal text-text-2">— {r.name}</span></h2>
                <p className="type-small mt-1 text-text-2">
                  <Ltr>{r.email}</Ltr>{r.phone && <> · <Ltr>{r.phone}</Ltr> ({r.contact_pref === 'whatsapp' ? 'واتساب' : 'بريد'})</>} · {formatDate(r.created_at)} · الخطة المطلوبة <strong className="text-ink">{r.plan_id}</strong> · الحجم {VOLUME[r.expected_volume ?? ''] ?? r.expected_volume}
                </p>
              </div>
              <Badge tone={r.status === 'new' ? 'rx' : r.status === 'approved' ? 'down' : 'up'}>{r.status === 'new' ? 'جديد' : r.status === 'approved' ? 'مقبول' : 'مرفوض'}</Badge>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-text-2">{r.use_case}</p>
            {r.status === 'new' ? (
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <form action={approveRequestAction} className="grid grid-cols-2 gap-2 md:grid-cols-5 md:items-end">
                  <input type="hidden" name="request_id" value={r.id} />
                  <label className="type-small text-text-2">الخطة<select name="plan_id" defaultValue={r.plan_id ?? 'starter'} className={field}>{plans.filter((p) => p.id !== 'sample').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                  <label className="type-small text-text-2">مدفوع حتى<input type="date" name="paid_until" className={field} /></label>
                  <label className="type-small text-text-2">مرجع الدفع<input name="billing_reference" className={field} /></label>
                  <label className="type-small text-text-2">ملاحظة<input name="note" className={field} /></label>
                  <button type="submit" className={buttonClass('primary')}>قبول وإنشاء الحساب</button>
                </form>
                <form action={rejectRequestAction} className="flex items-end gap-2">
                  <input type="hidden" name="request_id" value={r.id} />
                  <label className="type-small text-text-2">سبب<input name="note" className={field} /></label>
                  <button type="submit" className={buttonClass('secondary')}>رفض</button>
                </form>
              </div>
            ) : (
              <p className="type-small mt-3 text-text-2">
                {r.reviewed_at && <>رُوجع {formatDate(r.reviewed_at)}. </>}{r.reviewer_note}{' '}
                {r.client_id && <Link prefetch={false} href={`/admin/api/clients/${r.client_id}`} className="text-primary underline">صفحة العميل</Link>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
