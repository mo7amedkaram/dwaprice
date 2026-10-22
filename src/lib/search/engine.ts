// In-browser suggestion engine over the static index (runs inside the search worker; pure, so
// tests/search-engine.test.ts exercises it directly).
//
// Match tiers, best first (the order asked for by the brief, mirroring web.search_drugs):
//   0 exact        the whole Arabic or English name equals the query
//   1 name prefix  a name starts with the query
//   2 word prefix  every query word starts a word of a name, any order ("اوجمنتين 1g")
//   3 alias        … with the help of alias tokens (price-list spelling "f c tab", variants)
//   4 ingredient   the query starts an ingredient name, or its words start ingredient words
//   5 substring    the query occurs inside a name (3+ characters)
//   6 fuzzy        1 typo per word of 4+ characters, 2 per word of 8+ (prefix edit distance,
//                  adjacent transposition = 1); only tried when tiers 0-5 found too few
// Ties: popularity bucket (desc), shorter Arabic name, English name. Units are matched across
// scripts and spellings (g = gm = جم, mg = مجم, ml = مل …) so mixed input works.
// No file in this folder may import server-only code: it is bundled into the search worker.
import type { SearchIndexFile, Suggestion } from './index-format';
import { normalizeSearch, searchTokens } from './normalize';

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

interface Doc {
  i: number;
  nar: string;
  nen: string;
  /** Distinct normalised words of both names. */
  words: string[];
  /** words + alias tokens (index.dt); same array as `words` when there are no aliases. */
  named: string[];
  /** words of the ingredient names (index.di), flattened. */
  ingWords: string[];
  /** words + alias + ingredient words. */
  all: string[];
  /** Ingredient ids (index.ing). */
  ings: number[];
  pop: number;
  len: number;
}

interface Hit {
  doc: Doc;
  tier: number;
  /** Ingredient id that matched (tier 4), else -1. */
  ingredient: number;
  /** Fuzzy pass: total edit distance (lower first). */
  distance: number;
}

/** A query word expanded with its unit/form synonyms. */
function expand(token: string): string[] {
  const group = SYNONYMS.get(token);
  return group ? [token, ...group.filter((t) => t !== token)] : [token];
}

function startsWithAny(word: string, prefixes: string[]): boolean {
  for (let i = 0; i < prefixes.length; i++) if (word.startsWith(prefixes[i])) return true;
  return false;
}

/** Every query word (already expanded) starts some word of `words`. */
function covered(expanded: string[][], words: string[]): boolean {
  for (let j = 0; j < expanded.length; j++) {
    const prefixes = expanded[j];
    let found = false;
    for (let w = 0; w < words.length && !found; w++) found = startsWithAny(words[w], prefixes);
    if (!found) return false;
  }
  return true;
}

/**
 * Smallest edit distance (Levenshtein + adjacent transposition) between `q` and any prefix of
 * `t` that is at least |q| - k long; returns k + 1 when every candidate is further than k.
 */
