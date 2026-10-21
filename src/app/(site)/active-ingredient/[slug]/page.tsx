import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container, Ltr, Price } from '@/components/ui';
import { ExternalIcon } from '@/components/icons';
import { Facts, PageHeader } from '@/components/listing/PageHeader';
import { DrugList } from '@/components/listing/DrugList';
import { Pagination } from '@/components/Pagination';
import { getDrugPage } from '@/lib/data/drugs';
import { getHub, getIngredientDrugs } from '@/lib/data/listings';
import { formatCount, groupByFormAndStrength, pageOfGroups, parsePage } from '@/lib/listing/logic';
import { mentionsResearchNotes } from '@/lib/drug/logic';
import { formatDate } from '@/lib/format';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';
import type { HubDrug, HubRow, IngredientDetail } from '@/lib/data/types';

export const revalidate = 86400;

const PAGE_SIZE = 60;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

const names = (hub: HubRow) => ({
  ar: hub.name_ar ?? hub.name_en ?? hub.slug,
  en: hub.name_ar ? hub.name_en : null,
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const hub = await getHub('ingredient', (await params).slug);
  if (!hub) return {};
  const n = names(hub);
  return buildMetadata({
    kind: 'ingredient',
    path: routes.ingredient(hub.slug),
    ...pageText.ingredient(n.ar, n.en, (await getIngredientDrugs(hub.key)).length),
    indexable: hub.indexable,
    page: parsePage((await searchParams).page) ?? 1,
  });
}

/**
 * Reference data of the ingredient (class, mechanism, PubChem/DrugBank ids),
 * read from one product's page: a single-ingredient product when there is one.
 */
async function ingredientDetail(hub: HubRow, rows: HubDrug[]): Promise<IngredientDetail | null> {
  const sample = rows.find((r) => Number(r.ingredient_count) === 1) ?? rows[0];
  if (!sample) return null;
  const page = await getDrugPage(sample.slug);
  const cid = /^cid:(\d+)$/.exec(hub.key)?.[1];
  const details = page?.ingredient_details ?? [];
  return (
    details.find((d) => cid && String(d.pubchem_cid) === cid) ??
    details.find((d) => hub.name_en && d.name_en?.toLowerCase() === hub.name_en.toLowerCase()) ??
    null
  );
}

export default async function IngredientPage({ params, searchParams }: Props) {
  const hub = await getHub('ingredient', (await params).slug);
  if (!hub) notFound();
  const page = parsePage((await searchParams).page);
  if (page === null) notFound();

  const rows = await getIngredientDrugs(hub.key);
  const groups = groupByFormAndStrength(rows);
  const { slices, pages } = pageOfGroups(groups, page, PAGE_SIZE);
  if (page > pages) notFound();
  const detail = await ingredientDetail(hub, rows);
  const n = names(hub);
  const cid = /^cid:(\d+)$/.exec(hub.key)?.[1] ?? (detail?.pubchem_cid ? String(detail.pubchem_cid) : null);
  const single = rows.filter((r) => Number(r.ingredient_count) === 1).length;
  const mechanism = detail?.mechanism_ar && !mentionsResearchNotes(detail.mechanism_ar) ? detail.mechanism_ar : null;
  const drugClass = detail?.pharmacological_class_ar ?? detail?.therapeutic_class_ar ?? null;
  const path = routes.ingredient(hub.slug);

  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'المواد الفعالة', href: routes.ingredients() }, { name: n.ar }]}
        title={`الأدوية التي تحتوي على ${n.ar}`}
        lead={
          <>
            {formatCount(rows.length)} دواء في مصر يحتوي على {n.ar}
            {n.en && (
              <>
                {' '}
                (<Ltr>{n.en}</Ltr>)
              </>
            )}
            {single > 0 && single < rows.length && <>، منها {formatCount(single)} بهذه المادة وحدها</>}. الأدوية مقسمة حسب الشكل الدوائي
            والتركيز، والأرخص في كل مجموعة مميز باللون الأخضر.
          </>
        }
      >
        <Facts
          items={[
            { label: 'عدد الأدوية', value: <span className="price">{formatCount(rows.length)}</span> },
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

      {(drugClass || mechanism || cid || detail?.drugbank_id) && page === 1 && (
        <section aria-labelledby="about-ingredient" className="mb-8 rounded-card border border-border bg-surface p-4 md:p-6">
          <h2 id="about-ingredient" className="type-h2 text-ink">
            عن {n.ar}
          </h2>
          {drugClass && (
            <p className="mt-2 text-text-2">
              <span className="font-medium text-ink">الفئة الدوائية:</span> {drugClass}
            </p>
          )}
          {mechanism && <p className="mt-2 text-text-2">{mechanism}</p>}
          {(cid || detail?.drugbank_id) && (
            <p className="type-small mt-3 flex flex-wrap gap-x-4 gap-y-1 text-text-2">
              <span>مراجع علمية:</span>
              {cid && (
                <a
                  href={`https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline"
                >
                  <Ltr>PubChem CID {cid}</Ltr>
                  <ExternalIcon size={14} />
                </a>
              )}
              {detail?.drugbank_id && (
                <a
                  href={`https://go.drugbank.com/drugs/${detail.drugbank_id}`}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline"
                >
                  <Ltr>DrugBank {detail.drugbank_id}</Ltr>
                  <ExternalIcon size={14} />
                </a>
              )}
            </p>
          )}
        </section>
      )}

      <div className="space-y-8">
        {slices.map((g, i) => {
          const heading = [g.form, g.strength].filter(Boolean).join(' ');
          return (
            <section key={g.key} aria-labelledby={`group-${i}`}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id={`group-${i}`} className="type-h2 text-ink">
                  {g.single ? heading : `${g.form}: تركيبات مع مواد فعالة أخرى`}
                  {g.continued && <span className="type-small ms-2 font-normal text-muted">(تابع)</span>}
                </h2>
                <p className="type-small text-text-2">
                  <span className="price">{formatCount(g.rows.length)}</span> دواء
                  {g.minPrice !== null && (
                    <>
                      {' '}
                      • الأرخص <Price value={g.minPrice} className="font-semibold text-down" />
                    </>
                  )}
                </p>
              </div>
              <DrugList rows={g.pageRows} cheapest={g.cheapest} label={heading} />
            </section>
          );
        })}
      </div>

      <Pagination className="mt-8" current={page} total={pages} basePath={path} />
    </Container>
  );
}
