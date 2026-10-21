import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui';
import { PageHeader } from '@/components/listing/PageHeader';
import { DrugList } from '@/components/listing/DrugList';
import { LetterNav } from '@/components/listing/LetterNav';
import { Pagination } from '@/components/Pagination';
import { getLetterCounts, getLetterDrugs } from '@/lib/data/listings';
import { LETTER_PAGE_SIZE, formatCount, orderLetters, pageCount, parsePage } from '@/lib/listing/logic';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

export const revalidate = 86400;

type Props = { params: Promise<{ letter: string }>; searchParams: Promise<{ page?: string }> };

async function letterOf(param: string) {
  const letter = decodeURIComponent(param);
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

  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'الأدوية من أ إلى ي', href: routes.letters() }, { name: `حرف ${entry.letter}` }]}
        title={`أدوية تبدأ بحرف ${entry.letter}`}
        lead={
          <>
            {formatCount(entry.n)} دواء يبدأ اسمه بحرف {entry.letter}، مرتبة أبجديًا مع السعر الحالي
            {pages > 1 && (
              <>
                {' '}
                (الأدوية <span className="price">{formatCount(from)}</span>–
                <span className="price">{formatCount(Math.min(entry.n, page * LETTER_PAGE_SIZE))}</span>)
              </>
            )}
            .
          </>
        }
      />
      <LetterNav letters={entry.letters} current={entry.letter} className="mb-6" />
      <DrugList rows={rows} label={`أدوية حرف ${entry.letter}`} />
      <Pagination className="mt-8" current={page} total={pages} basePath={path} showAll />
    </Container>
  );
}
