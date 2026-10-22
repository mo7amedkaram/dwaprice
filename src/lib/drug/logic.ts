// Pure decision rules for the drug templates. No server-only imports, so the
// whole module is unit-tested (tests/drug-logic.test.ts). Pages and sitemaps
// both call these functions, so a rule exists in one place only.

import { CURRENCY_AR, formatAmount, formatDate, formatPercent, toNumber } from '@/lib/format';

// ---------------------------------------------------------------- duplicates (recognition_product_index groups)

export interface GroupMember {
  slug: string;
  indexable: boolean;
  /** The group's recognition_product_index.canonical_drug_id is folded into this product. */
  isRpiCanonical: boolean;
  visitCount: number;
}

/**
 * The page that represents a group of the same drug in different packs.
 * 1. recognition_product_index's canonical, if that page is indexable;
 * 2. otherwise the indexable member with most visits, then the first slug;
 * 3. null when no member is indexable (every member is noindex anyway).
 * Never canonicalises an indexable page to a non-indexable one.
 */
export function chooseGroupCanonical(members: GroupMember[]): string | null {
  const indexable = members.filter((m) => m.indexable);
  if (indexable.length === 0) return null;
  const rpi = indexable.find((m) => m.isRpiCanonical);
  if (rpi) return rpi.slug;
  return [...indexable].sort((a, b) => b.visitCount - a.visitCount || a.slug.localeCompare(b.slug))[0].slug;
}

/** Slugs that are non-canonical members of some group (excluded from sitemaps). */
export function nonCanonicalSlugs(rows: Array<GroupMember & { groupKey: string }>): Set<string> {
  const groups = new Map<string, GroupMember[]>();
  for (const r of rows) groups.set(r.groupKey, [...(groups.get(r.groupKey) ?? []), r]);
  const out = new Set<string>();
  for (const members of groups.values()) {
    const canonical = chooseGroupCanonical(members);
    if (!canonical) continue;
    for (const m of members) if (m.slug !== canonical) out.add(m.slug);
  }
  return out;
}

// ---------------------------------------------------------------- robots / canonical

export type DrugSubPage = '' | '/badael' | '/dawaei-estemal';

export interface RobotsInput {
  slug: string;
  /** web.drug_cards.indexable (research, verified price, Arabic name, not illegal/cancelled). */
  indexable: boolean;
  noindexReason: string | null;
  /** chooseGroupCanonical() of the page's group; null when not in a group. */
  groupCanonicalSlug: string | null;
  subPage: DrugSubPage;
  /** Whether the group canonical has this sub-page (uses pages depend on content). */
  canonicalHasSubPage?: boolean;
}

export interface RobotsDecision {
  index: boolean;
  /** Path of rel=canonical. */
  canonicalPath: string;
  reason: string | null;
}

export const drugPath = (slug: string, sub: DrugSubPage = '') => `/dawa/${slug}${sub}`;

/**
 * Self-canonical and indexable when the product is indexable; a non-canonical
 * member of a group points rel=canonical at the group's page (same sub-page
 * when it exists there, else its main page) and is noindex.
 */
export function drugRobots(input: RobotsInput): RobotsDecision {
  const { slug, groupCanonicalSlug, subPage } = input;
  if (groupCanonicalSlug && groupCanonicalSlug !== slug) {
    const sub = subPage && input.canonicalHasSubPage === false ? '' : subPage;
    return { index: false, canonicalPath: drugPath(groupCanonicalSlug, sub), reason: 'DUPLICATE_PACK' };
  }
  return { index: input.indexable, canonicalPath: drugPath(slug, subPage), reason: input.indexable ? null : input.noindexReason };
}

// ---------------------------------------------------------------- sub-pages

/** Clinical sections that count towards a uses page (dosing is shown only from approved rules). */
export const USES_PAGE_OTHER_SECTIONS = ['side_effects', 'contraindications', 'interactions', 'pregnancy', 'warnings'] as const;
export const USES_PAGE_MIN_OTHER_SECTIONS = 2;

/** /dawaei-estemal exists only with real indications plus at least two other clinical sections. */
export function hasUsesPage(sections: readonly string[] | null | undefined): boolean {
  if (!sections?.includes('uses')) return false;
  return USES_PAGE_OTHER_SECTIONS.filter((s) => sections.includes(s)).length >= USES_PAGE_MIN_OTHER_SECTIONS;
}

