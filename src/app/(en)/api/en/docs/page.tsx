import { DocsPage } from '@/components/api/pages/DocsPage';
import { buildMetadata } from '@/lib/seo/metadata';

export const dynamic = 'force-static';

export const metadata = buildMetadata({
  kind: 'static',
  path: '/api/en/docs',
  title: 'Drug Prices API documentation (v1)',
  absoluteTitle: true,
  description: 'Reference and guides for the Egyptian Drug Prices API: authentication, pagination, errors, rate limits, the delta-sync loop, every endpoint and schema, generated from the OpenAPI 3.1 description.',
  languages: { ar: '/api/docs', en: '/api/en/docs' },
});

export default function Page() {
  return <DocsPage lang="en" />;
}
