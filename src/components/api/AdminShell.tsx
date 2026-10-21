import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container, buttonClass, cx } from '../ui';
import { adminLogoutAction } from '@/lib/api/admin-actions';

const LINKS = [
  { href: '/admin/api', label: 'الطلبات' },
  { href: '/admin/api/clients', label: 'العملاء' },
  { href: '/admin/api/plans', label: 'الخطط' },
];

/** Frame of the admin pages: section nav + logout. */
export function AdminShell({ current, title, email, children }: { current: string; title: string; email: string; children: ReactNode }) {
  return (
    <>
      <div className="border-b border-border bg-surface">
        <Container className="flex flex-wrap items-center gap-2 py-1">
          <span className="type-small me-2 font-semibold text-ink">إدارة الـ API</span>
          {LINKS.map((l) => (
            <Link key={l.href} prefetch={false} href={l.href} aria-current={l.href === current ? 'page' : undefined} className={cx('tap inline-flex items-center rounded-control px-3 font-medium', l.href === current ? 'bg-primary text-on-primary' : 'text-text-2 hover:bg-primary-tint hover:text-primary')}>
              {l.label}
            </Link>
          ))}
          <span className="type-small ms-auto text-text-2" dir="ltr">{email}</span>
          <form action={adminLogoutAction}><button type="submit" className={buttonClass('ghost')}>خروج</button></form>
        </Container>
      </div>
      <Container className="py-6 md:py-8">
        <h1 className="type-h1 text-ink">{title}</h1>
        {children}
      </Container>
    </>
  );
}
