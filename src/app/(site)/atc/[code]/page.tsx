import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Container, Ltr, Price } from '@/components/ui';
import { Facts, PageHeader } from '@/components/listing/PageHeader';
import { HubList } from '@/components/listing/HubList';
import { getAtcChildren, getHub } from '@/lib/data/listings';
import { HUB_PAGE_SIZE, hubListMeta, hubListState, listedCount } from '@/lib/listing/hub-page';
import { formatCount, parseAtcParam } from '@/lib/listing/logic';
import { formatDate } from '@/lib/format';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { atcName, routes } from '@/lib/site';
import type { HubRow } from '@/lib/data/types';
import type { Crumb } from '@/lib/seo/jsonld';

export const revalidate = 86400;

type Props = { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(param: string): Promise<HubRow | null> {
  const parsed = parseAtcParam(param);
  return parsed ? getHub('atc', parsed.code.toLowerCase()) : null;
}

const arName = (hub: HubRow) => (atcName(hub.name_en) ? hub.name_ar : null);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const hub = await load((await params).code);
  if (!hub) return {};
  const { filtered, page } = hubListMeta(await searchParams);
  const path = routes.atc(hub.key, hub.name_en);
  const name = arName(hub) ?? `تصنيف ${hub.key}`;
  return buildMetadata({
    kind: 'atc',
    path,
    ...pageText.atc(name, hub.key, await listedCount('atc', hub.key)),
    indexable: hub.indexable,
    page,
    filtered,
    canonicalPath: filtered ? path : undefined,
  });
}

/** Parent codes of an ATC code: J01CR02 -> J, J01, J01C, J01CR. */
function ancestors(code: string): string[] {
  return [1, 3, 4, 5].filter((n) => n < code.length).map((n) => code.slice(0, n));
}

export default async function AtcPage({ params, searchParams }: Props) {
  const param = (await params).code;
  const hub = await load(param);
  if (!hub) notFound();
  // One URL per class: wrong or missing name suffix -> the canonical one.
  const path = routes.atc(hub.key, hub.name_en);
  if (`/atc/${decodeURIComponent(param)}` !== path) permanentRedirect(path);

  const [state, children, parents] = await Promise.all([
    hubListState('atc', hub, path, await searchParams),
    getAtcChildren(hub.key),
    Promise.all(ancestors(hub.key).map((c) => getHub('atc', c.toLowerCase()))),
  ]);
  const name = arName(hub);
  const title = name ?? `تصنيف ATC ${hub.key}`;
  const crumbs: Crumb[] = [
    { name: 'تصنيف ATC', href: routes.atcIndex() },
    ...parents.filter((p): p is HubRow => p !== null).map((p) => ({ name: arName(p) ?? p.key, href: routes.atc(p.key, p.name_en) })),
    { name: name ?? hub.key },
  ];

  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={crumbs}
        title={
          <>
            {title} <Ltr className="text-text-2">({hub.key})</Ltr>
          </>
        }
        lead={
          <>
            {formatCount(state.listed)} دواء في مصر مصنف تحت{' '}
            {name ? `«${name}»` : `الرمز ${hub.key}`} في التصنيف التشريحي العلاجي الكيميائي (ATC) لمنظمة الصحة العالمية
            {atcName(hub.name_en) && (
              <>
                {' '}
                (<Ltr>{hub.name_en}</Ltr>)
              </>
            )}
            .
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

      {children.length > 0 && (
        <section aria-labelledby="sub-classes" className="mb-8">
          <h2 id="sub-classes" className="type-h2 mb-3 text-ink">
            التصنيفات الفرعية
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((c) => (
              <li key={c.key}>
                <Link
                  prefetch={false}
                  href={routes.atc(c.key, c.name_en)}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-border px-3 py-2 hover:border-primary hover:text-primary"
                >
                  <span className="min-w-0 truncate">
                    <Ltr className="font-semibold">{c.key}</Ltr> {arName(c) && <span className="text-text-2">{arName(c)}</span>}
                  </span>
                  <span className="type-small shrink-0 text-muted">
                    <span className="price">{formatCount(c.indexable_count)}</span> دواء
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <HubList path={path} label={`أدوية ${title}`} pageSize={HUB_PAGE_SIZE} {...state} />
    </Container>
  );
}
