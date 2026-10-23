import type { Metadata } from 'next';
import { requireAdminSession } from '@/lib/api/admin-data';
import { getFeedbackCounts } from '@/lib/feedback/admin';
import { AdminShell } from '@/components/admin/AdminShell';

// The site admin area. Its own chrome (sidebar), never the public Header/Footer. Server-side auth
// guard on the whole group: requireAdminSession() redirects to the login page when the session is
// missing or the admin account is disabled. Noindex (also blocked in robots.txt).
export const metadata: Metadata = {
  title: 'إدارة الموقع',
  robots: { index: false, follow: false },
};

// Admin pages read live settings/health; never statically prerender them.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();
  // Live (uncached) counts for the sidebar badges: two index-only count(*) per admin page view.
  const counts = await getFeedbackCounts();
  return (
    <AdminShell email={session.email} counts={counts}>
      {children}
    </AdminShell>
  );
}
