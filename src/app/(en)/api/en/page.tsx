import { ApiLanding } from '@/components/api/Landing';
import { getPublicPlans } from '@/lib/api/dashboard-data';
import { getDataset } from '@/lib/api/dataset';
import { apiPublicBase } from '@/lib/api/public-base';
import { buildMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

export const metadata = buildMetadata({
  kind: 'static',
  path: '/api/en',
  title: 'Egyptian Drug Prices API 2026 | Updated data for developers and businesses',
  absoluteTitle: true,
  description: 'JSON API for drug prices in Egypt: 14,700 products with dated, up-to-date prices, normalised ingredients, companies and categories, alternatives, barcodes and a delta feed for POS/ERP sync. Free sample, no key needed.',
  languages: { ar: '/api', en: '/api/en' },
});

export default async function ApiLandingEnPage() {
  const [plans, dataset] = await Promise.all([getPublicPlans(), getDataset()]);
  return <ApiLanding lang="en" plans={plans} dataset={dataset} publicBase={apiPublicBase()} />;
}
