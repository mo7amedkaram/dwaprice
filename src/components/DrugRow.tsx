import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronEndIcon } from './icons';
import { Ltr, Price, cx } from './ui';
import { routes } from '@/lib/site';
import { tradeName } from '@/lib/format';

export interface DrugRowProps {
  slug: string;
  nameAr: string | null;
  nameEn: string;
  /** Active ingredient(s), Latin. */
  ingredient?: string | null;
  /** e.g. "500 مجم • أقراص" */
  detail?: string | null;
  price: number | string | null;
  badges?: ReactNode;
  className?: string;
}

/** One drug in a list: Arabic name, English name, ingredient, price. The whole row is the link. */
export function DrugRow({ slug, nameAr, nameEn, ingredient, detail, price, badges, className }: DrugRowProps) {
  return (
    <Link prefetch={false} href={routes.drug(slug)}
      className={cx(
        'group flex min-h-16 w-full min-w-0 items-center gap-3 rounded-card border border-border bg-bg px-4 py-3 transition-colors',
        'hover:border-primary hover:bg-primary-tint/40',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink group-hover:text-primary">{nameAr ?? tradeName(nameEn)}</span>
          {badges}
        </span>
        {nameAr && <Ltr block className="type-small truncate text-text-2">{tradeName(nameEn)}</Ltr>}
        {(ingredient || detail) && (
          <span className="type-small mt-0.5 block truncate text-muted">
            {ingredient && <Ltr>{ingredient}</Ltr>}
            {ingredient && detail && ' • '}
            {detail}
          </span>
        )}
      </span>
      <Price value={price} className="shrink-0 font-semibold text-ink" currencyClassName="type-small text-text-2" />
      <ChevronEndIcon size={18} className="shrink-0 text-muted group-hover:text-primary" />
    </Link>
  );
}
