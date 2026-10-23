// HTTP helpers shared by the suggestion-index routes (src/app/search-index/*). Pure (no node
// imports): this folder is bundled into the search worker, so nothing here may be server-only.

/** A content-addressed response: cache for a year, never revalidate. */
export const IMMUTABLE = 'public, max-age=31536000, immutable';

/** br > gzip > identity, from the request's Accept-Encoding. */
export function pickEncoding(accept: string | null): 'br' | 'gzip' | null {
  if (!accept) return null;
  if (/(^|,)\s*br\s*(;|,|$)/.test(accept)) return 'br';
  if (/(^|,)\s*gzip\s*(;|,|$)/.test(accept)) return 'gzip';
  return null;
}
