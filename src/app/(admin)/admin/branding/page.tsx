import { AdminPage, Card } from '@/components/admin/parts';
import { BrandingForm } from '@/components/admin/BrandingForm';
import { hasCustomIcon } from '@/lib/settings/write';

export default async function BrandingPage() {
  const hasCustom = await hasCustomIcon().catch(() => false);
  return (
    <AdminPage title="الهوية البصرية" crumbs={[{ name: 'الهوية البصرية' }]} lead="أيقونة الموقع (favicon) التي تظهر في تبويب المتصفح ونتائج البحث وشاشة الهاتف. تظهر التغييرات خلال دقائق.">
      <Card title="أيقونة الموقع">
        <BrandingForm hasCustom={hasCustom} />
      </Card>
    </AdminPage>
  );
}
