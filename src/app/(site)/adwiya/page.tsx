import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui';
import { PageHeader } from '@/components/listing/PageHeader';
import { LetterNav } from '@/components/listing/LetterNav';
import { pageHref } from '@/components/Pagination';
import { getLetterCounts } from '@/lib/data/listings';
import { LETTER_PAGE_SIZE, formatCount, orderLetters, pageCount } from '@/lib/listing/logic';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

export const revalidate = 86400;

export const metadata: Metadata = buildMetadata({ kind: 'static', path: routes.letters(), ...pageText.letters() });

/**
 * Every drug A-Z: each letter with a link to each of its pages, so every
 * indexable drug is at most two clicks from here (three from home).
 */
export default async function LettersPage() {
  const letters = orderLetters(await getLetterCounts());
  const total = letters.reduce((n, l) => n + l.n, 0);
  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'الأدوية من أ إلى ي' }]}
        title="دليل الأدوية من أ إلى ي"
        lead={`${formatCount(total)} دواء مرتبة أبجديًا حسب الحرف الأول من الاسم العربي. اختر الحرف، ثم الصفحة.`}
      />
      <LetterNav letters={letters} className="mb-8" />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {letters.map(({ letter, n }) => {
          const pages = pageCount(n, LETTER_PAGE_SIZE);
          return (
            <li key={letter} className="rounded-card border border-border p-4">
              <h2 className="flex items-baseline justify-between gap-3">
                <Link prefetch={false} href={routes.letter(letter)} className="tap inline-flex items-center text-2xl font-semibold text-ink hover:text-primary">
                  {letter}
                </Link>
                <span className="type-small font-normal text-text-2">
                  <span className="price">{formatCount(n)}</span> دواء
                </span>
              </h2>
              {pages > 1 && (
                <nav aria-label={`صفحات حرف ${letter}`} className="mt-2">
                  <ul className="flex flex-wrap gap-1">
                    {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                      <li key={p}>
                        <Link
                          prefetch={false}
                          href={pageHref(routes.letter(letter), p)}
                          aria-label={`حرف ${letter}، صفحة ${p}`}
                          className="type-small price tap inline-flex items-center justify-center rounded-control-sm px-1 text-text-2 hover:bg-primary-tint hover:text-primary"
                        >
                          {p}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </li>
          );
        })}
      </ul>
    </Container>
  );
}