// ---------------------------------------------------------------- names, H1, titles, descriptions

const DIGITS = /\d+(?:[.,]\d+)?/g;

/** "1 g (amoxicillin 875 mg + clavulanic acid 125 mg per tablet)" -> "1 g"; null when long or empty. */
export function shortStrength(strength: string | null | undefined): string | null {
  if (!strength) return null;
  const s = strength.split('(')[0].replace(/\s+/g, ' ').trim().replace(/[,;:]+$/, '');
  if (!s || s.length > 24 || !/\d/.test(s)) return null;
  return s;
}

const UNITS_AR: Array<[RegExp, string]> = [
  [/\b(mcg|µg|μg|ug)\b/gi, 'مكجم'],
  [/\bmg\b/gi, 'مجم'],
  [/\b(gm|g)\b/gi, 'جم'],
  [/\bml\b/gi, 'مل'],
  [/\b(i\.?u\.?|iu)\b/gi, 'وحدة دولية'],
];

/**
 * "650/4/60 mg" -> "650/4/60 مجم": units in Arabic so a strength reads in order
 * inside an Arabic heading (Latin units in RTL text reorder visually).
 */
export function arabicUnits(strength: string): string {
  return UNITS_AR.reduce((s, [re, ar]) => s.replace(re, ar), strength).replace(/\s+/g, ' ').trim();
}

/** Name plus short strength (Arabic units), unless the name already contains the strength's numbers. */
export function nameWithStrength(name: string, strength: string | null | undefined): string {
  const short = shortStrength(strength);
  if (!short) return name;
  const numbers = short.match(DIGITS) ?? [];
  const nameNumbers = new Set((name.match(DIGITS) ?? []).map((n) => n.replace(',', '.')));
  const already = numbers.length > 0 && numbers.every((n) => nameNumbers.has(n.replace(',', '.')));
  return already ? name : `${name} ${arabicUnits(short)}`;
}

/**
 * Year shown in titles: the year the price was last updated, else the current year.
 */
export function priceYear(priceUpdatedDate: string | null | undefined, now = new Date()): number {
  const y = priceUpdatedDate ? Number(priceUpdatedDate.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 2000 ? y : now.getUTCFullYear();
}

export interface DrugNames {
  nameAr: string | null;
  nameEn: string;
  priceListName?: string | null;
  strength: string | null;
}

export const displayName = (d: Pick<DrugNames, 'nameAr' | 'nameEn'>) => d.nameAr ?? d.nameEn;

export function drugH1(d: DrugNames, year: number): string {
  return `سعر ${nameWithStrength(displayName(d), d.strength)} ${year}`;
}

export const TITLE_MAX = 60;

/** English part for titles: the name without parentheticals. */
function englishShort(name: string | null | undefined): string | null {
  if (!name) return null;
  const s = name.split('(')[0].replace(/\s+/g, ' ').trim();
  return s || null;
}

/**
 * "سعر {name} {strength} {year} | {English name}", kept within ~60 chars:
 * tries the English trade name, then the shorter price-list name, then drops
 * the English part. The Arabic part is never cut.
 */
export function drugTitle(d: DrugNames, year: number): string {
  const ar = drugH1(d, year);
  for (const en of [englishShort(d.nameEn), englishShort(d.priceListName)]) {
    if (en && `${ar} | ${en}`.length <= TITLE_MAX) return `${ar} | ${en}`;
  }
  return ar;
}

export const DESCRIPTION_MAX = 155;

/** Adds sentences while the text stays within the limit (the first one always). */
function fit(parts: Array<string | null | undefined | false>, max = DESCRIPTION_MAX): string {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    const next = out ? `${out} ${p}` : p;
    if (out && next.length > max) continue;
    out = next;
  }
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}

export interface DescriptionInput extends DrugNames {
  price: string | number | null;
  ingredients: string[];
  company: string | null;
  formAr: string | null;
  updated: string | null;
}

