import type { ReactNode } from 'react';
import { Breadcrumbs } from '../Breadcrumbs';
import type { Crumb } from '@/lib/seo/jsonld';

/** Breadcrumbs (+ BreadcrumbList JSON-LD), H1, lead paragraph and optional facts row. */
export function PageHeader({ crumbs, title, lead, children }: { crumbs: Crumb[]; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 md:mb-8">
      <Breadcrumbs items={crumbs} />
      <h1 className="type-h1 mt-3 text-ink">{title}</h1>
      {lead && <p className="mt-2 max-w-3xl text-text-2">{lead}</p>}
      {children}
    </header>
  );
}

/** Small facts under a hub title: drug count, price range, last price update. */
export function Facts({ items }: { items: Array<{ label: string; value: ReactNode } | null | false | '' | undefined> }) {
  const shown = items.filter(Boolean) as Array<{ label: string; value: ReactNode }>;
  if (!shown.length) return null;
  return (
    <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
      {shown.map((f) => (
        <div key={f.label} className="flex items-baseline gap-2">
          <dt className="type-small text-text-2">{f.label}</dt>
          <dd className="font-semibold text-ink">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
