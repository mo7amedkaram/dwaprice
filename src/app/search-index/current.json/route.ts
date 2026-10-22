import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { NextRequest } from 'next/server';
import { getCurrentIndex } from '@/lib/search/current-index';
import type { BuiltIndex } from '@/lib/search/build-from-db';

// Live browser suggestion index, built from the public web.* views (same compact, privacy-safe
// format as the build-time file: names, form, ingredients, popularity bucket — never prices,
// barcodes, companies or counters). getCurrentIndex is a tagged cache, so it is built at most once
// per window and rebuilt the moment the catalogue changes (revalidateTag('search-index') from
// /api/revalidate) or, failing any webhook, within its 15-minute ceiling. The client fetches it as
// current.json?v=<hash> (see version.json), so the content hash makes each version a new,
// immutable URL that the worker caches in the browser. If this route ever fails, the client
// falls back to the build-time static file, so suggestions never go away.
export const dynamic = 'force-dynamic';

const IMMUTABLE = 'public, max-age=31536000, immutable';

// Pre-compressed variants, in process memory, keyed by content hash: compressed once per rebuild,
// not per request. Keep the two most recent hashes so a version change never misses.
interface Variants {
  raw: Uint8Array;
  gz: Uint8Array;
  br: Uint8Array;
}
const variants = new Map<string, Variants>();

function variantsFor(built: BuiltIndex): Variants {
  const have = variants.get(built.hash);
  if (have) return have;
  const raw = Buffer.from(built.json, 'utf8');
  const v: Variants = {
    raw,
    gz: gzipSync(raw, { level: 9 }),
    br: brotliCompressSync(raw, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
    }),
  };
  variants.set(built.hash, v);
  while (variants.size > 2) variants.delete(variants.keys().next().value as string);
  return v;
}

/** br > gzip > identity, from the request's Accept-Encoding. */
function pickEncoding(accept: string | null): 'br' | 'gzip' | null {
  if (!accept) return null;
  if (/(^|,)\s*br\s*(;|,|$)/.test(accept)) return 'br';
  if (/(^|,)\s*gzip\s*(;|,|$)/.test(accept)) return 'gzip';
  return null;
}

export async function GET(request: NextRequest) {
  let built: BuiltIndex;
  try {
    built = await getCurrentIndex();
  } catch {
    // Database trouble: tell the client to use the build-time static index instead.
    return new Response('index unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const etag = `"${built.hash}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': IMMUTABLE } });
  }
  const v = variantsFor(built);
  const encoding = pickEncoding(request.headers.get('accept-encoding'));
  const body = encoding === 'br' ? v.br : encoding === 'gzip' ? v.gz : v.raw;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.byteLength),
    'Cache-Control': IMMUTABLE,
    ETag: etag,
    Vary: 'Accept-Encoding',
  };
  if (encoding) headers['Content-Encoding'] = encoding;
  return new Response(body as BodyInit, { headers });
}
