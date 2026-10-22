// The few constants the search box needs before the suggestion code is loaded. Tiny on purpose:
// SearchBox imports only this synchronously, and pulls the engine/client (lib/search/suggest.ts)
// lazily on the first focus/hover, so none of the search machinery is on the first page load.

export const MIN_QUERY_CHARS = 2;
export const MAX_QUERY_CHARS = 80;

/** A match at this tier or better (see engine-shared TIER) is strong enough to pre-select after voice. */
export const PRESELECT_MAX_TIER = 3; // alias
