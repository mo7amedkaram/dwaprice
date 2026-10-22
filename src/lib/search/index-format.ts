// The browser suggestion index: one static JSON file, columnar (one array per column, short
// keys, dictionaries for repeated strings), generated at build time by scripts/build-search-index.ts
// from the public web.* views and served at /search-index/<file> (content-hashed name,
// immutable). It carries ONLY what the suggestions need: names to show, the dosage form, the
// slug to navigate to, popularity as a small bucket, and the search keys (ingredient names and
// alias tokens, normalised in the browser with lib/search/normalize.ts).
// Never in this file: prices, barcodes, companies, counters, internal ids
// (tests/search-index.test.ts fails the build if any of those appear).
// No file in this folder may import server-only code: it is bundled into the search worker.

export const SEARCH_INDEX_VERSION = 1;

/** URL path of the current index file (`${SEARCH_INDEX_PATH}/${file}`). */
export const SEARCH_INDEX_PATH = '/search-index';

/** File names the route serves: "index.<content hash>.json". */
export const SEARCH_INDEX_FILE_RE = /^index\.[0-9a-f]{8,16}\.json$/;

export interface SearchIndexFile {
  v: typeof SEARCH_INDEX_VERSION;
  /** Number of drugs (= length of every per-drug column). */
  n: number;
  /** Dosage forms in Arabic, as shown in a suggestion row (dictionary). */
  forms: string[];
  /** Ingredient names, English and Arabic entries (dictionary; a search key after normalisation). */
  ing: string[];
  /** Extra normalised alias tokens not present in the two names (dictionary). */
  tok: string[];
  /** Per drug: URL slug. */
  slug: string[];
  /** Per drug: Arabic trade name (every indexable drug has one). */
  ar: string[];
  /** Per drug: English trade name. */
  en: string[];
  /** Per drug: index into `forms`, -1 when unknown. */
  form: number[];
  /** Per drug: popularity bucket 0 (none) … 5 (most visited/searched); never a raw count. */
  pop: number[];
  /** Per drug: indexes into `ing`. */
  di: number[][];
  /** Per drug: indexes into `tok`. */
  dt: number[][];
}

/** The only keys an index file may have, in this order. */
export const SEARCH_INDEX_KEYS: ReadonlyArray<keyof SearchIndexFile> = ['v', 'n', 'forms', 'ing', 'tok', 'slug', 'ar', 'en', 'form', 'pop', 'di', 'dt'];

/** What the generator writes next to the index file; next.config.ts turns `file` into a build constant. */
export interface SearchIndexManifest {
  file: string;
  hash: string;
  version: number;
  drugs: number;
  bytes: { raw: number; gzip: number; brotli: number };
  generatedAt: string;
}

/** One suggestion as the search box shows it (from the index or from /api/search). */
export interface Suggestion {
  slug: string;
  ar: string;
  en: string;
  form: string | null;
  /** The ingredient that matched, when the match came through an ingredient. */
  ingredient: string | null;
  /** Match tier (lib/search/engine.ts), lower is better; -1 for server results. */
  tier: number;
}
