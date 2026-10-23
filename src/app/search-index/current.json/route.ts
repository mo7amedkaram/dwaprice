import { brotliDecompress, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { NextRequest } from 'next/server';
import { getCurrentIndex, type CurrentIndex } from '@/lib/data/search-index-current';
import { IMMUTABLE, pickEncoding } from '@/lib/search/http';

// Live browser suggestion index, built from the public web.* views (same compact, privacy-safe
// format as the build-time file: names, form, ingredients, popularity bucket — never prices,
// barcodes, companies or counters). getCurrentIndex is a tagged cache holding the index already
// brotli-compressed (under Next's 2 MB entry limit), so it is built at most once per window and
// rebuilt the moment the catalogue changes (revalidateTag('search-index') from /api/revalidate) or,
// failing any webhook, within its 15-minute ceiling. The client fetches it as current.json?v=<hash>
// (see version.json): the content hash makes each version its own immutable URL that the worker
// caches in the browser. If this route fails, the client falls back to the build-time static file,
// so suggestions never go away.
export const dynamic = 'force-dynamic';

const inflate = promisify(brotliDecompress);
const deflate = promisify(gzip);

// Per content hash, in process memory: the brotli bytes decoded once from the cached base64 and,
// only if a client without brotli ever asks, the identity and gzip bodies derived from them. Kept
// as promises so concurrent first requests share one derivation. The two most recent hashes are
// retained so a version change never misses.
interface Bodies {
  br: Buffer;
  raw?: Promise<Buffer>;
  gz?: Promise<Buffer>;
}
const bodies = new Map<string, Bodies>();

function bodiesFor(built: CurrentIndex): Bodies {
  let b = bodies.get(built.hash);
  if (!b) {
    b = { br: Buffer.from(built.br, 'base64') };
    bodies.set(built.hash, b);
    while (bodies.size > 2) bodies.delete(bodies.keys().next().value as string);
  }
  return b;
}

export async function GET(request: NextRequest) {
  let built: CurrentIndex;
  try {
    built = await getCurrentIndex();
  } catch {
    // Database trouble: tell the client to use the build-time static index instead.
    return new Response('index unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  // The URL names a version (?v=<hash>). When it is not the version we hold (version.json may have
  // been cached up to 60 s before a rebuild) still answer with the current content, but never let a
  // cache store it under the other version's URL: each ?v= URL must stay genuinely immutable.
  const requested = request.nextUrl.searchParams.get('v');
  const cacheControl = requested === null || requested === built.hash ? IMMUTABLE : 'no-store';
  const etag = `"${built.hash}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } });
  }
  const b = bodiesFor(built);
  const encoding = pickEncoding(request.headers.get('accept-encoding'));
  let body: Buffer;
  if (encoding === 'br') {
    body = b.br;
  } else {
    b.raw ??= inflate(b.br);
    if (encoding === 'gzip') {
      b.gz ??= b.raw.then((raw) => deflate(raw, { level: 9 }));
      body = await b.gz;
    } else {
      body = await b.raw;
    }
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.byteLength),
    'Cache-Control': cacheControl,
    ETag: etag,
    Vary: 'Accept-Encoding',
  };
  if (encoding) headers['Content-Encoding'] = encoding;
  return new Response(body as BodyInit, { headers });
}
