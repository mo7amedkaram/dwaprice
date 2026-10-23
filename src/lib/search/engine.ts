// The heavy half of the search engine: the SearchEngine class that indexes the drugs and
// answers queries. Imported only by the worker (lib/search/search.worker.ts) and the tests, so
// it never reaches the first page load; the main thread uses lib/search/engine-shared.ts.
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
// Two characters match names only (as the server does). Ties: popularity bucket (desc), shorter
// Arabic name, English name. Units match across scripts and spellings (g = gm = جم …).
import type { SearchIndexFile, Suggestion } from './index-format';
import { normalizeSearch } from './normalize';
import { allowedTypos, covered, expand, FUZZY_MIN_CHARS, isPackToken, MIN_QUERY_CHARS, startsWithAny, SUGGESTION_LIMIT, TIER } from './engine-shared';
import { coveredChars, isWildcardQuery, parseWildcard, WILDCARD_ANCHORED_MIN, type WildcardPattern } from './wildcard';

interface Doc {
  i: number;
  nar: string;
  nen: string;
  /** Distinct normalised words of both names. */
  words: string[];
  /** words + alias tokens (index.dt); same array as `words` when there are no aliases. */
  named: string[];
  /** words + alias + ingredient words. */
  all: string[];
  /** Ingredient ids (index.ing). */
  ings: number[];
  pop: number;
  len: number;
  /** Wildcard anchored tier: first word of each name + the alias tokens. */
  firstWords: string[];
  /** Wildcard any-word tier: `named` minus strength / pack / form words. */
  brandWords: string[];
}

interface Hit {
  doc: Doc;
  tier: number;
  /** Ingredient id that matched (tier 4), else -1. */
  ingredient: number;
  /** Fuzzy pass: total edit distance (lower first). */
  distance: number;
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

/** Two words share their first letter, or the first two are swapped / one differs (b/p: "banadol"). */
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
      const firstWords = [...new Set([nen.split(' ')[0], nar.split(' ')[0], ...alias].filter(Boolean))];
      this.docs.push({
        i, nar, nen, words, named, all: ingWords.length ? named.concat(ingWords) : named, ings: index.di[i], pop: index.pop[i], len: nar.length || nen.length,
        firstWords,
        brandWords: named.filter((w) => !isPackToken(w)),
      });
    }
  }

  /** Suggestions for a raw query, best first. */
  search(query: string, limit = SUGGESTION_LIMIT): Suggestion[] {
    if (isWildcardQuery(query)) {
      const p = parseWildcard(query);
      return p.ok ? this.wildcardSearch(p.pattern, limit) : [];
    }
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
      const tier = this.strictTier(doc, nq, expanded, namesOnly);
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

  /**
   * Wildcard query: the pattern against the first word of each name (+ alias tokens); when that finds
   * fewer than WILDCARD_ANCHORED_MIN products, also against any brand word. Closest matches first
   * (fewest characters covered by the wildcards), then popularity.
   */
  private wildcardSearch(p: WildcardPattern, limit: number): Suggestion[] {
    const re = p.regex;
    const hits: Array<{ doc: Doc; tier: number; covered: number }> = [];
    const matched = new Set<Doc>();
    const tryWords = (tier: number, pick: (d: Doc) => string[]) => {
      for (const doc of this.docs) {
        if (matched.has(doc)) continue;
        let best = -1;
        for (const w of pick(doc)) {
          if (!re.test(w)) continue;
          const c = coveredChars(p, w);
          if (best < 0 || c < best) best = c;
        }
        if (best >= 0) {
          hits.push({ doc, tier, covered: best });
          matched.add(doc);
        }
      }
    };
    tryWords(0, (d) => d.firstWords);
    if (hits.length < WILDCARD_ANCHORED_MIN) tryWords(1, (d) => d.brandWords);
    hits.sort((a, b) => a.tier - b.tier || a.covered - b.covered || b.doc.pop - a.doc.pop || a.doc.len - b.doc.len || (a.doc.nen < b.doc.nen ? -1 : a.doc.nen > b.doc.nen ? 1 : 0));
    return hits.slice(0, limit).map((h) => this.suggestion({ doc: h.doc, tier: TIER.wildcard, ingredient: -1, distance: 0 }));
  }

  private strictTier(doc: Doc, nq: string, expanded: string[][], namesOnly: boolean): { tier: number; ingredient: number } {
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

export { allowedTypos, matchedWords, MIN_QUERY_CHARS, SUGGESTION_LIMIT, TIER } from './engine-shared';
export { searchTokens } from './normalize';
