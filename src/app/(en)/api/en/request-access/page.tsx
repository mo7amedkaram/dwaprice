import { RequestAccessPage } from '@/components/api/pages/RequestAccessPage';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  kind: 'static',
  path: '/api/en/request-access',
  title: 'Request access to the Egyptian Drug Prices API',
  absoluteTitle: true,
  description: 'Request an API key for drug prices in Egypt: pick a plan, describe your use, and get your developer-dashboard link within one business day.',
  languages: { ar: '/api/request-access', en: '/api/en/request-access' },
});

export default async function Page({ searchParams }: { searchParams: Promise<{ sent?: string; plan?: string }> }) {
  const sp = await searchParams;
  return <RequestAccessPage lang="en" sent={Boolean(sp.sent)} plan={sp.plan} />;
}
