import { DocsPage } from '@/components/api/pages/DocsPage';
import { buildMetadata } from '@/lib/seo/metadata';

export const dynamic = 'force-static';

export const metadata = buildMetadata({
  kind: 'static',
  path: '/api/docs',
  title: 'توثيق API أسعار الأدوية (v1)',
  description: 'أدلة بالعربية ومرجع كامل لـ API أسعار الأدوية في مصر: المصادقة، الترقيم، الأخطاء، الحدود، دليل المزامنة الجزئية، وكل نقاط النهاية والهياكل من ملف OpenAPI 3.1.',
  languages: { ar: '/api/docs', en: '/api/en/docs' },
});

export default function Page() {
  return <DocsPage lang="ar" />;
}
