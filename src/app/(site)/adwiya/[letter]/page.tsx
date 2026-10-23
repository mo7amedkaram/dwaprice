import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui';
import { PageHeader } from '@/components/listing/PageHeader';
import { DrugList } from '@/components/listing/DrugList';
import { LetterNav } from '@/components/listing/LetterNav';
import { Pagination } from '@/components/Pagination';
import { getLetterCounts, getLetterDrugs } from '@/lib/data/listings';
import { LETTER_PAGE_SIZE, formatCount, isBrowseLetter, letterLabel, orderLetters, pageCount, parsePage } from '@/lib/listing/logic';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

export const revalidate = 86400;

type Props = { params: Promise<{ letter: string }>; searchParams: Promise<{ page?: string }> };

// The proxy (src/proxy.ts) 301s upper-case and old Arabic-letter URLs, so a valid request reaches
// here only with a live lower-case bucket; the guard is a defensive last resort.
async function letterOf(param: string) {
  const letter = decodeURIComponent(param).toLowerCase();
  if (!isBrowseLetter(letter)) return null;
  const letters = orderLetters(await getLetterCounts());
  const entry = letters.find((l) => l.letter === letter);
  return entry ? { ...entry, letters } : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const entry = await letterOf((await params).letter);
  if (!entry) return {};
  return buildMetadata({
    kind: 'static',
    path: routes.letter(entry.letter),
    ...pageText.letter(entry.letter, entry.n),
    page: parsePage((await searchParams).page) ?? 1,
    // A bucket with no drugs (currently w, x, y, z) keeps its button and renders, but is noindex and
    // left out of the sitemap (lib/data/sitemap.ts) rather than offered to Google as a thin page.
    indexable: entry.n > 0,
  });
}

export default async function LetterPage({ params, searchParams }: Props) {
  const entry = await letterOf((await params).letter);
  if (!entry) notFound();
  const page = parsePage((await searchParams).page);
  const pages = pageCount(entry.n, LETTER_PAGE_SIZE);
  if (page === null || page > pages) notFound();
  const rows = await getLetterDrugs(entry.letter, LETTER_PAGE_SIZE, (page - 1) * LETTER_PAGE_SIZE);
  const path = routes.letter(entry.letter);
  const from = (page - 1) * LETTER_PAGE_SIZE + 1;
  const isDigit = entry.letter === '0-9';
  const label = letterLabel(entry.letter);
  const starts = isDigit ? 'برقم' : `بحرف ${label}`;

  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'الأدوية من A إلى Z', href: routes.letters() }, { name: isDigit ? 'رقم' : `حرف ${label}` }]}
        title={isDigit ? 'أدوية يبدأ اسمها برقم' : `أدوية تبدأ بحرف ${label}`}
        lead={
          entry.n === 0 ? (
            `لا توجد حاليًا أدوية يبدأ اسمها ${starts}.`
          ) : (
            <>
              {formatCount(entry.n)} دواء يبدأ اسمه {starts}، مرتبة أبجديًا مع السعر الحالي
              {pages > 1 && (
                <>
                  {' '}
                  (الأدوية <span className="price">{formatCount(from)}</span>–
                  <span className="price">{formatCount(Math.min(entry.n, page * LETTER_PAGE_SIZE))}</span>)
                </>
              )}
              .
            </>
          )
        }
      />
      <LetterNav letters={entry.letters} current={entry.letter} className="mb-6" />
      {rows.length > 0 ? (
        <>
          <DrugList rows={rows} label={`أدوية يبدأ اسمها ${starts}`} />
          <Pagination className="mt-8" current={page} total={pages} basePath={path} showAll />
        </>
      ) : (
        <p className="text-text-2">جرّب حرفًا آخر من الحروف أعلاه.</p>
      )}
    </Container>
  );
}
