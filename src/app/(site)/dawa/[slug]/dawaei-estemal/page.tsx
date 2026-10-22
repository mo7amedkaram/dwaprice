import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Accordion } from '@/components/Accordion';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Container, Price, buttonClass } from '@/components/ui';
import { clinicalItems } from '@/components/drug/ClinicalSections';
import { MedicalDisclaimer, SourcesBlock } from '@/components/drug/Blocks';
import { getDrugPageData } from '@/lib/data/drug-page';
import { displayName, usesDescription, usesH1, usesTitle } from '@/lib/drug/logic';
import { drugModel } from '@/lib/drug/model';
import { buildMetadata } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

// Uses page: exists only when the payload has real indications plus at least two
// other clinical sections (hasUsesPage). Otherwise the URL is a 404, never an
// empty page, and the drug page does not link to it.
export const revalidate = 86400;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getDrugPageData(slug);
  if (!data) return {};
  const m = drugModel(data, '/dawaei-estemal');
  if (!m.usesPage) return {};
  return buildMetadata({
    kind: 'uses',
    path: routes.uses(slug),
    title: usesTitle(m.names),
    description: usesDescription({ ...m.names, ingredients: m.ingredients }, data.page.uses?.[0]?.indication_ar ?? null),
    indexable: m.robots.index,
    canonicalPath: m.robots.canonicalPath,
  });
}

export default async function UsesPage({ params }: Props) {
  const { slug } = await params;
  const data = await getDrugPageData(slug);
  if (!data) notFound();
  const m = drugModel(data, '/dawaei-estemal');
  if (!m.usesPage) notFound();
  const { page } = data;
  const sections = clinicalItems(page, { dosingRules: data.dosingRules, openFirst: true });
  const name = displayName(m.names);

  return (
    <Container className="py-4 md:py-8">
      <Breadcrumbs items={m.crumbs('دواعي الاستعمال')} />
      <header className="mt-4 space-y-2">
        <h1 className="type-h1 text-ink">{usesH1(m.names)}</h1>
        <p className="text-text-2">
          معلومات من نشرات دوائية ومراجع موثقة، مع مصدر كل معلومة. السعر الحالي:{' '}
          <Price value={page.current_price} className="font-semibold text-ink" />.
        </p>
      </header>
      <div className="mt-6 space-y-10">
        <Accordion items={sections.map((s) => ({ ...s, defaultOpen: true }))} />
        <div className="flex flex-wrap gap-3">
          <Link prefetch={false} href={routes.drug(slug)} className={buttonClass('secondary')}>
            سعر {name}
          </Link>
          {m.alternatives.same.length + m.alternatives.different.length + m.substitutes.length > 0 && (
            <Link prefetch={false} href={routes.alternatives(slug)} className={buttonClass('secondary')}>
              المثائل والبدائل
            </Link>
          )}
        </div>
        <SourcesBlock page={page} />
        <MedicalDisclaimer />
      </div>
    </Container>
  );
}
