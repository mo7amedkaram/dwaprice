import { AdminPage, Card, LastChanged } from '@/components/admin/parts';
import { SeoForm } from '@/components/admin/SeoForm';
import { getSiteSettings } from '@/lib/settings/read';
import { groupRow } from '@/lib/settings/write';

export default async function SeoSettingsPage() {
  const [settings, meta] = await Promise.all([getSiteSettings(), groupRow('seo')]);
  return (
    <AdminPage title="تحسين الظهور (SEO)" crumbs={[{ name: 'تحسين الظهور (SEO)' }]} lead="عنوان الصفحة الرئيسية ووصفها ولاحقة العناوين ونص المشاركة. تظهر التغييرات على الموقع خلال ثوانٍ دون إعادة نشر.">
      <Card>
        <SeoForm initial={settings.seo} />
        <div className="mt-4">
          <LastChanged by={meta?.updated_by} at={meta?.updated_at} />
        </div>
      </Card>
    </AdminPage>
  );
}
