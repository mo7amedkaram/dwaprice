import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { DrugRow } from '@/components/DrugRow';
import { EmptyState } from '@/components/EmptyState';
import { Pagination } from '@/components/Pagination';
import { SearchBox } from '@/components/SearchBox';
import { cleanQuery, searchDrugs } from '@/lib/data/search';
import { isWildcardQuery, wildcardProblem } from '@/lib/search/wildcard';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { strengthLabel } from '@/lib/listing/logic';

const PAGE_SIZE = 20;

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = cleanQuery(q);
  const text = query ? pageText.search(query) : { title: 'البحث عن دواء', description: 'ابحث عن سعر أي دواء في مصر.' };
  // Search results are always noindex,follow.
  return buildMetadata({ kind: 'search', path: '/search', ...text });
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, page: pageParam } = await searchParams;
  const query = cleanQuery(q);
  const page = Math.max(1, Math.min(50, Number(pageParam) || 1));
  // A wildcard pattern ("Au*in") the engine refuses: a friendly message, no query. Judged on the raw
  // text, because a lone "*" is shorter than the 2-character minimum cleanQuery enforces.
  const rawQ = (q ?? '').trim();
  const problem = isWildcardQuery(rawQ) ? wildcardProblem(rawQ) : null;
  const wildcard = !!query && !problem && isWildcardQuery(query);
  // One extra row tells whether a next page exists.
  const rows = query && !problem ? await searchDrugs(query, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE) : [];
  const hasNext = rows.length > PAGE_SIZE;
  // Only vowel-insensitive / typo matches (tiers 4-5): say so, the spelling was off.
  const approximate = !wildcard && rows.length > 0 && rows.every((r) => r.match_rank >= 4);

  return (
    <Container className="py-6 md:py-10">
      <Breadcrumbs items={[{ name: 'البحث' }]} jsonLd={false} />
      <h1 className="type-h1 mt-3 text-ink">{query ? `نتائج البحث عن «${query}»` : 'البحث عن دواء'}</h1>
      <div className="mt-4 max-w-2xl md:hidden">
        <SearchBox id="search-page" prefetch />
      </div>

      {problem ? (
        <EmptyState className="mt-6" title="نمط البحث غير مكتمل" description={problem} />
      ) : !query ? (
        <EmptyState className="mt-6" title="اكتب اسم الدواء أو المادة الفعالة" description="مثال: بنادول، أموكسيسيلين، أوجمنتين 1 جم." />
      ) : rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="لا توجد نتائج"
          description={wildcard ? 'لم يطابق هذا النمط أي اسم. جرّب حروفًا أقل مع *، أو ? مكان الحرف غير الواضح.' : 'تأكد من الكتابة، أو ابحث بالاسم الإنجليزي أو بالمادة الفعالة.'}
        />
      ) : (
        <>
          {wildcard && (
            <p className="mt-4 rounded-control border border-border bg-surface px-4 py-3 text-text-2">
              نتائج النمط <code dir="ltr" className="font-semibold text-ink">{query}</code>: الأقرب لما كتبته أولًا (* = أي عدد من الحروف، ? = حرف واحد).
            </p>
          )}
          {approximate && (
            <p className="mt-4 rounded-control border border-border bg-surface px-4 py-3 text-text-2">
              لم نجد اسمًا مطابقًا تمامًا لـ«{query}»، وهذه أقرب الأدوية إليه في الكتابة.
            </p>
          )}
          <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {rows.slice(0, PAGE_SIZE).map((r) => (
              <li key={r.slug}>
                <DrugRow
                  slug={r.slug}
                  nameAr={r.name_ar}
                  nameEn={r.name_en}
                  detail={[strengthLabel(r.strength), r.dosage_form_ar].filter(Boolean).join(' • ') || null}
                  price={r.current_price}
                />
              </li>
            ))}
          </ul>
          <Pagination className="mt-8" current={page} total={hasNext ? page + 1 : page} basePath="/search" params={{ q: query }} />
        </>
      )}
    </Container>
  );
}
