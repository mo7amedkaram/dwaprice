import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import { PageHeader } from '@/components/listing/PageHeader';
import { HubIndexList } from '@/components/listing/HubIndexList';
import { getHubIndex } from '@/lib/data/listings';
import { compareNames, formatCount, indexLetter } from '@/lib/listing/logic';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const hubs = await getHubIndex('company');
  return buildMetadata({ kind: 'company', path: routes.companies(), ...pageText.companies(hubs.length) });
}

export default async function CompaniesIndexPage() {
  const hubs = await getHubIndex('company');
  // Company names exist in Latin only: grouped A-Z.
  const links = hubs
    .map((h) => ({ href: routes.company(h.slug), name: h.name_ar ?? h.name_en ?? h.slug, count: h.indexable_count }))
    .sort((a, b) => compareNames(a.name, b.name))
    .map((l) => ({ ...l, group: indexLetter(l.name) }));
  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'الشركات' }]}
        title="شركات الأدوية في مصر"
        lead={`${formatCount(hubs.length)} شركة أدوية ومستحضرات مرتبة أبجديًا، ولكل شركة صفحة بمنتجاتها وأسعارها.`}
      />
      <HubIndexList links={links} countLabel="منتج" />
    </Container>
  );
}
