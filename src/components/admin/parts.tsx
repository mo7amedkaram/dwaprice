// Server-safe admin building blocks: page header with breadcrumbs, cards, field wrapper, and the
// "last changed by X at Y" line. Styling comes from the shared design tokens (dark-mode aware).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '../ui';
import { formatDate } from '@/lib/format';

export function AdminPage({ title, lead, crumbs, children }: { title: string; lead?: ReactNode; crumbs?: Array<{ name: string; href?: string }>; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="مسار التنقل" className="type-small mb-2 text-text-2">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/admin" className="hover:text-primary">الإدارة</Link></li>
            {crumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                <span aria-hidden>/</span>
                {c.href ? <Link href={c.href} className="hover:text-primary">{c.name}</Link> : <span className="text-ink">{c.name}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <h1 className="type-h1 text-ink">{title}</h1>
      {lead && <p className="mt-2 text-text-2">{lead}</p>}
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

export function Card({ title, description, children, className }: { title?: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-card border border-border bg-bg p-4 md:p-6', className)}>
      {title && <h2 className="type-h2 text-ink">{title}</h2>}
      {description && <p className="type-small mt-1 text-text-2">{description}</p>}
      <div className={cx(title && 'mt-4')}>{children}</div>
    </section>
  );
}

/** Dashboard stat tile; with `href` the whole tile is a link. */
export function Stat({ label, value, hint, tone = 'default', href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad'; href?: string }) {
  const toneCls = { default: 'text-ink', good: 'text-down', warn: 'text-rx', bad: 'text-up' }[tone];
  const body = (
    <>
      <div className="type-small text-text-2">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold', toneCls)}>{value}</div>
      {hint && <div className="type-small mt-1 text-muted">{hint}</div>}
    </>
  );
  const cls = 'block rounded-card border border-border bg-bg p-4';
  return href ? (
    <Link href={href} prefetch={false} className={cx(cls, 'transition-colors hover:border-primary')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export const fieldInput =
  'mt-1 w-full rounded-control border border-border bg-bg px-3 py-2 text-base text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary-tint placeholder:text-muted';

export function Field({ label, htmlFor, help, error, children, counter }: { label: string; htmlFor: string; help?: ReactNode; error?: string; children: ReactNode; counter?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="font-medium text-ink">{label}</label>
        {counter}
      </div>
      {help && <p className="type-small mt-0.5 text-text-2">{help}</p>}
      {children}
      {error && <p className="type-small mt-1 text-up" role="alert">{error}</p>}
    </div>
  );
}

/** "آخر تعديل بواسطة X في Y" line under a form. */
export function LastChanged({ by, at }: { by?: string | null; at?: string | Date | null }) {
  if (!at) return null;
  return (
    <p className="type-small text-muted">
      آخر تعديل{by ? <> بواسطة <span dir="ltr">{by}</span></> : null} في {formatDate(at) ?? String(at)}
    </p>
  );
}
