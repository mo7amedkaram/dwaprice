import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Accordion } from '@/components/Accordion';
import { AlternativesTable } from '@/components/AlternativesTable';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { JsonLd } from '@/components/JsonLd';
import { PriceCard } from '@/components/PriceCard';
import { Container, SectionTitle, buttonClass } from '@/components/ui';
import { DrugHero } from '@/components/drug/DrugHero';
import { PriceHistorySection } from '@/components/drug/PriceHistorySection';
import { clinicalItems } from '@/components/drug/ClinicalSections';
import { AlsoSearchedAs, IdentifiersBlock, MedicalDisclaimer, OtherPacks, RelatedLinks, SourcesBlock } from '@/components/drug/Blocks';
import { getTopDrugSlugs } from '@/lib/data/drugs';
import { getDrugPageData } from '@/lib/data/drug-page';
import { drugDescription, drugH1, drugTitle } from '@/lib/drug/logic';
import { drugModel } from '@/lib/drug/model';
import { drugJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

// Static HTML from ISR: the most visited drugs at build time, the rest on first
// visit, all refreshed daily or on demand (tag drug:<slug>, POST /api/revalidate).
export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getTopDrugSlugs()).map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getDrugPageData(slug);
  if (!data) return {};
  const m = drugModel(data, '');
  const { page } = data;
  return buildMetadata({
    kind: 'drug',
    path: routes.drug(slug),
    title: drugTitle(m.names, m.year),
    absoluteTitle: true,
    description: drugDescription({ ...m.names, price: page.current_price, ingredients: m.ingredients, company: m.company, formAr: page.dosage_form_ar, updated: page.price_updated_date }),
    indexable: m.robots.index,
    canonicalPath: m.robots.canonicalPath,
    image: page.image_url ?? undefined,
  });
}

export default async function DrugPage({ params }: Props) {
  const { slug } = await params;
  const data = await getDrugPageData(slug);
  if (!data) notFound();
  const m = drugModel(data, '');
  const { page } = data;
  const sections = clinicalItems(page, {
    limit: m.usesPage ? 3 : undefined,
    usesHref: m.usesPage ? routes.uses(slug) : null,
    dosingRules: data.dosingRules,
    openFirst: true,
  });
  const hasAlternatives = m.alternatives.same.length + m.alternatives.different.length > 0;

  return (
    <Container className="py-4 md:py-8">
      <Breadcrumbs items={m.crumbs()} />

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--width-price-card)] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <DrugHero page={page} h1={drugH1(m.names, m.year)} imageAlt={m.imageAlt} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:row-span-2">
          <PriceCard
            price={page.current_price}
            oldPrice={m.change?.previous ?? null}
            unitPrice={m.unit.price}
            unitLabel={m.unit.label}
            units={page.units_per_package}
            updated={page.price_updated_date}
            verified={page.price_verified}
            listingStatus={page.listing_status}
            footer={
              hasAlternatives ? (
                <Link prefetch={false} href={routes.alternatives(slug)} className={buttonClass('primary', 'w-full')}>
                  بدائل {page.name_ar ?? page.name_en}
                </Link>
              ) : null
            }
          />
          <OtherPacks members={data.group} current={slug} />
        </aside>

        <div className="min-w-0 space-y-10">
          <PriceHistorySection points={m.history} />

          {m.alternatives.same.some((r) => !r.sibling) && (
            <section aria-labelledby="alternatives">
              <SectionTitle
                id="alternatives"
                end={
                  <Link prefetch={false} href={routes.alternatives(slug)} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
                    كل البدائل ({m.alternatives.same.length + m.alternatives.different.length})
                  </Link>
                }
              >
                أرخص البدائل
              </SectionTitle>
              <AlternativesTable variant="compact" rows={m.alternatives.same.filter((r) => !r.sibling).slice(0, 5)} caption={`أرخص بدائل ${page.name_ar ?? page.name_en} بنفس التركيز`} />
            </section>
          )}

          {sections.length > 0 && (
            <section aria-labelledby="info">
              <SectionTitle
                id="info"
                end={
                  m.usesPage ? (
                    <Link prefetch={false} href={routes.uses(slug)} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
                      التفاصيل الكاملة
                    </Link>
                  ) : null
                }
              >
                معلومات الدواء
              </SectionTitle>
              <Accordion items={sections} />
            </section>
          )}

          <AlsoSearchedAs names={m.alsoSearched} />
          <IdentifiersBlock page={page} />
          <RelatedLinks
            otherStrengths={m.otherStrengths}
            sameCompany={data.sameCompany}
            companyName={m.company}
            sameCategory={data.sameCategory}
            categoryName={page.category_name_ar}
          />
          <SourcesBlock page={page} />
          <MedicalDisclaimer />
        </div>
      </div>
      <JsonLd data={drugJsonLd(m.jsonLd)} />
    </Container>
  );
}