export function drugDescription(d: DescriptionInput): string {
  const name = displayName(d);
  const amount = formatAmount(d.price);
  return fit([
    amount ? `سعر ${name} في مصر ${amount} ${CURRENCY_AR}${d.updated ? ` (آخر تحديث ${formatDate(d.updated)})` : ''}.` : `${name} في مصر.`,
    d.ingredients.length ? `المادة الفعالة: ${d.ingredients.slice(0, 2).join(' + ')}.` : null,
    d.formAr ? `${d.formAr}${d.company ? ` من ${d.company}` : ''}.` : d.company ? `إنتاج ${d.company}.` : null,
    'مع المثائل الأرخص بنفس المادة الفعالة والبدائل وتاريخ السعر.',
  ]);
}

export function alternativesH1(d: DrugNames): string {
  return `بدائل ومثائل ${nameWithStrength(displayName(d), d.strength)}`;
}

export function alternativesTitle(d: DrugNames, year: number): string {
  return `بدائل ومثائل ${displayName(d)} وأسعارها ${year}`;
}

export function alternativesDescription(
  d: DrugNames & { ingredients: string[] },
  counts: { similars: number; substitutes: number },
  cheapest: { name: string; price: string | number | null } | null,
): string {
  const name = displayName(d);
  const amount = cheapest ? formatAmount(cheapest.price) : null;
  return fit([
    `مثائل ${name}: أدوية بنفس المادة الفعالة والتركيز${counts.similars ? ` (${counts.similars})` : ''} مرتبة من الأرخص.`,
    cheapest && amount ? `الأرخص: ${cheapest.name} بسعر ${amount} ${CURRENCY_AR}.` : null,
    counts.substitutes ? `والبدائل: أدوية من نفس المجموعة العلاجية بمادة فعالة مختلفة (${counts.substitutes}).` : null,
    d.ingredients.length ? `المادة الفعالة: ${d.ingredients.slice(0, 2).join(' + ')}.` : null,
  ]);
}

export function usesH1(d: DrugNames): string {
  return `دواعي استعمال ${nameWithStrength(displayName(d), d.strength)}`;
}

export function usesTitle(d: DrugNames): string {
  return `دواعي استعمال ${displayName(d)} والآثار الجانبية`;
}

export function usesDescription(d: DrugNames & { ingredients: string[] }, firstUse: string | null): string {
  const name = displayName(d);
  return fit([
    `دواعي استعمال ${name}${d.ingredients.length ? ` (${d.ingredients.slice(0, 2).join(' + ')})` : ''}.`,
    firstUse ? `${firstUse.replace(/[.،]+$/, '')}.` : null,
    'مع الآثار الجانبية وموانع الاستعمال والتداخلات الدوائية ومصادرها.',
  ]);
}

// ---------------------------------------------------------------- prices

export interface HistoryPoint {
  price: number;
  effective_date: string | null;
  source: 'catalog' | 'event';
}

export interface PriceChange {
  previous: number;
  current: number;
  pct: number;
  date: string | null;
  source: 'catalog' | 'event';
}

/** Chronological price points: undated (older) catalogue points first, then by date. */
export function orderedHistory(points: HistoryPoint[]): HistoryPoint[] {
  return [...points.filter((p) => !p.effective_date), ...points.filter((p) => p.effective_date).sort((a, b) => a.effective_date!.localeCompare(b.effective_date!))];
}

/**
 * Price points for the chart and the changes table: the payload history plus
 * the catalogue's old_price -> current_price when the history lacks them
 * (many rows carry the change only in those two columns).
 */
export function historyPoints(points: HistoryPoint[], oldPrice: number | string | null, currentPrice: number | string | null, priceDate: string | null): HistoryPoint[] {
  const out = [...points];
  const cur = toNumber(currentPrice);
  const prev = toNumber(oldPrice);
  if (cur !== null && !out.some((p) => p.price === cur)) out.push({ price: cur, effective_date: priceDate, source: 'catalog' });
  if (prev !== null && prev !== cur && !out.some((p) => p.price === prev)) out.push({ price: prev, effective_date: null, source: 'catalog' });
  return out;
}

/** Each change between consecutive distinct prices, newest first. */
export function priceChanges(points: HistoryPoint[]): PriceChange[] {
  const ordered = orderedHistory(points);
  const out: PriceChange[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1].price;
    const cur = ordered[i].price;
    if (prev === cur || prev <= 0) continue;
    out.push({ previous: prev, current: cur, pct: ((cur - prev) / prev) * 100, date: ordered[i].effective_date, source: ordered[i].source });
  }
  return out.reverse();
}

/**
 * The change shown on the price card: the newest recorded price_change_event
 * if there is one, else the catalogue's old_price -> current_price.
 */
