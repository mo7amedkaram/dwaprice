import Link from 'next/link';
import { ChevronEndIcon, ChevronStartIcon } from './icons';
import { cx } from './ui';

/** URL of page N: page 1 has no ?page (one canonical URL), other query params are kept. */
export function pageHref(basePath: string, page: number, params: Record<string, string | undefined> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== 'page') qs.set(k, v);
  if (page > 1) qs.set('page', String(page));
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** Page numbers to show: first, last, and a window around the current page (or all of them). */
function pages(current: number, total: number, all: boolean): Array<number | 'gap'> {
  if (all) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/**
 * Pages beyond 1 are noindex,follow with a self canonical (see buildMetadata);
 * the links here stay plain <a> so crawlers can still follow the list.
 * `showAll` links every page (A-Z lists: keeps each drug within 3 clicks of home).
 */
export function Pagination({
  current,
  total,
  basePath,
  params,
  showAll = false,
  className,
}: {
  current: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  showAll?: boolean;
  className?: string;
}) {
  if (total <= 1) return null;
  const item = 'tap inline-flex items-center justify-center rounded-control px-3 font-medium';
  return (
    <nav aria-label="التنقل بين الصفحات" className={cx('flex justify-center', className)}>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {current > 1 ? (
            <Link prefetch={false} href={pageHref(basePath, current - 1, params)} rel="prev" className={cx(item, 'gap-1 text-text-2 hover:bg-primary-tint hover:text-primary')}>
              <ChevronStartIcon size={18} />
              السابق
            </Link>
          ) : (
            <span aria-disabled="true" className={cx(item, 'gap-1 text-muted')}>
              <ChevronStartIcon size={18} />
              السابق
            </span>
          )}
        </li>
        {pages(current, total, showAll).map((p, i) =>
          p === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={p}>
              {p === current ? (
                <span aria-current="page" className={cx(item, 'price bg-primary text-on-primary')}>
                  <span className="sr-only">الصفحة </span>
                  {p}
                </span>
              ) : (
                <Link prefetch={false} href={pageHref(basePath, p, params)} className={cx(item, 'price text-ink hover:bg-primary-tint hover:text-primary')}>
                  <span className="sr-only">الصفحة </span>
                  {p}
                </Link>
              )}
            </li>
          ),
        )}
        <li>
          {current < total ? (
            <Link prefetch={false} href={pageHref(basePath, current + 1, params)} rel="next" className={cx(item, 'gap-1 text-text-2 hover:bg-primary-tint hover:text-primary')}>
              التالي
              <ChevronEndIcon size={18} />
            </Link>
          ) : (
            <span aria-disabled="true" className={cx(item, 'gap-1 text-muted')}>
              التالي
              <ChevronEndIcon size={18} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
