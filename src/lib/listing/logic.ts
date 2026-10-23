// Pure helpers of the listing pages (hubs, A-Z, last prices). No server-only:
// unit-tested in tests/listing-logic.test.ts.

import { arabicUnits, shortStrength } from '@/lib/drug/logic';
import { compareNamesEn, toNumber } from '@/lib/format';
import type { HubDrug, ListFilters } from '@/lib/data/types';

// ---------------------------------------------------------------- query params

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? '';

/** ?page=N: 1 when absent; null when invalid (non-numeric, < 1, > max). */
export function parsePage(raw: string | string[] | undefined, max = 1000): number | null {
  const v = first(raw);
  if (v === '') return 1;
  if (!/^\d{1,5}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= max ? n : null;
}

export const DEFAULT_FILTERS: ListFilters = { form: null, rx: null, min: null, max: null, sort: 'name' };
const SORTS = new Set<ListFilters['sort']>(['name', 'price-asc', 'price-desc']);

/**
 * Filters of a hub list from the query string. `filtered` = anything but the
 * default list (the page is then noindex,follow with a canonical to the clean
 * URL). `cleanQuery` is the canonical query string of the request (empty and
 * unknown parameters dropped): when it differs from the request, redirect.
 */
export function parseFilters(params: Params, allowedForms: ReadonlySet<string>): { filters: ListFilters; filtered: boolean; cleanQuery: string } {
  const form = first(params.form);
  const rx = first(params.rx);
  const sort = first(params.sort);
  const price = (v: string) => {
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return null;
    return Number(v);
  };
  let min = price(first(params.min));
  let max = price(first(params.max));
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const filters: ListFilters = {
    form: allowedForms.has(form) ? form : null,
    rx: rx === 'rx' || rx === 'otc' ? rx : null,
    min,
    max,
    sort: SORTS.has(sort as ListFilters['sort']) ? (sort as ListFilters['sort']) : 'name',
  };
  const qs = filterQuery(filters);
  const page = first(params.page);
  if (page && page !== '1') qs.set('page', page);
  return {
    filters,
    filtered: filters.form !== null || filters.rx !== null || filters.min !== null || filters.max !== null || filters.sort !== 'name',
    cleanQuery: qs.toString(),
  };
}

/** Query parameters of non-default filters (for links and pagination). */
export function filterQuery(f: ListFilters): URLSearchParams {
  const qs = new URLSearchParams();
  if (f.form) qs.set('form', f.form);
  if (f.rx) qs.set('rx', f.rx);
  if (f.min !== null) qs.set('min', String(f.min));
  if (f.max !== null) qs.set('max', String(f.max));
  if (f.sort !== 'name') qs.set('sort', f.sort);
  return qs;
}

/** Same query string, order-insensitive, ignoring empty values: does the request need a redirect? */
export function sameQuery(request: Params, clean: string): boolean {
  const req = new URLSearchParams();
  for (const [k, v] of Object.entries(request)) {
    const value = first(v);
    if (value !== '') req.set(k, value);
  }
  const norm = (q: URLSearchParams) => [...q.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&');
  const hasEmpty = Object.values(request).some((v) => first(v) === '');
  return !hasEmpty && norm(req) === norm(new URLSearchParams(clean));
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// ---------------------------------------------------------------- labels

/** web.products.form_class -> Arabic label (plural, as on a shelf). */
export const FORM_LABELS: Record<string, string> = {
  tablet: 'أقراص',
  capsule: 'كبسولات',
  injection: 'حقن',
  syrup: 'شراب',
  suspension: 'معلق',
  drops: 'قطرات',
  sachet: 'أكياس',
  cream: 'كريم',
  ointment: 'مرهم',
  gel: 'جل',
  lotion: 'لوشن',
  solution: 'محلول',
  spray: 'بخاخ',
  inhaler: 'استنشاق',
  powder: 'بودرة',
  suppository: 'لبوس',
};

export function formLabel(formClass: string | null | undefined, dosageFormAr?: string | null): string {
  return (formClass && FORM_LABELS[formClass]) || dosageFormAr || 'أشكال أخرى';
}

/**
 * "500 mg" -> "500 مجم"; "Paracetamol 500 mg" -> "500 مجم" (leading words
 * dropped); null when the strength is missing or not a short value.
 */
export function strengthLabel(strength: string | null | undefined): string | null {
  const s = shortStrength(strength?.replace(/^[A-Za-z][A-Za-z\s-]*(?=\d)/, ''));
  return s ? arabicUnits(s) : null;
}

/** "500 مجم • أقراص" for a list row. */
export function rowDetail(d: Pick<HubDrug, 'strength' | 'dosage_form_ar' | 'form_class'>): string | null {
  const parts = [strengthLabel(d.strength), d.dosage_form_ar ?? (d.form_class ? FORM_LABELS[d.form_class] : null)].filter(Boolean);
  return parts.length ? parts.join(' • ') : null;
}

/** Latin-digit count with thousands separators: 13228 -> "13,228". */
export function formatCount(n: number | string | null | undefined): string {
  return new Intl.NumberFormat('en-US').format(Number(n) || 0);
}

// ---------------------------------------------------------------- ingredient page groups

export interface DrugGroup {
  key: string;
  /** false for products with other active ingredients too. */
  single: boolean;
  form: string;
  /** Arabic-unit strength, null when unknown or a combination. */
  strength: string | null;
  rows: HubDrug[];
  /** Slug of the cheapest priced product in the group (only when 2+ are priced). */
  cheapest: string | null;
  minPrice: number | null;
}

const strengthValue = (s: string | null) => {
  const n = s?.match(/\d+(?:\.\d+)?/);
  return n ? Number(n[0]) : Infinity;
};

/**
 * Drugs of an ingredient grouped by form and strength: products with this
 * ingredient alone first, then combinations (grouped by form only). Groups:
 * largest form first, then by strength; rows by price (no price last).
 */
export function groupByFormAndStrength(rows: HubDrug[]): DrugGroup[] {
  const groups = new Map<string, DrugGroup>();
  for (const r of rows) {
    const single = Number(r.ingredient_count) <= 1;
    const form = formLabel(r.form_class, r.dosage_form_ar);
    const strength = single ? strengthLabel(r.strength) : null;
    const key = `${single ? 1 : 2}|${form}|${strength ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, single, form, strength, rows: [], cheapest: null, minPrice: null };
      groups.set(key, g);
    }
    g.rows.push(r);
  }
  const formSize = new Map<string, number>();
  for (const g of groups.values()) formSize.set(`${g.single}|${g.form}`, (formSize.get(`${g.single}|${g.form}`) ?? 0) + g.rows.length);

  const byPrice = (a: HubDrug, b: HubDrug) =>
    (toNumber(a.current_price) ?? Infinity) - (toNumber(b.current_price) ?? Infinity) || compareNamesEn(a.name_en, b.name_en);
  const out = [...groups.values()];
  for (const g of out) {
    g.rows.sort(byPrice);
    const priced = g.rows.filter((r) => (toNumber(r.current_price) ?? 0) > 0);
    g.minPrice = priced.length ? toNumber(priced[0].current_price) : null;
    g.cheapest = priced.length >= 2 ? priced[0].slug : null;
  }
  return out.sort(
    (a, b) =>
      Number(b.single) - Number(a.single) ||
      formSize.get(`${b.single}|${b.form}`)! - formSize.get(`${a.single}|${a.form}`)! ||
      a.form.localeCompare(b.form, 'ar') ||
      strengthValue(a.strength) - strengthValue(b.strength) ||
      (a.strength ?? '').localeCompare(b.strength ?? ''),
  );
}

export interface GroupSlice extends DrugGroup {
  /** The group started on an earlier page. */
  continued: boolean;
  /** Rows of the group on this page. */
  pageRows: HubDrug[];
}

/** One page of grouped rows (`pageSize` rows; a group may continue on the next page). */
export function pageOfGroups(groups: DrugGroup[], page: number, pageSize: number): { slices: GroupSlice[]; pages: number } {
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const slices: GroupSlice[] = [];
  let offset = 0;
  for (const g of groups) {
    const gStart = offset;
    const gEnd = offset + g.rows.length;
    offset = gEnd;
    if (gEnd <= start || gStart >= end) continue;
    slices.push({ ...g, continued: gStart < start, pageRows: g.rows.slice(Math.max(0, start - gStart), Math.min(g.rows.length, end - gStart)) });
  }
  return { slices, pages: pageCount(total, pageSize) };
}

// ---------------------------------------------------------------- A-Z (English)

/** Drugs per A-Z page. */
export const LETTER_PAGE_SIZE = 100;

/**
 * The drug A-Z buckets: the 26 Latin letters, then one bucket ("0-9") for names that start with a
 * digit. Drugs are grouped by the first character of their English trade name. The row of buttons
 * always shows all 27, whatever the per-bucket counts, so the alphabet reads as a complete line.
 */
export const BROWSE_LETTERS = [...'abcdefghijklmnopqrstuvwxyz', '0-9'];

/** True for a live A-Z bucket (lower-case a–z or "0-9"); the /adwiya URLs use these verbatim. */
export function isBrowseLetter(letter: string): boolean {
  return BROWSE_LETTERS.includes(letter);
}

/** Display label of a bucket: "A".."Z", or "0-9" as is. */
export function letterLabel(letter: string): string {
  return letter === '0-9' ? '0-9' : letter.toUpperCase();
}

/**
 * SQL expression over web.drug_cards for a drug's A-Z bucket ('a'..'z' or '0-9'): the first
 * character of the English trade name (sort_name is lower(trade_name_en)) after any leading
 * spaces, quotes or punctuation; a name with no usable Latin initial (empty or non-Latin) falls
 * back to the first Latin letter of the slug, and finally to "0-9". Kept here so the data layer
 * (lib/data/listings.ts), the sitemap (lib/data/sitemap.ts) and the tests share one definition.
 */
export const LETTER_EXPR = `case
  when left(regexp_replace(coalesce(sort_name, ''), '^[[:space:][:punct:]]+', ''), 1) ~ '[a-z]'
    then left(regexp_replace(sort_name, '^[[:space:][:punct:]]+', ''), 1)
  when left(regexp_replace(coalesce(sort_name, ''), '^[[:space:][:punct:]]+', ''), 1) ~ '[0-9]'
    then '0-9'
  when slug ~ '[a-z]' then substring(slug from '[a-z]')
  else '0-9'
end`;

/** The 27 buckets with their drug counts, in order (a–z then 0-9); missing buckets get 0. */
export function orderLetters(counts: Array<{ letter: string; n: number }>): Array<{ letter: string; n: number }> {
  const byLetter = new Map(counts.map((c) => [c.letter, c.n]));
  return BROWSE_LETTERS.map((letter) => ({ letter, n: byLetter.get(letter) ?? 0 }));
}

/** Grouping letter of a name in an index: hamza forms of alif -> ا, ى -> ي, Latin upper-case, digits -> "#". */
export function indexLetter(name: string): string {
  const c = name.trim().charAt(0);
  if (/[آأإٱ]/.test(c)) return 'ا';
  if (c === 'ى') return 'ي';
  if (/[a-z]/i.test(c)) return c.toUpperCase();
  if (/\d/.test(c) || !c) return '#';
  return c;
}

const arabicCollator = new Intl.Collator('ar');

/** Sorts names the way an Arabic reader expects (Arabic letters in order, then Latin). */
export function compareNames(a: string, b: string): number {
  const ra = /^[a-z0-9]/i.test(a) ? 1 : 0;
  const rb = /^[a-z0-9]/i.test(b) ? 1 : 0;
  return ra - rb || arabicCollator.compare(a, b);
}

// ---------------------------------------------------------------- ATC

/** "j01cr02-penicillin-with…" -> { code: "J01CR02", suffix: "penicillin-with…" }; null when not an ATC code. */
export function parseAtcParam(param: string): { code: string; suffix: string } | null {
  const decoded = decodeURIComponent(param);
  const m = /^([a-z](?:\d{2}(?:[a-z](?:[a-z](?:\d{2})?)?)?)?)(?:-(.*))?$/i.exec(decoded);
  if (!m) return null;
  return { code: m[1].toUpperCase(), suffix: m[2] ?? '' };
}

// ---------------------------------------------------------------- last prices

export type Direction = 'increase' | 'decrease';

export function parseDirection(raw: string | string[] | undefined): Direction | null {
  const v = first(raw);
  return v === 'increase' || v === 'decrease' ? v : null;
}
