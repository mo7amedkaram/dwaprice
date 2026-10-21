import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container, Price } from '@/components/ui';
import { Facts, PageHeader } from '@/components/listing/PageHeader';
import { HubList } from '@/components/listing/HubList';
import { getHub } from '@/lib/data/listings';
import { HUB_PAGE_SIZE, hubListMeta, hubListState, listedCount } from '@/lib/listing/hub-page';
import { formatCount } from '@/lib/listing/logic';
import { formatDate } from '@/lib/format';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const hub = await getHub('category', (await params).slug);
  if (!hub) return {};
  const { filtered, page } = hubListMeta(await searchParams);
  const path = routes.category(hub.slug);
  return buildMetadata({
    kind: 'category',
    path,
    ...pageText.category(hub.name_ar ?? hub.name_en ?? hub.slug, await listedCount('category', hub.key)),
    indexable: hub.indexable,
    page,
    filtered,
    canonicalPath: filtered ? path : undefined,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const hub = await getHub('category', (await params).slug);
  if (!hub) notFound();
  const path = routes.category(hub.slug);
  const state = await hubListState('category', hub, path, await searchParams);
  const name = hub.name_ar ?? hub.name_en ?? hub.slug;

  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'التصنيفات', href: routes.categories() }, { name }]}
        title={`${name}: الأدوية وأسعارها`}
        lead={
          <>
            {formatCount(state.listed)} دواء من فئة {name} في مصر، مع السعر الحالي والشكل الدوائي والشركة. اختر الدواء لترى
            بدائله الأرخص ومادته الفعالة.
          </>
        }
      >
        <Facts
          items={[
            { label: 'عدد الأدوية', value: <span className="price">{formatCount(state.listed)}</span> },
            hub.min_price !== null && {
              label: 'الأسعار',
              value: (
                <>
                  من <Price value={hub.min_price} /> إلى <Price value={hub.max_price} />
                </>
              ),
            },
            hub.last_price_date && { label: 'آخر تحديث للأسعار', value: formatDate(hub.last_price_date) },
          ]}
        />
      </PageHeader>
      <HubList path={path} label={`أدوية ${name}`} pageSize={HUB_PAGE_SIZE} {...state} />
    </Container>
  );
}
