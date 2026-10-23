// Formatting for Egyptian Arabic UI. Latin digits are used for numbers (prices,
// strengths and pack sizes are written that way on Egyptian packs and lists).

const priceFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });

export const CURRENCY_AR = 'ج.م';

// Case-insensitive English ordering for drug lists. Arabic names are still displayed, they are
// just never sorted on (the site browses and sorts drugs by their English trade name).
const nameCollator = new Intl.Collator('en', { sensitivity: 'base' });

/** Compare two drug names by their English trade name, case-insensitive (Intl.Collator('en')). */
export function compareNamesEn(a: string | null | undefined, b: string | null | undefined): number {
  return nameCollator.compare(a ?? '', b ?? '');
}

/**
 * Price-list availability markers left in some trade names ("Congestal day 10
 * tabs.(n/a)"): the listing status is shown as a badge instead.
 */
export function tradeName(name: string): string {
  return name.replace(/\s*\.?\s*\((?:n\/a|na|cancell?ed|canceled)\)\s*/gi, ' ').trim() || name;
}

export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "45.5" -> "45.5" ; 120 -> "120" (no trailing .00). */
export function formatAmount(value: number | string | null | undefined): string | null {
  const n = toNumber(value);
  return n === null ? null : priceFormat.format(n);
}

export function formatPercent(value: number): string {
  return `${percentFormat.format(Math.abs(value))}%`;
}

/** Accepts "2026-10-21", a Date, or null. */
export function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  return Number.isNaN(d.getTime()) ? null : dateFormat.format(d);
}

/** ISO date (YYYY-MM-DD) for <time dateTime> and sitemaps. */
export function isoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

/** Percentage change from old to new; null when it cannot be computed. */
export function priceChange(oldPrice: number | null, newPrice: number | null): number | null {
  if (oldPrice === null || newPrice === null || oldPrice <= 0 || oldPrice === newPrice) return null;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}
