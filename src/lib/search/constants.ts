// The few constants the search box needs before the suggestion code is loaded. Tiny on purpose:
// SearchBox imports only this synchronously, and pulls the engine/client (lib/search/suggest.ts)
// lazily on the first focus/hover, so none of the search machinery is on the first page load.

export const MIN_QUERY_CHARS = 2;
export const MAX_QUERY_CHARS = 80;

/** A match at this tier or better (see engine-shared TIER) is strong enough to pre-select after voice. */
export const PRESELECT_MAX_TIER = 3; // alias

/**
 * Is this a wildcard query? `?` = one character, `*` (or the Arabic star ٭) = any — EXCEPT a star whose
 * next non-space character is a digit: that is the multiplication sign of pack names ("30 * 0.7 مل",
 * "20*0.4مل", "2جي*50 كيس"), which must keep the normal search. The Arabic question mark ؟ is not a
 * wildcard: it ends ordinary questions ("بنادول؟"). Tiny and dependency-free: SearchBox needs it
 * synchronously; lib/search/wildcard.ts re-exports it.
 */
export function isWildcardQuery(raw: string | null | undefined): boolean {
  if (!raw) return false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '?') return true;
    if (ch !== '*' && ch !== '٭') continue;
    let j = i + 1;
    while (j < raw.length && raw[j] === ' ') j++;
    const next = raw[j];
    if (next !== undefined && /[0-9٠-٩۰-۹]/.test(next)) continue; // multiplication, not a wildcard
    return true;
  }
  return false;
}
/** The hint under the search box is shown on the first N focuses only (per browser, localStorage). */
export const WILDCARD_HINT_SHOWS = 3;
export const WILDCARD_HINT_KEY = 'dw-wildcard-hint';
export const WILDCARD_HINT = 'مش قاري الاسم كله؟ اكتب الحروف اللي عارفها وحط * مكان الباقي، مثال: Au*in';
