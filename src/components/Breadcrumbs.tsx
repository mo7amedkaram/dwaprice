import Link from 'next/link';
import { ChevronEndIcon } from './icons';
import { JsonLd } from './JsonLd';
import { breadcrumbJsonLd, type Crumb } from '@/lib/seo/jsonld';

/** Visible trail + BreadcrumbList JSON-LD. The last item is the current page. */
export function Breadcrumbs({ items, jsonLd = true, lang = 'ar' }: { items: Crumb[]; jsonLd?: boolean; lang?: 'ar' | 'en' }) {
  const trail: Crumb[] = [{ name: lang === 'en' ? 'Home' : 'الرئيسية', href: '/' }, ...items];
  return (
    <>
      <nav aria-label={lang === 'en' ? 'Breadcrumb' : 'مسار التنقل'} className="type-small text-text-2">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          {trail.map((item, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={`${item.name}-${i}`} className="flex items-center gap-1">
                {last || !item.href ? (
                  <span aria-current={last ? 'page' : undefined} className={last ? 'font-medium text-ink' : undefined}>
                    {item.name}
                  </span>
                ) : (
                  <Link prefetch={false} href={item.href} className="inline-flex min-h-11 items-center hover:text-primary hover:underline">
                    {item.name}
                  </Link>
                )}
                {!last && <ChevronEndIcon size={14} className="text-muted" />}
              </li>
            );
          })}
        </ol>
      </nav>
      {jsonLd && <JsonLd data={breadcrumbJsonLd(trail)} />}
    </>
  );
}
