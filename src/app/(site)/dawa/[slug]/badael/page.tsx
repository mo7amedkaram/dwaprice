import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlternativesTable } from '@/components/AlternativesTable';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { EmptyState } from '@/components/EmptyState';
import { Container, Ltr, Price, SectionTitle, buttonClass } from '@/components/ui';
import { AlternativesExplainer, MedicalDisclaimer } from '@/components/drug/Blocks';
import { getDrugPageData } from '@/lib/data/drug-page';
import { alternativesDescription, alternativesH1, alternativesTitle, displayName } from '@/lib/drug/logic';
import { drugModel } from '@/lib/drug/model';
import { buildMetadata } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

// The ONE alternatives page per drug (replaces both similars.php and aorder.php).
// Exists only when the drug has at least one alternative.
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
  const m = drugModel(data, '/badael');
  const cheapest = m.alternatives.same.find((r) => r.cheapest);
  return buildMetadata({
    kind: 'alternatives',
    path: routes.alternatives(slug),
    title: alternativesTitle(m.names, m.year),
    absoluteTitle: true,
    description: alternativesDescription(
      { ...m.names, ingredients: m.ingredients },
      m.alternatives.same.filter((r) => !r.sibling).length,
      cheapest ? { name: cheapest.nameAr ?? cheapest.nameEn, price: cheapest.price } : null,
    ),
    indexable: m.robots.index,
    canonicalPath: m.robots.canonicalPath,
  });
}

export default async function AlternativesPage({ params }: Props) {
  const { slug } = await params;
  const data = await getDrugPageData(slug);
  if (!data) notFound();
  const m = drugModel(data, '/badael');
  const { page } = data;
  const { same, different } = m.alternatives;
  if (same.length + different.length === 0) notFound();
  const name = displayName(m.names);

  return (
    <Container className="py-4 md:py-8">
      <Breadcrumbs items={m.crumbs('البدائل')} />
      <header className="mt-4 space-y-2">
        <h1 className="type-h1 text-ink">{alternativesH1(m.names)}</h1>
        <p className="text-text-2">
          سعر <Link prefetch={false} href={routes.drug(slug)} className="font-medium text-primary hover:underline">{name}</Link> الحالي{' '}
          <Price value={page.current_price} className="font-semibold text-ink" />
          {m.ingredients.length > 0 && (
            <>
              {' '}
              — المادة الفعالة <Ltr>{m.ingredients.slice(0, 3).join(' + ')}</Ltr>
            </>
          )}
          .
        </p>
      </header>

      <div className="mt-6 space-y-10">
        <AlternativesExplainer />

        <section aria-labelledby="same">
          <SectionTitle id="same">بنفس المادة الفعالة والتركيز ({same.length})</SectionTitle>
          {same.length > 0 ? (
            <AlternativesTable rows={same} caption={`بدائل ${name} بنفس المادة الفعالة والتركيز، مرتبة من الأرخص`} />
          ) : (
            <EmptyState title="لا يوجد بديل بنفس التركيز" description="لكن توجد أدوية بنفس المادة الفعالة بتركيز آخر بالأسفل." />
          )}
        </section>

        {different.length > 0 && (
          <section aria-labelledby="different">
            <SectionTitle id="different">نفس المادة الفعالة بتركيز مختلف ({different.length})</SectionTitle>
            <AlternativesTable rows={different} caption={`أدوية بنفس المادة الفعالة لـ ${name} بتركيز مختلف`} />
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <Link prefetch={false} href={routes.drug(slug)} className={buttonClass('secondary')}>
            سعر {name}
          </Link>
          {m.usesPage && (
            <Link prefetch={false} href={routes.uses(slug)} className={buttonClass('secondary')}>
              دواعي استعمال {name}
            </Link>
          )}
        </div>
        <MedicalDisclaimer />
      </div>
    </Container>
  );
}
