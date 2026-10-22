// The light half of the search engine: constants, unit/form synonyms, query-word matching and
// highlighting. The main thread (SearchBox, client.ts) imports only from here, so the heavy
// SearchEngine class (engine.ts) stays in the worker bundle and off the first page load.
import { normalizeSearch } from './normalize';

export const SUGGESTION_LIMIT = 8;
export const MIN_QUERY_CHARS = 2;
export const FUZZY_MIN_CHARS = 4;

export const TIER = { exact: 0, namePrefix: 1, wordPrefix: 2, alias: 3, ingredient: 4, substring: 5, fuzzy: 6 } as const;

// Tokens that mean the same thing (normalised spellings). A query word matches a drug word when
// the drug word starts with the query word or with any token of its group.
const SYNONYM_GROUPS: string[][] = [
  ['g', 'gm', 'gram', 'grams', 'جم', 'جرام', 'غ'],
  ['mg', 'milligram', 'milligrams', 'مجم', 'ملجم', 'مللجم', 'مليجرام', 'ملليجرام'],
  ['mcg', 'ug', 'µg', 'microgram', 'ميكروجرام', 'مكجم'],
  ['ml', 'milliliter', 'millilitre', 'مل', 'ملل', 'مللي'],
  ['iu', 'unit', 'units', 'وحده', 'وحدات'],
  ['tab', 'tabs', 'tablet', 'tablets', 'قرص', 'اقراص'],
  ['cap', 'caps', 'capsule', 'capsules', 'كبسول', 'كبسوله', 'كبسولات'],
  ['amp', 'amps', 'ampoule', 'ampoules', 'امبول', 'امبولات'],
  ['vial', 'vials', 'فيال', 'فيالات'],
  ['syrup', 'شراب'],
  ['susp', 'suspension', 'معلق'],
  ['supp', 'suppository', 'suppositories', 'لبوس'],
  ['sachet', 'sachets', 'ساشيه', 'اكياس', 'كيس'],
  ['cream', 'كريم'],
  ['gel', 'جل'],
  ['oint', 'ointment', 'مرهم'],
  ['drops', 'نقط', 'قطره'],
  ['spray', 'بخاخ', 'سبراي'],
  ['inj', 'injection', 'حقن', 'حقنه'],
];
const SYNONYMS = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) for (const t of group) SYNONYMS.set(t, group);

/** A query word expanded with its unit/form synonyms. */
export function expand(token: string): string[] {
  const group = SYNONYMS.get(token);
  return group ? [token, ...group.filter((t) => t !== token)] : [token];
}

export function startsWithAny(word: string, prefixes: string[]): boolean {
  for (let i = 0; i < prefixes.length; i++) if (word.startsWith(prefixes[i])) return true;
  return false;
}

/** Every query word (already expanded) starts some word of `words`. */
export function covered(expanded: string[][], words: string[]): boolean {
  for (let j = 0; j < expanded.length; j++) {
    const prefixes = expanded[j];
    let found = false;
    for (let w = 0; w < words.length && !found; w++) found = startsWithAny(words[w], prefixes);
    if (!found) return false;
  }
  return true;
}

/** Typos allowed for a query word of this length (the brief's rule). */
export function allowedTypos(length: number): number {
  return length >= 8 ? 2 : length >= FUZZY_MIN_CHARS ? 1 : 0;
}

/**
 * Words of a display string that a query matches (for highlighting): every whitespace-separated
 * word that starts with a query word (or a synonym of it); when nothing starts with it and the
 * whole query occurs inside the normalised string, the words that contain query words.
 */
export function matchedWords(display: string, query: string): boolean[] {
  const nq = normalizeSearch(query);
  const qWords = nq ? nq.split(' ') : [];
  const expanded = qWords.map(expand);
  const words = display.split(/\s+/);
  const normalized = words.map((w) => normalizeSearch(w));
  const flags = normalized.map((n) => n.length > 0 && expanded.some((prefixes) => startsWithAny(n, prefixes)));
  if (!flags.some(Boolean) && nq.length >= 3 && normalizeSearch(display).includes(nq)) {
    return normalized.map((nw) => nw.length > 0 && (qWords.some((q) => nw.includes(q)) || nq.includes(nw)));
  }
  return flags;
}