export function prefixDistance(q: string, t: string, k: number): number {
  const m = q.length;
  const n = t.length;
  if (n < m - k) return k + 1;
  let prev2: number[] = [];
  let prev: number[] = [];
  for (let j = 0; j <= n; j++) prev.push(j); // row 0: q empty vs t prefix of length j
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (q[i - 1] === t[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && q[i - 1] === t[j - 2] && q[i - 2] === t[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > k) return k + 1; // every later row is at least as far
    prev2 = prev;
    prev = cur;
  }
  let best = k + 1;
  for (let j = Math.max(0, m - k); j <= n; j++) if (prev[j] < best) best = prev[j];
  return best;
}

/** Typos allowed for a query word of this length (the brief's rule). */
export function allowedTypos(length: number): number {
  return length >= 8 ? 2 : length >= FUZZY_MIN_CHARS ? 1 : 0;
}

/**
 * Cheap pre-filter before the edit distance: the two words share their first letter, or the
 * first two letters are swapped / one inserted, or only the first letter differs (b/p for
 * Arabic speakers: "banadol").
 */
function fuzzyCandidate(q: string, w: string): boolean {
  return w[0] === q[0] || w[1] === q[0] || w[0] === q[1] || w[1] === q[1];
}

export class SearchEngine {
  readonly size: number;
  private readonly docs: Doc[] = [];
  private readonly ingNorm: string[];
  private readonly ingWords: string[][];

  constructor(private readonly index: SearchIndexFile) {
    this.size = index.n;
    this.ingNorm = index.ing.map((name) => normalizeSearch(name));
    this.ingWords = this.ingNorm.map((n) => (n ? n.split(' ') : []));
    for (let i = 0; i < index.n; i++) {
      const nar = normalizeSearch(index.ar[i]);
      const nen = normalizeSearch(index.en[i]);
      const words = [...new Set([...(nar ? nar.split(' ') : []), ...(nen ? nen.split(' ') : [])])];
      const alias = index.dt[i].map((t) => index.tok[t]);
      const named = alias.length ? words.concat(alias) : words;
      const ingWords = index.di[i].length ? [...new Set(index.di[i].flatMap((id) => this.ingWords[id]))] : [];
      this.docs.push({ i, nar, nen, words, named, ingWords, all: ingWords.length ? named.concat(ingWords) : named, ings: index.di[i], pop: index.pop[i], len: nar.length || nen.length });
    }
  }

  /** Suggestions for a raw query, best first. */
  search(query: string, limit = SUGGESTION_LIMIT): Suggestion[] {
    const nq = normalizeSearch(query);
    if (nq.length < MIN_QUERY_CHARS) return [];
    const qt = nq.split(' ');
    const expanded = qt.map(expand);
    // Two characters match names only (as web.search_drugs does): aliases, ingredients and
    // substrings would flood the list with unrelated products.
    const namesOnly = nq.length < 3;
    const hits: Hit[] = [];
    const docs = this.docs;
    for (let d = 0; d < docs.length; d++) {
      const doc = docs[d];
      // Quick reject: every tier needs the first query word (or the whole query) somewhere in the doc.
      if (!covered(expanded, namesOnly ? doc.words : doc.all) && !(nq.length >= 3 && (doc.nar.includes(nq) || doc.nen.includes(nq)))) continue;
      const tier = this.strictTier(doc, nq, qt, expanded, namesOnly);
      if (tier.tier >= 0) hits.push({ doc, tier: tier.tier, ingredient: tier.ingredient, distance: 0 });
    }
    if (hits.length < limit && qt.some((t) => t.length >= FUZZY_MIN_CHARS)) {
      const matched = new Set(hits.map((h) => h.doc));
      for (let d = 0; d < docs.length; d++) {
        const doc = docs[d];
        if (matched.has(doc)) continue;
        const distance = this.fuzzyDistance(doc, qt, expanded);
        if (distance > 0) hits.push({ doc, tier: TIER.fuzzy, ingredient: -1, distance });
      }
    }
    hits.sort((a, b) => a.tier - b.tier || a.distance - b.distance || b.doc.pop - a.doc.pop || a.doc.len - b.doc.len || (a.doc.nen < b.doc.nen ? -1 : a.doc.nen > b.doc.nen ? 1 : 0));
    return hits.slice(0, limit).map((h) => this.suggestion(h));
  }

  private strictTier(doc: Doc, nq: string, qt: string[], expanded: string[][], namesOnly: boolean): { tier: number; ingredient: number } {
    if (doc.nar === nq || doc.nen === nq) return { tier: TIER.exact, ingredient: -1 };
    if (doc.nar.startsWith(nq) || doc.nen.startsWith(nq)) return { tier: TIER.namePrefix, ingredient: -1 };
    if (covered(expanded, doc.words)) return { tier: TIER.wordPrefix, ingredient: -1 };
    if (namesOnly) return { tier: -1, ingredient: -1 };
    if (doc.named !== doc.words && covered(expanded, doc.named)) return { tier: TIER.alias, ingredient: -1 };
    if (doc.ings.length) {
      for (let x = 0; x < doc.ings.length; x++) if (this.ingNorm[doc.ings[x]].startsWith(nq)) return { tier: TIER.ingredient, ingredient: doc.ings[x] };
      if (covered(expanded, doc.all)) {
        // report the ingredient that supplies the first query word
        const id = doc.ings.find((x) => this.ingWords[x].some((w) => startsWithAny(w, expanded[0]))) ?? doc.ings[0];
        return { tier: TIER.ingredient, ingredient: id };
      }
    }
    if (nq.length >= 3 && (doc.nar.includes(nq) || doc.nen.includes(nq))) return { tier: TIER.substring, ingredient: -1 };
    return { tier: -1, ingredient: -1 };
  }

  /** Total edit distance of a fuzzy match (every query word within its typo budget), 0 when not a fuzzy match. */
  private fuzzyDistance(doc: Doc, qt: string[], expanded: string[][]): number {
    const words = doc.all;
    let total = 0;
    for (let j = 0; j < qt.length; j++) {
      const q = qt[j];
      const k = allowedTypos(q.length);
      let best = k + 1;
      for (let w = 0; w < words.length && best > 0; w++) {
        const word = words[w];
        if (startsWithAny(word, expanded[j])) best = 0;
        else if (k > 0 && word.length >= q.length - k && fuzzyCandidate(q, word)) {
          const d = prefixDistance(q, word, k);
          if (d < best) best = d;
        }
      }
      if (best > k) return 0;
      total += best;
    }
    return total; // 0 = every word matched by prefix, which the strict tiers already rejected (e.g. unit words only)
  }

  private suggestion(h: Hit): Suggestion {
    const { index } = this;
    const i = h.doc.i;
    return {
      slug: index.slug[i],
      ar: index.ar[i],
      en: index.en[i],
      form: index.form[i] >= 0 ? index.forms[index.form[i]] : null,
      ingredient: h.ingredient >= 0 ? index.ing[h.ingredient] : null,
      tier: h.tier,
    };
  }
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

export { searchTokens };
