import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container, cx } from '@/components/ui';
import { PageHeader } from '@/components/listing/PageHeader';
import { PriceChangesTable } from '@/components/listing/PriceChangesTable';
import { EmptyState } from '@/components/EmptyState';
import { Pagination } from '@/components/Pagination';
import { getLatestChanges } from '@/lib/data/listings';
import { formatCount, pageCount, parseDirection, parsePage, type Direction } from '@/lib/listing/logic';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';
import { getSiteSettings } from '@/lib/settings/read';
import { WhatsAppChannelButton } from '@/components/WhatsAppChannelButton';

export const revalidate = 3600;

const PAGE_SIZE = 50;

type Props = { searchParams: Promise<{ page?: string; direction?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const direction = parseDirection(sp.direction);
  const path = routes.lastPrices();
  // ?direction= is a filter: noindex,follow with a canonical to the full list.
  return buildMetadata({
    kind: 'prices',
    path,
    ...pageText.lastPrices(direction),
    page: parsePage(sp.page) ?? 1,
    filtered: direction !== null,
    canonicalPath: direction ? path : undefined,
  });
}

const FILTERS: Array<{ value: Direction | null; label: string }> = [
  { value: null, label: 'كل التغييرات' },
  { value: 'increase', label: 'الزيادات' },
  { value: 'decrease', label: 'التخفيضات' },
];

export default async function LastPricesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const direction = parseDirection(sp.direction);
  const page = parsePage(sp.page);
  if (page === null) notFound();
  const { rows, total } = await getLatestChanges(direction, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const pages = pageCount(total, PAGE_SIZE);
  if (page > pages) notFound();
  const path = routes.lastPrices();
  const title = pageText.lastPrices(direction).title;
  const { contact } = await getSiteSettings();

  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'أحدث الأسعار' }]}
        title={title}
        lead={
          <>
            آخر تغيير في سعر كل دواء: السعر القديم والجديد وقيمة التغيير ونسبته وتاريخه، الأحدث أولًا. نتابع قوائم الأسعار باستمرار.
          </>
        }
      >
        {contact.whatsappChannelUrl && (
          <div className="mt-4">
            <WhatsAppChannelButton url={contact.whatsappChannelUrl} placement="last_prices" />
          </div>
        )}
      </PageHeader>
      <nav aria-label="نوع التغيير" className="mb-4">
        <ul className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const current = f.value === direction;
            const href = f.value ? `${path}?direction=${f.value}` : path;
            return (
              <li key={f.label}>
                <Link
                  prefetch={false}
                  href={href}
                  aria-current={current ? 'page' : undefined}
                  className={cx(
                    'tap inline-flex items-center rounded-control border px-4 font-medium transition-colors',
                    current ? 'border-primary bg-primary text-on-primary' : 'border-border text-ink hover:border-primary hover:text-primary',
                  )}
                >
                  {f.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="type-small mb-3 text-text-2">
        <span className="price">{formatCount(total)}</span> دواء
      </p>
      {rows.length === 0 ? (
        <EmptyState title="لا توجد تغييرات" description="لم نسجل تغييرات من هذا النوع مؤخرًا." />
      ) : (
        <PriceChangesTable rows={rows} caption={title} />
      )}
      <Pagination className="mt-8" current={page} total={pages} basePath={path} params={{ direction: direction ?? undefined }} />
    </Container>
  );
}
