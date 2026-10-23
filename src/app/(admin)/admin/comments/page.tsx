import Link from 'next/link';
import { AdminPage, Card, fieldInput } from '@/components/admin/parts';
import { Badge, cx } from '@/components/ui';
import { deleteCommentAction, moderateCommentsAction, replyToCommentAction } from '@/lib/feedback/admin-actions';
import { listComments, parseCommentFilter, type CommentFilter } from '@/lib/feedback/admin';
import { COMMENT_STATUSES, COMMENT_STATUS_LABEL, type CommentStatus } from '@/lib/feedback/logic';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/site';

// Moderation queue. Server-rendered; every button is a plain <form action> (works without JS).
// Row forms are independent; the bulk bar is one form whose checkboxes live in the rows through the
// `form` attribute (forms cannot nest). Filters are ?status= (pending first).
type Props = { searchParams: Promise<{ status?: string }> };

const TONE: Record<CommentStatus, 'rx' | 'down' | 'up' | 'muted'> = { PENDING: 'rx', APPROVED: 'down', REJECTED: 'up', SPAM: 'muted' };
const FILTERS: Array<{ value: CommentFilter; label: string }> = [
  { value: 'PENDING', label: COMMENT_STATUS_LABEL.PENDING },
  { value: 'APPROVED', label: COMMENT_STATUS_LABEL.APPROVED },
  { value: 'REJECTED', label: COMMENT_STATUS_LABEL.REJECTED },
  { value: 'SPAM', label: COMMENT_STATUS_LABEL.SPAM },
  { value: 'ALL', label: 'الكل' },
];
const btn = 'tap inline-flex min-h-9 items-center rounded-control border px-3 text-sm font-medium transition-colors';

export default async function AdminCommentsPage({ searchParams }: Props) {
  const filter = parseCommentFilter((await searchParams).status);
  const rows = await listComments(filter);
  return (
    <AdminPage title="التعليقات" crumbs={[{ name: 'التعليقات' }]} lead="تعليقات الزوار على صفحات الأدوية. لا يظهر أي تعليق على الموقع قبل اعتماده هنا. البريد وبصمة العنوان لا يُنشران أبدًا.">
      <nav aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === 'PENDING' ? '/admin/comments' : `/admin/comments?status=${f.value}`}
            prefetch={false}
            aria-current={f.value === filter ? 'page' : undefined}
            className={cx(btn, f.value === filter ? 'border-primary bg-primary text-on-primary' : 'border-border bg-bg text-text-2 hover:border-primary hover:text-primary')}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <Card>
        {rows.length === 0 ? (
          <p className="text-text-2">لا توجد تعليقات في هذه الحالة.</p>
        ) : (
          <>
            <form id="bulk" action={moderateCommentsAction} className="mb-4 flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface p-2">
              <span className="type-small me-auto text-text-2">المحدد:</span>
              <button type="submit" name="status" value="APPROVED" className={cx(btn, 'border-down/40 bg-down-bg text-ink hover:border-down')}>
                اعتماد المحدد
              </button>
              <button type="submit" name="status" value="REJECTED" className={cx(btn, 'border-up/40 bg-up-bg text-ink hover:border-up')}>
                رفض المحدد
              </button>
            </form>
            <ul className="space-y-4">
              {rows.map((c) => (
                <li key={c.id} className="rounded-card border border-border p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <input type="checkbox" form="bulk" name="ids" value={c.id} aria-label={`تحديد التعليق ${c.id}`} className="mt-1.5 size-5 accent-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Badge tone={TONE[c.status]}>{COMMENT_STATUS_LABEL[c.status]}</Badge>
                        <Link href={routes.drug(c.drug_slug)} prefetch={false} target="_blank" className="font-semibold text-primary hover:underline">
                          {c.drug_name ?? c.drug_slug} ↗
                        </Link>
                        <span className="type-small text-muted">{formatDate(c.created_at) ?? String(c.created_at)}</span>
                      </div>
                      <div className="type-small mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-2">
                        <span className="font-medium text-ink">{c.name}</span>
                        {c.is_pharmacist && <Badge tone="primary">صيدلي</Badge>}
                        {c.email && <span dir="ltr">{c.email}</span>}
                        <span dir="ltr" className="font-mono text-xs text-muted" title="بصمة عنوان الزائر (HMAC)">
                          ip:{c.ip_hash.slice(0, 12)}
                        </span>
                        <span className="text-xs text-muted">#{c.id}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-ink">{c.body}</p>
                      {c.admin_reply && (
                        <p className="mt-2 rounded-control border-s-4 border-primary bg-primary-tint/50 p-2 text-ink">
                          <span className="type-small block text-text-2">رد فريق الموقع</span>
                          <span className="whitespace-pre-line">{c.admin_reply}</span>
                        </p>
                      )}
                      {c.reviewed_at && (
                        <p className="type-small mt-1 text-muted">
                          رُوجع {formatDate(c.reviewed_at)} {c.reviewed_by ? <>بواسطة <span dir="ltr">{c.reviewed_by}</span></> : null}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(['APPROVED', 'REJECTED', 'SPAM'] as const).filter((s) => s !== c.status).map((s) => (
                          <form key={s} action={moderateCommentsAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="status" value={s} />
                            <button type="submit" className={cx(btn, s === 'APPROVED' ? 'border-down/40 bg-down-bg text-ink hover:border-down' : s === 'REJECTED' ? 'border-up/40 bg-up-bg text-ink hover:border-up' : 'border-border bg-bg text-text-2 hover:border-ink')}>
                              {s === 'APPROVED' ? 'اعتماد' : s === 'REJECTED' ? 'رفض' : 'مزعج'}
                            </button>
                          </form>
                        ))}
                        <form action={deleteCommentAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className={cx(btn, 'border-border bg-bg text-up hover:border-up')}>
                            حذف نهائي
                          </button>
                        </form>
                        <details className="w-full">
                          <summary className="tap inline-flex min-h-9 cursor-pointer items-center text-sm font-medium text-primary hover:underline">{c.admin_reply ? 'تعديل الرد الرسمي' : 'كتابة رد رسمي'}</summary>
                          <form action={replyToCommentAction} className="mt-2">
                            <input type="hidden" name="id" value={c.id} />
                            <label htmlFor={`reply-${c.id}`} className="type-small text-text-2">
                              يظهر تحت التعليق بشارة «فريق الموقع» (بعد اعتماد التعليق). اتركه فارغًا لحذف الرد.
                            </label>
                            <textarea id={`reply-${c.id}`} name="reply" rows={3} maxLength={2000} defaultValue={c.admin_reply ?? ''} className={fieldInput} />
                            <button type="submit" className={cx(btn, 'mt-2 border-primary bg-primary text-on-primary hover:bg-primary-hover')}>
                              حفظ الرد
                            </button>
                          </form>
                        </details>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="type-small text-muted">الحالات: {COMMENT_STATUSES.map((s) => COMMENT_STATUS_LABEL[s]).join(' · ')}. الحذف النهائي يحرّر أيضًا حصة المرسل في حدّ الإرسال.</p>
    </AdminPage>
  );
}
