import 'server-only';
import { query } from '@/lib/db';
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
 */
export async function searchDrugs(q: string, limit = 10, offset = 0): Promise<SearchHit[]> {
  return query<SearchHit>(
    'select slug, name_ar, name_en, strength, dosage_form_ar, current_price, match_rank from web.search_drugs($1, $2, $3)',
    [q, limit, offset],
  );
}
