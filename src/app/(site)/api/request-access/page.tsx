import { RequestAccessPage } from '@/components/api/pages/RequestAccessPage';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  kind: 'static',
  path: '/api/request-access',
  title: 'طلب الوصول إلى API أسعار الأدوية',
  description: 'اطلب مفتاح API لأسعار الأدوية في مصر: اختر الخطة، صف استخدامك، ونرد خلال يوم عمل برابط لوحة المطورين.',
  languages: { ar: '/api/request-access', en: '/api/en/request-access' },
});

export default async function Page({ searchParams }: { searchParams: Promise<{ sent?: string; plan?: string }> }) {
  const sp = await searchParams;
  return <RequestAccessPage lang="ar" sent={Boolean(sp.sent)} plan={sp.plan} />;
}
