import { TermsPage } from '@/components/api/pages/TermsPage';
import { buildMetadata } from '@/lib/seo/metadata';

export const revalidate = 86400;

export const metadata = buildMetadata({
  kind: 'static',
  path: '/api/en/terms',
  title: 'Drug Prices API license terms',
  absoluteTitle: true,
  description: 'License terms of the Egyptian Drug Prices API: no resale, attribution, fair use, service level per plan, medical disclaimer and data accuracy.',
  languages: { ar: '/api/terms', en: '/api/en/terms' },
});

export default function Page() {
  return <TermsPage lang="en" />;
}
