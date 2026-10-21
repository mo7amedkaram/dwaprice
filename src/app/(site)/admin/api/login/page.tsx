import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/api/AdminLoginForm';
import { Container } from '@/components/ui';
import { adminLoginAction } from '@/lib/api/admin-actions';
import { getSession } from '@/lib/api/session';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({ kind: 'internal', path: '/admin/api/login', title: 'دخول إدارة الـ API', description: 'لوحة إدارة واجهة الـ API.' });
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  if (await getSession('admin')) redirect('/admin/api');
  return (
    <Container className="py-10 md:py-16">
      <div className="mx-auto max-w-md rounded-card border border-border bg-bg p-6">
        <h1 className="type-h1 text-ink">إدارة الـ API</h1>
        <p className="mt-2 text-text-2">للمشرفين فقط. الحسابات تُنشأ من سطر الأوامر، وتُوقف مؤقتًا بعد 8 محاولات فاشلة.</p>
        <div className="mt-5">
          <AdminLoginForm action={adminLoginAction} />
        </div>
      </div>
    </Container>
  );
}
