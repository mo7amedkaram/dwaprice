import 'server-only';
// The live suggestion index, built from the public web.* views and cached under the 'search-index'
// tag. Shared by /search-index/current.json (serves it) and /search-index/version.json (reports its
// hash), so both see the same build and the same version token. Rebuilt the moment the catalogue
// changes (revalidateTag('search-index')) or, with no webhook, after REBUILD_SECONDS on the next
// request. Not imported by the build script (that path has no Next runtime).
//
// What is cached is small ON PURPOSE. Next's data cache silently refuses entries over 2 MB: it logs
// "items over 2MB can not be cached" and returns without storing, so the value is rebuilt on EVERY
// request — the raw 2.6 MB index JSON hit exactly that in production (~7 s and ~20 queries per
// search-box focus). So the cached value is the brotli-compressed index as base64 (~0.65 MB for
// 16.5k drugs; ~3x headroom) plus the version fields. The route serves the brotli bytes directly
// and derives gzip/identity per hash in process memory for the rare client without brotli.
import { brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { tags } from '@/lib/cache';
import { buildIndexFromDb } from './search-index-build';

const brotli = promisify(brotliCompress);

/** 15-minute freshness ceiling even if no revalidation webhook ever fires. */
export const REBUILD_SECONDS = 900;

/** The cached live index: version fields plus the compressed body (kept under Next's 2 MB entry limit). */
export interface CurrentIndex {
  /** First 12 hex of sha256(json): the version token (= current.json?v=, = the ETag). */
  hash: string;
  /** Number of drugs in the index. */
  drugs: number;
  /** When this build was produced (ISO). */
  generatedAt: string;
  /** brotli(json) as base64. */
  br: string;
}

export const getCurrentIndex: () => Promise<CurrentIndex> = unstable_cache(
  async () => {
    const built = await buildIndexFromDb(query);
    const raw = Buffer.from(built.json, 'utf8');
    // Asynchronous (zlib threadpool) and once per rebuild: never on the request path, never blocking
    // the event loop. Quality 9 compresses 2.6 MB in well under a second.
    const compressed = await brotli(raw, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
    });
    return { hash: built.hash, drugs: built.drugs, generatedAt: built.generatedAt, br: compressed.toString('base64') };
  },
  ['search-index-current-v2'],
  { tags: [tags.searchIndex], revalidate: REBUILD_SECONDS },
);
