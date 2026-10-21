import { ApiLanding } from '@/components/api/Landing';
import { getPublicPlans } from '@/lib/api/dashboard-data';
import { getDataset } from '@/lib/api/dataset';
import { apiPublicBase } from '@/lib/api/public-base';
import { buildMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

export const metadata = buildMetadata({
  kind: 'static',
  path: '/api',
  title: 'API أسعار الأدوية في مصر 2026 | بيانات محدثة للمطورين والشركات',
  absoluteTitle: true,
  description: 'واجهة برمجية لأسعار الأدوية في مصر: 14,700 دواء بأسعار محدثة بتاريخها، المواد الفعالة والشركات والفئات بمعرّفات موحدة، البدائل، الباركود، وتغذية تغييرات لأنظمة نقاط البيع. عينة مجانية بلا مفتاح.',
  languages: { ar: '/api', en: '/api/en' },
});

export default async function ApiLandingPage() {
  const [plans, dataset] = await Promise.all([getPublicPlans(), getDataset()]);
  return <ApiLanding lang="ar" plans={plans} dataset={dataset} publicBase={apiPublicBase()} />;
}
