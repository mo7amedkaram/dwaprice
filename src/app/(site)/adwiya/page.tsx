import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui';
import { PageHeader } from '@/components/listing/PageHeader';
import { LetterNav } from '@/components/listing/LetterNav';
import { pageHref } from '@/components/Pagination';
import { getLetterCounts } from '@/lib/data/listings';
import { LETTER_PAGE_SIZE, formatCount, letterLabel, orderLetters, pageCount } from '@/lib/listing/logic';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

export const revalidate = 86400;

export const metadata: Metadata = buildMetadata({ kind: 'static', path: routes.letters(), ...pageText.letters() });

/**
 * Every drug A-Z (by English trade name): each letter with a link to each of its pages, so every
 * indexable drug is at most two clicks from here (three from home).
 */
export default async function LettersPage() {
  const letters = orderLetters(await getLetterCounts());
  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'الأدوية من A إلى Z' }]}
        title="دليل الأدوية من A إلى Z"
        lead="كل الأدوية المتاحة في مصر مرتبة أبجديًا حسب أول حرف في الاسم الإنجليزي. اختر الحرف، ثم الصفحة."
      />
      <LetterNav letters={letters} className="mb-8" />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {letters.map(({ letter, n }) => {
          const pages = pageCount(n, LETTER_PAGE_SIZE);
          const label = letterLabel(letter);
          return (
            <li key={letter} className="rounded-card border border-border p-4">
              <h2 className="flex items-baseline justify-between gap-3">
                <Link prefetch={false} href={routes.letter(letter)} className="tap inline-flex items-center text-2xl font-semibold text-ink hover:text-primary">
                  {label}
                </Link>
                <span className="type-small font-normal text-text-2">
                  <span className="price">{formatCount(n)}</span> دواء
                </span>
              </h2>
              {pages > 1 && (
                <nav aria-label={letter === '0-9' ? 'صفحات أدوية الأرقام' : `صفحات حرف ${label}`} className="mt-2">
                  <ul className="flex flex-wrap gap-1">
                    {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                      <li key={p}>
                        <Link
                          prefetch={false}
                          href={pageHref(routes.letter(letter), p)}
                          aria-label={`${letter === '0-9' ? 'الأرقام' : `حرف ${label}`}، صفحة ${p}`}
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
