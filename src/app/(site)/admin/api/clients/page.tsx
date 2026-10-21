import Link from 'next/link';
import { AdminShell } from '@/components/api/AdminShell';
import { Badge, Ltr } from '@/components/ui';
import { getClients, requireAdminSession } from '@/lib/api/admin-data';
import { formatDate } from '@/lib/format';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({ kind: 'internal', path: '/admin/api/clients', title: 'إدارة الـ API: العملاء', description: 'قائمة عملاء الـ API.' });
export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  const session = await requireAdminSession();
  const clients = await getClients();
  return (
    <AdminShell current="/admin/api/clients" title="العملاء" email={session.email}>
      <div className="mt-4 overflow-hidden rounded-card border border-border">
        <table className="w-full border-collapse text-start">
          <thead className="hidden bg-surface md:table-header-group">
            <tr className="type-small text-text-2">
              <th className="px-3 py-2 text-start font-medium">العميل</th>
              <th className="px-3 py-2 text-start font-medium">الخطة</th>
              <th className="px-3 py-2 text-start font-medium">الحالة</th>
              <th className="px-3 py-2 text-start font-medium">مدفوع حتى</th>
              <th className="px-3 py-2 text-start font-medium">مفاتيح</th>
              <th className="px-3 py-2 text-start font-medium">طلبات 30 يومًا</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-text-2">لا عملاء بعد.</td></tr>}
            {clients.map((c) => (
              <tr key={c.id} className="block border-t border-border p-3 md:table-row md:p-0">
                <td className="block py-0.5 md:table-cell md:px-3 md:py-2">
                  <Link prefetch={false} href={`/admin/api/clients/${c.id}`} className="font-medium text-primary underline">{c.company}</Link>
                  <span className="type-small block text-text-2">{c.contact_name} · <Ltr>{c.email}</Ltr></span>
                </td>
                <td className="block py-0.5 md:table-cell md:px-3 md:py-2">{c.plan_name}</td>
                <td className="block py-0.5 md:table-cell md:px-3 md:py-2"><Badge tone={c.status === 'active' ? 'down' : 'up'}>{c.status}</Badge></td>
                <td className="block py-0.5 text-text-2 md:table-cell md:px-3 md:py-2">{c.paid_until ? formatDate(c.paid_until) : '—'}</td>
                <td className="block py-0.5 md:table-cell md:px-3 md:py-2"><span className="price">{c.active_keys}</span></td>
                <td className="block py-0.5 md:table-cell md:px-3 md:py-2"><span className="price">{c.requests_30d.toLocaleString('en-US')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
