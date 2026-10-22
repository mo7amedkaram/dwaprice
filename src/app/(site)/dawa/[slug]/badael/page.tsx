import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlternativesTable } from '@/components/AlternativesTable';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { EmptyState } from '@/components/EmptyState';
import { Container, Ltr, Price, SectionTitle, buttonClass } from '@/components/ui';
import { AlternativesExplainer, MedicalDisclaimer, SafetyNote } from '@/components/drug/Blocks';
import { getDrugPageData } from '@/lib/data/drug-page';
import { alternativesDescription, alternativesH1, alternativesTitle, displayName, SIMILARS_NOTE, SUBSTITUTES_NOTE } from '@/lib/drug/logic';
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
      { similars: m.alternatives.same.filter((r) => !r.sibling).length, substitutes: m.substitutes.length },
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
  const similars = same.filter((r) => !r.sibling);
  const substitutes = m.substitutes;
  if (similars.length + different.length + substitutes.length === 0) notFound();
  const name = displayName(m.names);

  return (
    <Container className="py-4 md:py-8">
      <Breadcrumbs items={m.crumbs('بدائل ومثائل')} />
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

        {/* المثائل: same active ingredient. Same strength first, then a "different strength" sub-section. */}
        <section aria-labelledby="similars">
          <SectionTitle id="similars">المثائل — نفس المادة الفعالة ({similars.length})</SectionTitle>
          <SafetyNote>{SIMILARS_NOTE}</SafetyNote>
          {similars.length > 0 ? (
            <AlternativesTable rows={similars} caption={`مثائل ${name} بنفس المادة الفعالة والتركيز، مرتبة من الأرخص`} />
          ) : (
            <EmptyState title="لا يوجد مثيل بنفس التركيز" description="لكن توجد أدوية بنفس المادة الفعالة بتركيز آخر بالأسفل." />
          )}
          {different.length > 0 && (
            <div className="mt-8">
              <h3 className="type-h2 mb-3 text-ink">نفس المادة الفعالة بتركيز مختلف ({different.length})</h3>
              <AlternativesTable rows={different} caption={`أدوية بنفس المادة الفعالة لـ ${name} بتركيز مختلف`} />
            </div>
          )}
        </section>

        {/* البدائل: same therapeutic class, different active ingredient. No savings badge. */}
        {substitutes.length > 0 && (
          <section aria-labelledby="substitutes">
            <SectionTitle id="substitutes">البدائل — مادة فعالة مختلفة من نفس المجموعة العلاجية ({substitutes.length})</SectionTitle>
            <SafetyNote tone="strong">{SUBSTITUTES_NOTE}</SafetyNote>
            <AlternativesTable substitute showDiff={false} rows={substitutes} caption={`بدائل ${name} من نفس المجموعة العلاجية بمادة فعالة مختلفة، مرتبة من الأرخص`} />
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
