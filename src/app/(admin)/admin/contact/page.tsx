import { AdminPage, Card, LastChanged } from '@/components/admin/parts';
import { ContactForm } from '@/components/admin/ContactForm';
import { getSiteSettings } from '@/lib/settings/read';
import { groupRow } from '@/lib/settings/write';

export default async function ContactSettingsPage() {
  const [settings, meta] = await Promise.all([getSiteSettings(), groupRow('contact')]);
  return (
    <AdminPage title="التواصل والروابط" crumbs={[{ name: 'التواصل والروابط' }]} lead="البريد ورقم واتساب وروابط التواصل الاجتماعي المستخدمة في التذييل وصفحات التواصل.">
      <Card>
        <ContactForm initial={settings.contact} />
        <div className="mt-4">
          <LastChanged by={meta?.updated_by} at={meta?.updated_at} />
        </div>
      </Card>
    </AdminPage>
  );
}
