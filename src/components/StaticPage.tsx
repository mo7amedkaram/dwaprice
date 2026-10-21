import type { ReactNode } from 'react';
import Link from 'next/link';
import { Container } from './ui';
import { PageHeader } from './listing/PageHeader';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/site';

const RELATED = [
  { href: routes.about(), label: 'من نحن' },
  { href: routes.guide(), label: 'دليل الاستخدام' },
  { href: routes.contact(), label: 'اتصل بنا' },
  { href: routes.disclaimer(), label: 'إخلاء المسؤولية الطبية' },
  { href: routes.privacy(), label: 'سياسة الخصوصية' },
  { href: routes.terms(), label: 'شروط الاستخدام' },
];

/** Layout of the static pages: breadcrumbs, H1, lead, long text, last review date, sibling pages. */
export function StaticPage({ title, lead, updated, path, children }: { title: string; lead?: ReactNode; updated: string; path: string; children: ReactNode }) {
  return (
    <Container className="py-6 md:py-10">
      <PageHeader crumbs={[{ name: title }]} title={title} lead={lead} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <article className="prose-ar">
          {children}
          <p className="type-small mt-8 text-muted">
            آخر مراجعة لهذه الصفحة: <time dateTime={updated}>{formatDate(updated)}</time>
          </p>
        </article>
        <nav aria-label="صفحات عن الموقع" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="rounded-card border border-border p-2">
            {RELATED.map((r) => (
              <li key={r.href}>
                {r.href === path ? (
                  <span aria-current="page" className="tap flex items-center rounded-control bg-primary-tint px-3 font-medium text-primary">
                    {r.label}
                  </span>
                ) : (
                  <Link prefetch={false} href={r.href} className="tap flex items-center rounded-control px-3 text-text-2 hover:bg-surface hover:text-primary">
                    {r.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Container>
  );
}
