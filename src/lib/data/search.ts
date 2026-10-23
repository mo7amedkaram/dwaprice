import 'server-only';
import { query } from '@/lib/db';
import { coveredChars, isWildcardQuery, parseWildcard, toSqlWildcard, WILDCARD_ANCHORED_MIN, type WildcardPattern } from '@/lib/search/wildcard';
import type { SearchHit } from './types';

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 80;

/** Trims, collapses spaces and enforces length limits; null when unusable. */
export function cleanQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX_LENGTH);
  return q.length >= SEARCH_MIN_LENGTH ? q : null;
}

/**
 * Products matching a query, best first, from web.search_drugs (migration 0039):
 *   0 exact name, 1 name prefix, 2 other alias prefix (ingredient, company,
 *   barcode, approved variant), 3 every word in any order, 4 same consonant
 *   skeleton (vowel letters ignored: بروفن -> بروفين), 5 trigram similarity
 *   (typos: اوجمنتن -> اوجمنتين). Tiers 4-5 only run when 0-3 found too few.
 * ا/أ/إ/آ, ى/ي, ة/ه and diacritics are unified on both sides by
 * medicine_search_normalize. Ties: indexable first, then most visited.
 * A wildcard query ("Au*in", "Br?fen") takes the pattern path below instead.
 */
export async function searchDrugs(q: string, limit = 10, offset = 0): Promise<SearchHit[]> {
  if (isWildcardQuery(q)) return searchDrugsWildcard(q, limit, offset);
  return query<SearchHit>(
    'select slug, name_ar, name_en, strength, dosage_form_ar, current_price, match_rank from web.search_drugs($1, $2, $3)',
    [q, limit, offset],
  );
}

// ---------------------------------------------------------------- wildcard (server fallback)
//
// Same rules as the browser engine (lib/search/wildcard.ts), as SQL. The pattern is built from the
// parsed tokens only — literals escaped, hamza/ta-marbuta/alef-maqsura variants as character classes —
// so nothing typed ever reaches Postgres as a regex. Measured on the live database (16.5k rows):
//   tier 0  first word of the English (sort_name, lower-cased) or Arabic name     ~110 ms
//   tier 1  any brand word of either name (only when tier 0 found < 3)            ~110 ms
//   tier 2  approved aliases through web.search_index, only with a LIKE prefix    ~370 ms
//           (the view's unfiltered scan is several seconds: never run it without the prefix)
// The slow web.search_normalize() is deliberately not used per row (4 s over the table).

interface WildcardRow extends SearchHit {
  pop: string | number | null;
  w_en: string | null;
  w_ar: string | null;
}
interface AliasRow extends SearchHit {
  w: string | null;
}

const COLS = 'c.slug, c.name_ar, c.name_en, c.strength, c.dosage_form_ar, c.current_price';

async function searchDrugsWildcard(q: string, limit: number, offset: number): Promise<SearchHit[]> {
  const parsed = parseWildcard(q);
  if (!parsed.ok) return [];
  const p = parsed.pattern;
  const sql = toSqlWildcard(p);
  const hits = new Map<string, { hit: SearchHit; tier: number; covered: number; pop: number }>();
  const add = (tier: number, row: SearchHit & { pop?: string | number | null }, word: string | null) => {
    if (hits.has(row.slug) || !word) return;
    const { pop, ...rest } = row as SearchHit & { pop?: string | number | null; w_en?: unknown; w_ar?: unknown; w?: unknown };
    delete (rest as { w_en?: unknown }).w_en;
    delete (rest as { w_ar?: unknown }).w_ar;
    delete (rest as { w?: unknown }).w;
    hits.set(row.slug, { hit: { ...rest, match_rank: tier }, tier, covered: coveredChars(p, word), pop: Number(pop ?? 0) || 0 });
  };
  const bestWord = (r: WildcardRow) => {
    const en = r.w_en ? coveredChars(p, r.w_en) : Infinity;
    const ar = r.w_ar ? coveredChars(p, r.w_ar) : Infinity;
    return en <= ar ? r.w_en : r.w_ar;
  };

  const names = (re: { en: string; ar: string }) =>
    query<WildcardRow>(
      `select ${COLS}, coalesce(p.visit_count, 0) as pop, substring(c.sort_name from $1) as w_en, substring(c.name_ar from $2) as w_ar
       from web.drug_cards c left join web.popular_drugs p on p.slug = c.slug
       where c.indexable and (c.sort_name ~ $1 or c.name_ar ~ $2) limit 200`,
      [re.en, re.ar],
    );

  try {
    for (const r of await names({ en: sql.anchored, ar: sql.anchored })) add(0, r, bestWord(r));
    if (hits.size < WILDCARD_ANCHORED_MIN) {
      for (const r of await names({ en: sql.anyWord, ar: sql.anyWord })) add(1, r, bestWord(r));
    }
    if (hits.size < WILDCARD_ANCHORED_MIN && sql.likePrefix) {
      const rows = await query<AliasRow>(
        `select distinct on (si.slug) si.slug, si.name_ar, si.name_en, si.strength, si.dosage_form_ar, si.current_price, 0 as match_rank,
                split_part(si.normalized_alias, ' ', 1) as w
         from web.search_index si
         where si.indexable and si.normalized_alias like $1 and split_part(si.normalized_alias, ' ', 1) ~ $2
         order by si.slug limit 100`,
        [sql.likePrefix, sql.normalizedAnchored],
      );
      for (const r of rows) add(2, r, r.w);
    }
  } catch (error) {
    // A pattern the planner cannot run inside the statement timeout: no results rather than a 500.
    console.error('wildcard search failed', (error as Error).message);
    return [...hits.values()].map((h) => h.hit).slice(offset, offset + limit);
  }
  return [...hits.values()]
    .sort((a, b) => a.tier - b.tier || a.covered - b.covered || b.pop - a.pop || a.hit.name_en.localeCompare(b.hit.name_en, 'en'))
    .slice(offset, offset + limit)
    .map((h) => h.hit);
}

export type { WildcardPattern };
