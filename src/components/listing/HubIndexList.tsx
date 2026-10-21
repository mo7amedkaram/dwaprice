import Link from 'next/link';
import { Ltr } from '../ui';
import { formatCount } from '@/lib/listing/logic';

export interface HubLink {
  href: string;
  name: string;
  /** Latin name shown under the Arabic one. */
  nameEn?: string | null;
  count: number | string;
  /** Grouping letter (first letter of the name). */
  group: string;
}

/** Alphabetical index of hubs (ingredients, companies…), grouped by first letter, with drug counts. */
export function HubIndexList({ links, countLabel = 'دواء' }: { links: HubLink[]; countLabel?: string }) {
  const groups = new Map<string, HubLink[]>();
  for (const l of links) groups.set(l.group, [...(groups.get(l.group) ?? []), l]);
  const anchor = (g: string) => `g-${g.codePointAt(0)}`;
  return (
    <div className="space-y-8">
      <nav aria-label="انتقل إلى حرف">
        <ul className="flex flex-wrap gap-1">
          {[...groups.keys()].map((g) => (
            <li key={g}>
              <a
                href={`#${anchor(g)}`}
                className="tap inline-flex min-w-11 items-center justify-center rounded-control border border-border px-2 font-semibold text-ink hover:border-primary hover:text-primary"
              >
                {g}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {[...groups.entries()].map(([g, items]) => (
        <section key={g} aria-labelledby={anchor(g)}>
          <h2 id={anchor(g)} className="type-h2 mb-3 scroll-mt-20 border-b border-border pb-2 text-ink">
            {g}
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 sm:gap-x-6 lg:grid-cols-3">
            {items.map((l) => (
              <li key={l.href} className="min-w-0">
                <Link prefetch={false} href={l.href} className="group flex min-h-11 items-center justify-between gap-3 border-b border-border py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink group-hover:text-primary">
                      {/^[a-z0-9]/i.test(l.name) ? <Ltr>{l.name}</Ltr> : l.name}
                    </span>
                    {l.nameEn && (
                      <Ltr block className="type-small hidden truncate text-text-2 sm:block">
                        {l.nameEn}
                      </Ltr>
                    )}
                  </span>
                  <span className="type-small hidden shrink-0 text-muted sm:inline">
                    <span className="price">{formatCount(l.count)}</span> {countLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
