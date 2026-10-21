import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui';
import { PageHeader } from '@/components/listing/PageHeader';
import { HubIndexList } from '@/components/listing/HubIndexList';
import { getHubIndex } from '@/lib/data/listings';
import { compareNames, formatCount, indexLetter } from '@/lib/listing/logic';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const hubs = await getHubIndex('category');
  return buildMetadata({ kind: 'category', path: routes.categories(), ...pageText.categories(hubs.length) });
}

export default async function CategoriesIndexPage() {
  const hubs = await getHubIndex('category');
  const largest = hubs.slice(0, 12);
  const links = hubs
    .map((h) => ({ href: routes.category(h.slug), name: h.name_ar ?? h.name_en ?? h.slug, nameEn: h.name_ar ? h.name_en : null, count: h.indexable_count }))
    .sort((a, b) => compareNames(a.name, b.name))
    .map((l) => ({ ...l, group: indexLetter(l.name) }));
  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'التصنيفات' }]}
        title="تصنيفات الأدوية في مصر"
        lead={`${formatCount(hubs.length)} فئة علاجية. اختر الفئة لترى أدويتها وأسعارها، مع إمكانية التصفية حسب الشكل الدوائي والسعر.`}
      />
      <section aria-labelledby="largest" className="mb-10">
        <h2 id="largest" className="type-h2 mb-3 text-ink">
          أكبر التصنيفات
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {largest.map((h) => (
            <li key={h.slug}>
              <Link
                prefetch={false}
                href={routes.category(h.slug)}
                className="flex min-h-16 flex-col justify-center rounded-card border border-border bg-bg px-4 py-3 transition-colors hover:border-primary hover:bg-primary-tint"
              >
                <span className="font-semibold text-ink">{h.name_ar ?? h.name_en}</span>
                <span className="type-small text-text-2">
                  <span className="price">{formatCount(h.indexable_count)}</span> دواء
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <HubIndexList links={links} />
    </Container>
  );
}