export function latestChange(points: HistoryPoint[], oldPrice: number | string | null, currentPrice: number | string | null, priceDate: string | null): PriceChange | null {
  const fromEvents = priceChanges(points.filter((p) => p.source === 'event'))[0];
  if (fromEvents) return fromEvents;
  const prev = toNumber(oldPrice);
  const cur = toNumber(currentPrice);
  if (prev === null || cur === null || prev <= 0 || prev === cur) return null;
  return { previous: prev, current: cur, pct: ((cur - prev) / prev) * 100, date: priceDate, source: 'catalog' };
}

/** Unit word for "سعر {unit}" from the form class. */
export function unitLabel(formClass: string | null | undefined): string {
  switch (formClass) {
    case 'tablet':
      return 'القرص';
    case 'capsule':
      return 'الكبسولة';
    case 'sachet':
      return 'الكيس';
    case 'suppository':
      return 'اللبوس';
    case 'injection':
      return 'الأمبول / الفيال';
    default:
      return 'الوحدة';
  }
}

/** Price per unit: stored unit_price, else price / units_per_package. */
export function unitPrice(unitPriceValue: number | string | null, price: number | string | null, units: number | null): number | null {
  const stored = toNumber(unitPriceValue);
  if (stored !== null && stored > 0) return stored;
  const p = toNumber(price);
  if (p === null || !units || units <= 1) return null;
  return Math.round((p / units) * 100) / 100;
}

// ---------------------------------------------------------------- alternatives

export interface AlternativeInput {
  alt_slug: string;
  name_ar: string | null;
  name_en: string;
  strength: string | null;
  dosage_form_ar: string | null;
  company: string | null;
  units_per_package: number | null;
  current_price: string | number | null;
  unit_price: string | number | null;
  match_type: 'SAME_INGREDIENTS_SAME_STRENGTH' | 'SAME_INGREDIENTS_DIFFERENT_STRENGTH';
  alt_listing_status: string | null;
  /** Same dosage-form class as the original (tablet/tablet, cream/cream…). */
  same_form: boolean;
}

export interface AlternativeRowOut {
  slug: string;
  nameAr: string | null;
  nameEn: string;
  strength: string | null;
  form: string | null;
  company: string | null;
  price: number | null;
  unitPrice: number | null;
  diffAbs: number | null;
  diffPct: number | null;
  unavailable: boolean;
  cheapest: boolean;
  /** Another pack of the same drug (same recognition_product_index group), not a different product. */
  sibling: boolean;
  sameForm: boolean;
}

export interface AlternativeGroups {
  same: AlternativeRowOut[];
  different: AlternativeRowOut[];
}

const UNAVAILABLE = new Set(['NOT_AVAILABLE', 'NOT_YET_AVAILABLE', 'CANCELLED', 'ILLEGAL_IMPORT']);

/** The marketing company of "Manufacturer > Marketer", without research notes. */
export function marketingCompany(company: string | null | undefined): string | null {
  if (!company) return null;
  return cleanCompanyName(company.split('>').pop()!.trim());
}

/**
 * Same ingredients + same strength first, then same ingredients + other
 * strength. Within each group the same dosage form comes first (an ointment's
 * alternatives are ointments before dressings or creams), then by price (no
 * price last, then name). The cheapest available same-strength product that is
 * not another pack of the same drug (`siblings`) is flagged, preferring the
 * same form; differences are against the reference (original) price.
 */
