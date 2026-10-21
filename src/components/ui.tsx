// Small shared primitives: Container, Ltr, Price, Badge, Tag, button styles.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CURRENCY_AR, formatAmount } from '@/lib/format';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** 1200px max width with the side gutter. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-site px-4 md:px-6', className)}>{children}</div>;
}

/**
 * Latin text inside Arabic UI: isolated LTR run, Inter font via :lang(en).
 * `block` puts it on its own line aligned with the surrounding Arabic text
 * (an RTL block holding the LTR run), instead of a left-aligned LTR block.
 */
export function Ltr({ children, className, block = false }: { children: ReactNode; className?: string; block?: boolean }) {
  if (block) {
    return (
      <span className={cx('block', className)}>
        <span dir="ltr" lang="en">
          {children}
        </span>
      </span>
    );
  }
  return (
    <span dir="ltr" lang="en" className={className}>
      {children}
    </span>
  );
}

/** A price with tabular figures; renders "—" when there is no price. */
export function Price({
  value,
  className,
  currencyClassName,
}: {
  value: number | string | null | undefined;
  className?: string;
  currencyClassName?: string;
}) {
  const amount = formatAmount(value);
  if (amount === null) return <span className={cx('price text-muted', className)}>—</span>;
  return (
    <span className={cx('price', className)}>
      <data value={String(value)}>{amount}</data>
      <span className={cx('ms-1 font-normal', currencyClassName)}>{CURRENCY_AR}</span>
    </span>
  );
}

export type BadgeTone = 'neutral' | 'primary' | 'down' | 'up' | 'rx' | 'muted';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface text-text-2 border-border',
  primary: 'bg-primary-tint text-primary border-transparent',
  down: 'bg-down-bg text-down border-transparent',
  up: 'bg-up-bg text-up border-transparent',
  rx: 'bg-rx-bg text-rx border-transparent',
  muted: 'bg-bg text-muted border-border',
};

/** Status label (not interactive). */
export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'type-small inline-flex items-center gap-1 rounded-control-sm border px-2 py-0.5 font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Linked chip (ingredient, category, company). */
export function Tag({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link prefetch={false} href={href}
      className={cx(
        'type-small tap inline-flex items-center gap-1 rounded-control border border-border bg-bg px-3 font-medium text-ink',
        'transition-colors hover:border-primary hover:bg-primary-tint hover:text-primary',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border bg-bg text-ink hover:border-primary hover:text-primary',
  ghost: 'text-primary hover:bg-primary-tint',
};

/** Class names for <button> and <Link> rendered as buttons. */
export function buttonClass(variant: ButtonVariant = 'primary', className?: string): string {
  return cx(
    'tap inline-flex items-center justify-center gap-2 rounded-control px-4 font-medium transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    BUTTON_VARIANTS[variant],
    className,
  );
}

/** Section heading (H2) with optional trailing content. */
export function SectionTitle({ id, children, end }: { id?: string; children: ReactNode; end?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 id={id} className="type-h2 text-ink">
        {children}
      </h2>
      {end}
    </div>
  );
}
