import 'server-only';
// The live suggestion index, built from the public web.* views and cached under the 'search-index'
// tag. Shared by /search-index/current.json (serves it) and /search-index/version.json (reports its
// hash), so both see the same build and the same version token. Rebuilt the moment the catalogue
// changes (revalidateTag('search-index')) or, with no webhook, after REBUILD_SECONDS on the next
// request. Not imported by the build script (that path has no Next runtime).
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { tags } from '@/lib/cache';
import { buildIndexFromDb, type BuiltIndex } from './build-from-db';

/** 15-minute freshness ceiling even if no revalidation webhook ever fires. */
export const REBUILD_SECONDS = 900;

export const getCurrentIndex: () => Promise<BuiltIndex> = unstable_cache(() => buildIndexFromDb(query), ['search-index-current-v1'], {
  tags: [tags.searchIndex],
  revalidate: REBUILD_SECONDS,
});