export function groupAlternatives(rows: AlternativeInput[], referencePrice: number | string | null, siblings: ReadonlySet<string> = new Set()): AlternativeGroups {
  const ref = toNumber(referencePrice);
  const map = (r: AlternativeInput): AlternativeRowOut => {
    const price = toNumber(r.current_price);
    return {
      slug: r.alt_slug,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      strength: r.strength,
      form: r.dosage_form_ar,
      company: marketingCompany(r.company),
      price,
      unitPrice: unitPrice(r.unit_price, r.current_price, r.units_per_package),
      diffAbs: ref !== null && price !== null ? Math.round((price - ref) * 100) / 100 : null,
      diffPct: ref !== null && price !== null && ref > 0 ? ((price - ref) / ref) * 100 : null,
      unavailable: r.alt_listing_status !== null && UNAVAILABLE.has(r.alt_listing_status),
      cheapest: false,
      sibling: siblings.has(r.alt_slug),
      sameForm: r.same_form,
    };
  };
  const byPrice = (a: AlternativeRowOut, b: AlternativeRowOut) =>
    Number(b.sameForm) - Number(a.sameForm) ||
    (a.price ?? Infinity) - (b.price ?? Infinity) ||
    (a.nameAr ?? a.nameEn).localeCompare(b.nameAr ?? b.nameEn, 'ar');
  const same = rows.filter((r) => r.match_type === 'SAME_INGREDIENTS_SAME_STRENGTH').map(map).sort(byPrice);
  const different = rows.filter((r) => r.match_type !== 'SAME_INGREDIENTS_SAME_STRENGTH').map(map).sort(byPrice);
  const eligible = same.filter((r) => !r.unavailable && !r.sibling && r.price !== null);
  const cheapest = eligible.find((r) => r.sameForm) ?? [...eligible].sort((a, b) => a.price! - b.price!)[0];
  if (cheapest) cheapest.cheapest = true;
  return { same, different };
}

// ---------------------------------------------------------------- drug-info language (English toggle)

/** The drug-page fields that can carry English clinical text. */
export interface EnglishInfoSource {
  uses?: Array<{ indication_en?: string }> | null;
  side_effects?: Array<{ en?: string }> | null;
  contraindications?: Array<{ en?: string }> | null;
  warnings?: Array<{ en?: string }> | null;
  interactions?: Array<{ description_en?: string }> | null;
  monitoring?: Array<{ en?: string }> | null;
  pregnancy?: { risk_summary?: Array<{ en?: string }>; breastfeeding?: Array<{ en?: string }> } | null;
  ingredient_details?: Array<{ mechanism_en?: string | null }> | null;
  storage?: { en?: string | null } | null;
  description_en?: string | null;
  description_needs_review?: boolean;
}

const anyEn = (items: Array<{ en?: string | null }> | null | undefined) => (items ?? []).some((s) => s.en?.trim());

/**
 * Whether the drug has any English clinical text at all. The drug page shows the عربي|English
 * toggle only when this is true; otherwise the section stays Arabic with no switch. Same field
 * rules the bilingual renderer uses (components/drug/ClinicalSections).
 */
export function hasEnglishInfo(page: EnglishInfoSource): boolean {
  return !!(
    (page.description_en?.trim() && !page.description_needs_review) ||
    (page.uses ?? []).some((u) => u.indication_en?.trim()) ||
    anyEn(page.side_effects) ||
    anyEn(page.contraindications) ||
    anyEn(page.warnings) ||
    (page.interactions ?? []).some((it) => it.description_en?.trim()) ||
    anyEn(page.monitoring) ||
    anyEn([...(page.pregnancy?.risk_summary ?? []), ...(page.pregnancy?.breastfeeding ?? [])]) ||
    (page.ingredient_details ?? []).some((m) => m.mechanism_en?.trim()) ||
    page.storage?.en?.trim()
  );
}

/** Short safety notes shown above each list (exact wording from the brief). */
export const SIMILARS_NOTE = 'نفس المادة الفعالة والتركيز. اسأل الصيدلي قبل الاستبدال.';
export const SUBSTITUTES_NOTE = 'مادة فعالة مختلفة من نفس المجموعة العلاجية. لا تستبدل دواءك ببديل إلا بأمر الطبيب.';

// ---------------------------------------------------------------- البدائل (therapeutic substitutes)

/** A row of web.drug_substitutes (different ingredient, same ATC level-4 and route). */
export interface SubstituteInput {
  alt_slug: string;
  name_ar: string | null;
  name_en: string;
  strength: string | null;
  dosage_form_ar: string | null;
  form_class: string | null;
  company: string | null;
  units_per_package: number | null;
  current_price: string | number | null;
  unit_price: string | number | null;
  alt_listing_status: string | null;
}

/** The exact ATC codes of each length, from web.products.atc_prefixes (lengths 1/3/4/5/7). */
export function atcLevel(prefixes: string[] | null | undefined, len: 4 | 5): string[] {
  const re = len === 4 ? /^[A-Z][0-9]{2}[A-Z]{2}$/ : /^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/;
  return [...new Set((prefixes ?? []).filter((p) => re.test(p)))];
}

