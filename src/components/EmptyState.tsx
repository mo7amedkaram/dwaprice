import type { ReactNode } from 'react';
import { PillIcon } from './icons';
import { cx } from './ui';

export function EmptyState({
  title,
  description,
  icon,
  action,
  headingLevel = 2,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <div className={cx('flex flex-col items-center rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-tint text-primary">
        {icon ?? <PillIcon size={28} />}
      </div>
      <Heading className={headingLevel === 1 ? 'type-h1 text-ink' : 'type-h2 text-ink'}>{title}</Heading>
      {description && <div className="mt-2 max-w-md text-text-2">{description}</div>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
