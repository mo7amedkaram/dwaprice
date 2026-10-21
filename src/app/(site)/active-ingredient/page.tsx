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
  const hubs = await getHubIndex('ingredient');
  return buildMetadata({ kind: 'ingredient', path: routes.ingredients(), ...pageText.ingredients(hubs.length) });
}

export default async function IngredientsIndexPage() {
  const hubs = await getHubIndex('ingredient');
  const links = hubs
    .map((h) => ({ href: routes.ingredient(h.slug), name: h.name_ar ?? h.name_en ?? h.slug, nameEn: h.name_ar ? h.name_en : null, count: h.indexable_count }))
    .sort((a, b) => compareNames(a.name, b.name))
    .map((l) => ({ ...l, group: indexLetter(l.name) }));
  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'المواد الفعالة' }]}
        title="المواد الفعالة للأدوية في مصر"
        lead={`${formatCount(hubs.length)} مادة فعالة مرتبة أبجديًا. اختر المادة لترى كل الأدوية التي تحتويها وأسعارها، مقسمة حسب الشكل والتركيز.`}
      />
      <HubIndexList links={links} />
    </Container>
  );
}
