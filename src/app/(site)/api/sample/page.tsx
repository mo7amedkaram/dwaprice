import { SamplePage } from '@/components/api/pages/SamplePage';
import { buildMetadata } from '@/lib/seo/metadata';

// Interactive tool: noindex (kind "internal"); the landing and docs pages carry the SEO.
export const metadata = buildMetadata({
  kind: 'internal',
  path: '/api/sample',
  title: 'جرّب عينة الـ API',
  description: 'نفّذ طلبات حقيقية على عينة من 50 دواءً بلا مفتاح، وانسخ الكود بلغتك.',
  languages: { ar: '/api/sample', en: '/api/en/sample' },
});

export default function Page() {
  return <SamplePage lang="ar" />;
}
