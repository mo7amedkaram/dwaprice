import Link from 'next/link';
import { AdminPage, Card, fieldInput } from '@/components/admin/parts';
import { Badge, Price, cx } from '@/components/ui';
import { noteReportAction, setReportStatusAction } from '@/lib/feedback/admin-actions';
import { listReports, parseReportFilter, parseReportType, type ReportFilter } from '@/lib/feedback/admin';
import { REPORT_STATUS_LABEL, REPORT_TYPES, REPORT_TYPE_LABEL, type ReportStatus, type ReportType } from '@/lib/feedback/logic';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/site';

// Problem reports from drug pages. Filters: ?status= and ?type=. Each row shows our current price
// next to the visitor's suggested one. There is no separate admin drug view, so the "fix the data"
// link is the public page plus the copyable drug_id / slug.
type Props = { searchParams: Promise<{ status?: string; type?: string }> };

const TONE: Record<ReportStatus, 'up' | 'rx' | 'down' | 'muted'> = { NEW: 'up', IN_REVIEW: 'rx', FIXED: 'down', REJECTED: 'muted' };
const STATUS_FILTERS: Array<{ value: ReportFilter; label: string }> = [
  { value: 'NEW', label: REPORT_STATUS_LABEL.NEW },
  { value: 'IN_REVIEW', label: REPORT_STATUS_LABEL.IN_REVIEW },
  { value: 'FIXED', label: REPORT_STATUS_LABEL.FIXED },
  { value: 'REJECTED', label: REPORT_STATUS_LABEL.REJECTED },
  { value: 'ALL', label: 'الكل' },
];
const btn = 'tap inline-flex min-h-9 items-center rounded-control border px-3 text-sm font-medium transition-colors';
const href = (status: ReportFilter, type: ReportType | 'ALL') => {
  const q = new URLSearchParams();
  if (status !== 'NEW') q.set('status', status);
  if (type !== 'ALL') q.set('type', type);
  const s = q.toString();
  return `/admin/reports${s ? `?${s}` : ''}`;
};

export default async function AdminReportsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const status = parseReportFilter(sp.status);
  const type = parseReportType(sp.type);
  const rows = await listReports(status, type);
  return (
    <AdminPage title="البلاغات" crumbs={[{ name: 'البلاغات' }]} lead="بلاغات الزوار عن أخطاء في السعر أو البيانات. بيانات التواصل لا تُنشر أبدًا.">
      <div className="space-y-2">
        <nav aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <Link key={f.value} href={href(f.value, type)} prefetch={false} aria-current={f.value === status ? 'page' : undefined} className={cx(btn, f.value === status ? 'border-primary bg-primary text-on-primary' : 'border-border bg-bg text-text-2 hover:border-primary hover:text-primary')}>
              {f.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="تصفية حسب النوع" className="flex flex-wrap gap-2">
          <Link href={href(status, 'ALL')} prefetch={false} aria-current={type === 'ALL' ? 'page' : undefined} className={cx(btn, type === 'ALL' ? 'border-ink bg-ink text-bg' : 'border-border bg-bg text-text-2 hover:border-ink')}>
            كل الأنواع
          </Link>
          {REPORT_TYPES.map((t) => (
            <Link key={t} href={href(status, t)} prefetch={false} aria-current={t === type ? 'page' : undefined} className={cx(btn, t === type ? 'border-ink bg-ink text-bg' : 'border-border bg-bg text-text-2 hover:border-ink')}>
              {REPORT_TYPE_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      <Card>
        {rows.length === 0 ? (
          <p className="text-text-2">لا توجد بلاغات مطابقة.</p>
        ) : (
          <ul className="space-y-4">
            {rows.map((r) => (
              <li key={r.id} className="rounded-card border border-border p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge tone={TONE[r.status]}>{REPORT_STATUS_LABEL[r.status]}</Badge>
                  <Badge tone="neutral">{REPORT_TYPE_LABEL[r.type]}</Badge>
                  <Link href={routes.drug(r.drug_slug)} prefetch={false} target="_blank" className="font-semibold text-primary hover:underline">
                    {r.drug_name ?? r.drug_slug} ↗
                  </Link>
                  <span className="type-small text-muted">{formatDate(r.created_at) ?? String(r.created_at)}</span>
                  <span className="type-small text-muted">#{r.id}</span>
                </div>

                <dl className="type-small mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <div>
                    <dt className="text-text-2">السعر عندنا</dt>
                    <dd className="font-medium text-ink">
                      <Price value={r.current_price} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-2">السعر المقترح</dt>
                    <dd className={cx('font-medium', r.suggested_price ? 'text-rx' : 'text-muted')}>{r.suggested_price ? <Price value={r.suggested_price} /> : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-text-2">التواصل</dt>
                    <dd className="font-medium text-ink" dir="ltr">
                      {r.contact ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-2">بصمة العنوان</dt>
                    <dd className="font-mono text-xs text-muted" dir="ltr">
                      {r.ip_hash.slice(0, 12)}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 whitespace-pre-line text-ink">{r.details}</p>

                <div className="type-small mt-3 space-y-1 text-text-2" dir="ltr">
                  {r.page_url && (
                    <p className="truncate">
                      page: <a href={r.page_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{r.page_url}</a>
                    </p>
                  )}
                  {r.referrer && <p className="truncate">referrer: {r.referrer}</p>}
                  <p className="truncate font-mono text-xs">
                    drug_id: <span className="select-all">{r.drug_id}</span> · slug: <span className="select-all">{r.drug_slug}</span>
                  </p>
                </div>

                {r.admin_note && (
                  <p className="mt-2 rounded-control border-s-4 border-rx bg-rx-bg/40 p-2 text-ink">
                    <span className="type-small block text-text-2">ملاحظة الإدارة</span>
                    <span className="whitespace-pre-line">{r.admin_note}</span>
                  </p>
                )}
                {r.reviewed_at && (
                  <p className="type-small mt-1 text-muted">
                    رُوجع {formatDate(r.reviewed_at)} {r.reviewed_by ? <>بواسطة <span dir="ltr">{r.reviewed_by}</span></> : null}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {(['IN_REVIEW', 'FIXED', 'REJECTED'] as const).filter((s) => s !== r.status).map((s) => (
                    <form key={s} action={setReportStatusAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={s} />
                      <button type="submit" className={cx(btn, s === 'FIXED' ? 'border-down/40 bg-down-bg text-ink hover:border-down' : s === 'REJECTED' ? 'border-up/40 bg-up-bg text-ink hover:border-up' : 'border-rx/40 bg-rx-bg text-ink hover:border-rx')}>
                        {s === 'IN_REVIEW' ? 'قيد المراجعة' : s === 'FIXED' ? 'تم التصحيح' : 'رفض'}
                      </button>
                    </form>
                  ))}
                  <details className="w-full">
                    <summary className="tap inline-flex min-h-9 cursor-pointer items-center text-sm font-medium text-primary hover:underline">{r.admin_note ? 'تعديل ملاحظة الإدارة' : 'إضافة ملاحظة'}</summary>
                    <form action={noteReportAction} className="mt-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label htmlFor={`note-${r.id}`} className="type-small text-text-2">
                        ملاحظة داخلية (لا تُنشر).
                      </label>
                      <textarea id={`note-${r.id}`} name="note" rows={2} maxLength={2000} defaultValue={r.admin_note ?? ''} className={fieldInput} />
                      <button type="submit" className={cx(btn, 'mt-2 border-primary bg-primary text-on-primary hover:bg-primary-hover')}>
                        حفظ الملاحظة
                      </button>
                    </form>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AdminPage>
  );
}
