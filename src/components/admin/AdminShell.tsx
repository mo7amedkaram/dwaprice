'use client';

// Frame of the site admin area: a collapsible sidebar (a drawer on mobile), a top bar with the
// admin's name, a theme toggle and logout, and breadcrumbs. RTL, dark-mode aware (shared tokens),
// keyboard accessible. The server layout ((admin)/admin/layout.tsx) guards auth and passes the
// admin's email and the current path in.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '../ui';
import { ThemeToggle } from '../ThemeToggle';
import {
  ChartIcon,
  ImageIcon,
  MegaphoneIcon,
  SearchIcon,
  PhoneIcon,
  HistoryIcon,
  KeyIcon,
  MenuIcon,
  CloseIcon,
  CommentIcon,
  FlagIcon,
} from './icons';
import { adminLogoutAction } from '@/lib/api/admin-actions';

interface NavItem {
  href: string;
  label: string;
  icon: (p: { size?: number }) => React.ReactNode;
  /** The existing API admin lives outside this route group. */
  external?: boolean;
  /** Which live count shows as a badge next to the label. */
  badge?: keyof AdminCounts;
}

/** Live counts for the sidebar badges (read by the layout on every admin page, never cached). */
export interface AdminCounts {
  pendingComments: number;
  newReports: number;
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'لوحة التحكم', icon: ChartIcon },
  { href: '/admin/comments', label: 'التعليقات', icon: CommentIcon, badge: 'pendingComments' },
  { href: '/admin/reports', label: 'البلاغات', icon: FlagIcon, badge: 'newReports' },
  { href: '/admin/branding', label: 'الهوية البصرية', icon: ImageIcon },
  { href: '/admin/analytics', label: 'التحليلات والتحقق', icon: MegaphoneIcon },
  { href: '/admin/seo', label: 'تحسين الظهور (SEO)', icon: SearchIcon },
  { href: '/admin/contact', label: 'التواصل والروابط', icon: PhoneIcon },
  { href: '/admin/audit', label: 'سجل التغييرات', icon: HistoryIcon },
  { href: '/admin/api', label: 'إدارة الـ API', icon: KeyIcon, external: true },
];

export function AdminShell({ email, counts, children }: { email: string; counts?: AdminCounts; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // close the drawer on navigation (deferred, not a synchronous setState in the effect body)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));

  const sidebar = (
    <nav aria-label="أقسام الإدارة" className="flex h-full flex-col gap-1 p-3">
      <Link href="/admin" className="mb-2 flex items-center gap-2 px-2 py-2 text-ink">
        <span className="grid size-8 place-items-center rounded-control bg-primary text-on-primary">د</span>
        <span className="font-semibold">إدارة الموقع</span>
      </Link>
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active(item.href) ? 'page' : undefined}
            className={cx(
              'tap flex items-center gap-3 rounded-control px-3 py-2 font-medium transition-colors',
              active(item.href) ? 'bg-primary text-on-primary' : 'text-text-2 hover:bg-primary-tint hover:text-primary',
            )}
          >
            <Icon size={18} />
            <span className="flex-1">{item.label}</span>
            {item.badge && counts && counts[item.badge] > 0 && (
              <span
                className={cx('min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums', active(item.href) ? 'bg-on-primary/20 text-on-primary' : 'bg-up text-white')}
                aria-label={`${counts[item.badge]} ${item.badge === 'pendingComments' ? 'بانتظار المراجعة' : 'جديد'}`}
              >
                {counts[item.badge]}
              </span>
            )}
            {item.external && <span aria-hidden className="text-xs opacity-60">↗</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-surface">
      {/* desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-e border-border bg-bg md:block">
        <div className="sticky top-0 h-dvh overflow-y-auto">{sidebar}</div>
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="قائمة الإدارة">
          <button type="button" aria-label="إغلاق القائمة" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[85%] bg-bg shadow-xl">
            <div className="flex justify-end p-2">
              <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="tap grid size-10 place-items-center rounded-control text-text-2 hover:bg-surface">
                <CloseIcon size={20} />
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-bg/95 px-4 py-2 backdrop-blur">
          <button type="button" onClick={() => setOpen(true)} aria-label="فتح القائمة" className="tap grid size-10 place-items-center rounded-control text-text-2 hover:bg-surface md:hidden">
            <MenuIcon size={20} />
          </button>
          <span className="font-semibold text-ink md:hidden">إدارة الموقع</span>
          <div className="ms-auto flex items-center gap-2">
            <ThemeToggle variant="cycle" />
            <span className="type-small hidden text-text-2 sm:inline" dir="ltr" title={email}>
              {email}
            </span>
            <form action={adminLogoutAction}>
              <button type="submit" className="tap rounded-control border border-border px-3 py-1.5 text-sm font-medium text-text-2 hover:bg-surface hover:text-ink">
                خروج
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
