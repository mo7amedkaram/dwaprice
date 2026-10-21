import { TermsPage } from '@/components/api/pages/TermsPage';
import { buildMetadata } from '@/lib/seo/metadata';

export const revalidate = 86400;

export const metadata = buildMetadata({
  kind: 'static',
  path: '/api/terms',
  title: 'شروط ترخيص API أسعار الأدوية',
  description: 'شروط استخدام وترخيص بيانات API أسعار الأدوية في مصر: منع إعادة البيع، الإسناد، الاستخدام العادل، مستوى الخدمة لكل خطة، إخلاء المسؤولية الطبية، ودقة البيانات.',
  languages: { ar: '/api/terms', en: '/api/en/terms' },
});

export default function Page() {
  return <TermsPage lang="ar" />;
}