interface AtcDrug {
  atcPrefixes: string[] | null;
  routeClass: string | null;
  ingredientCount: number;
}

/**
 * The البدائل rule (mirror of web.drug_substitutes, kept pure for tests): `alt` is a
 * substitute for `src` when they share an ATC level-4 code (same therapeutic subgroup),
 * share NO ATC level-5 code (so the active ingredient differs), have the same route, and
 * — unless `src` is itself a combination — `alt` is a single-ingredient drug. A drug with no
 * ATC level-4 code never has substitutes (no fallback to the category field).
 */
export function isSubstitute(src: AtcDrug, alt: AtcDrug): boolean {
  const srcL4 = atcLevel(src.atcPrefixes, 4);
  if (srcL4.length === 0 || !src.routeClass) return false;
  if (src.routeClass !== alt.routeClass) return false;
  const altL4 = atcLevel(alt.atcPrefixes, 4);
  if (!srcL4.some((c) => altL4.includes(c))) return false; // same level-4 subgroup
  const srcL5 = atcLevel(src.atcPrefixes, 5);
  const altL5 = atcLevel(alt.atcPrefixes, 5);
  if (altL5.some((c) => srcL5.includes(c))) return false; // different level-5 (different ingredient)
  if (src.ingredientCount <= 1 && alt.ingredientCount > 1) return false; // no combination substitute for a single-ingredient drug
  return true;
}

/** Substitute rows for display: price only (no savings badge — different ingredients aren't comparable), cheapest first. */
export function groupSubstitutes(rows: SubstituteInput[]): AlternativeRowOut[] {
  const UNAV = UNAVAILABLE;
  return rows
    .map((r) => ({
      slug: r.alt_slug,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      strength: r.strength,
      form: r.dosage_form_ar,
      company: marketingCompany(r.company),
      price: toNumber(r.current_price),
      unitPrice: unitPrice(r.unit_price, r.current_price, r.units_per_package),
      diffAbs: null,
      diffPct: null,
      unavailable: r.alt_listing_status !== null && UNAV.has(r.alt_listing_status),
      cheapest: false,
      sibling: false,
      sameForm: false,
    }))
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || (a.nameAr ?? a.nameEn).localeCompare(b.nameAr ?? b.nameEn, 'ar'));
}

/** "أرخص 174 ج.م (82.9%)" style parts for a difference. */
export function describeDiff(diffAbs: number | null, diffPct: number | null): { tone: 'down' | 'up' | 'same'; amount: string | null; pct: string | null } {
  if (diffAbs === null || diffPct === null || Math.abs(diffPct) < 0.05) return { tone: 'same', amount: null, pct: null };
  return { tone: diffAbs < 0 ? 'down' : 'up', amount: formatAmount(Math.abs(diffAbs)), pct: formatPercent(diffPct) };
}

// ---------------------------------------------------------------- "also searched as"

const normalizeAlias = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ْـ]/g, '') // tashkeel, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Up to `max` other spellings people use, plain text: approved aliases and the
 * spellings of folded duplicate rows, minus anything equal to a shown name.
 */
export function alsoSearchedAs(aliases: string[] | null | undefined, shownNames: Array<string | null | undefined>, max = 6): string[] {
  const seen = new Set(shownNames.filter(Boolean).map((n) => normalizeAlias(n!)));
  const out: string[] = [];
  for (const a of aliases ?? []) {
    const clean = a.replace(/\s+/g, ' ').trim();
    const key = normalizeAlias(clean);
    if (!key || key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------- text hygiene

/** Research notes that must not be shown ("as listed by Dawa Prices", "per directory"). */
const RESEARCH_NOTE = /\s*\((?:[^)]*\b(?:dawa ?prices|dwaprices|dw2|directory|as listed|listed by)\b[^)]*)\)/gi;

/** Company names without research notes: "Sedico (as listed by Dawa Prices and dw2.org)" -> "Sedico". */
export function cleanCompanyName(name: string | null | undefined): string | null {
  if (!name) return null;
  const s = name.replace(RESEARCH_NOTE, '').replace(/\s+/g, ' ').trim();
  return s || null;
}

export function mentionsResearchNotes(text: string | null | undefined): boolean {
  return !!text && /(dawa ?prices|dwaprices|\bdw2\b|directory|as listed|دليل الأسعار|الدليل المصري)/i.test(text);
}
