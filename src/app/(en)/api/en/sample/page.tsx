import { SamplePage } from '@/components/api/pages/SamplePage';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  kind: 'internal',
  path: '/api/en/sample',
  title: 'Try the Drug Prices API sample',
  absoluteTitle: true,
  description: 'Run real requests against a 50-drug sample without a key and copy the code in your language.',
  languages: { ar: '/api/sample', en: '/api/en/sample' },
});

export default function Page() {
  return <SamplePage lang="en" />;
}
