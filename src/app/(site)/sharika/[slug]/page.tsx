import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container, Ltr, Price } from '@/components/ui';
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
  const hub = await getHub('company', (await params).slug);
  if (!hub) return {};
  const { filtered, page } = hubListMeta(await searchParams);
  const path = routes.company(hub.slug);
  return buildMetadata({
    kind: 'company',
    path,
    ...pageText.company(hub.name_ar ?? hub.name_en ?? hub.slug, await listedCount('company', hub.key)),
    indexable: hub.indexable,
    page,
    filtered,
    canonicalPath: filtered ? path : undefined,
  });
}

export default async function CompanyPage({ params, searchParams }: Props) {
  const hub = await getHub('company', (await params).slug);
  if (!hub) notFound();
  const path = routes.company(hub.slug);
  const state = await hubListState('company', hub, path, await searchParams);
  // Company names exist in Latin only (no Arabic source).
  const name = hub.name_ar ?? hub.name_en ?? hub.slug;
  const nameNode = hub.name_ar ? name : <Ltr>{name}</Ltr>;

  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'الشركات', href: routes.companies() }, { name }]}
        title={<>أدوية ومنتجات شركة {nameNode}</>}
        lead={
          <>
            {formatCount(state.listed)} من أدوية ومنتجات شركة {nameNode} في مصر بأسعارها الحالية، مرتبة أبجديًا. يمكنك ترتيبها
            حسب السعر أو تصفيتها حسب الشكل الدوائي.
          </>
        }
      >
        <Facts
          items={[
            { label: 'عدد المنتجات', value: <span className="price">{formatCount(state.listed)}</span> },
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
      <HubList path={path} label={`منتجات شركة ${name}`} pageSize={HUB_PAGE_SIZE} showCompany={false} {...state} />
    </Container>
  );
}
