import type { ReactNode } from 'react';
import { ChevronDownIcon } from './icons';
import { cx } from './ui';

export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
  defaultOpen?: boolean;
}

/**
 * Native <details>/<summary>: keyboard and screen-reader support built in,
 * content stays in the HTML (indexable) and works without JavaScript.
 */
export function Accordion({ items, className }: { items: AccordionItem[]; className?: string }) {
  return (
    <div className={cx('divide-y divide-border overflow-hidden rounded-card border border-border bg-bg', className)}>
      {items.map((item) => (
        <details key={item.id} id={item.id} open={item.defaultOpen} className="group">
          <summary
            className={cx(
              'flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-semibold text-ink',
              'hover:bg-surface [&::-webkit-details-marker]:hidden',
            )}
          >
            <span>{item.title}</span>
            <ChevronDownIcon className="shrink-0 text-text-2 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4 text-text-2">{item.content}</div>
        </details>
      ))}
    </div>
  );
}
