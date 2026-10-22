import type { Metadata } from 'next';
import { requireAdminSession } from '@/lib/api/admin-data';
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
  return <AdminShell email={session.email}>{children}</AdminShell>;
}
