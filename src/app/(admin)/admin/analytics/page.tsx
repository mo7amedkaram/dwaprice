import { AdminPage, LastChanged } from '@/components/admin/parts';
import { AnalyticsForm } from '@/components/admin/AnalyticsForm';
import { getSiteSettings } from '@/lib/settings/read';
import { groupRow } from '@/lib/settings/write';

export default async function AnalyticsPage() {
  const [settings, aMeta, vMeta] = await Promise.all([getSiteSettings(), groupRow('analytics'), groupRow('verification')]);
  return (
    <AdminPage title="التحليلات والتحقق" crumbs={[{ name: 'التحليلات والتحقق' }]} lead="عدّاد الزيارات (GA4) ورموز التحقق لمحركات البحث.">
      <AnalyticsForm analytics={settings.analytics} verification={settings.verification} />
      <div className="mx-auto max-w-3xl space-y-1">
        <LastChanged by={aMeta?.updated_by} at={aMeta?.updated_at} />
        <LastChanged by={vMeta?.updated_by} at={vMeta?.updated_at} />
      </div>
    </AdminPage>
  );
}
