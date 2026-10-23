import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';
import { IMMUTABLE, pickEncoding } from '@/lib/search/http';
import { SEARCH_INDEX_FILE_RE, type SearchIndexManifest } from '@/lib/search/index-format';

// Serves the suggestion index generated at build time (scripts/build-search-index.mts →
// data/search-index/, copied into the release by .github/workflows/deploy.yml). The file name
// carries a content hash, so it is immutable for a year; only the current version is served
// (older names 404). The pre-compressed .br / .gz variants are picked from Accept-Encoding, which
// gives brotli even though Nginx/Next only gzip on the fly. Files are read once per process.
export const dynamic = 'force-dynamic';

const DIR = join(process.cwd(), 'data', 'search-index');
const files = new Map<string, Promise<Uint8Array<ArrayBuffer> | null>>();
let manifest: Promise<SearchIndexManifest | null> | null = null;

function load(name: string): Promise<Uint8Array<ArrayBuffer> | null> {
  let p = files.get(name);
  if (!p) {
    p = readFile(join(DIR, name))
      .then((buf) => {
        const out = new Uint8Array(buf.byteLength);
        out.set(buf);
        return out;
      })
      .catch(() => null);
    files.set(name, p);
  }
  return p;
}

function currentManifest(): Promise<SearchIndexManifest | null> {
  manifest ??= readFile(join(DIR, 'manifest.json'), 'utf8')
    .then((text) => JSON.parse(text) as SearchIndexManifest)
    .catch(() => null);
  return manifest;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const current = await currentManifest();
  if (!SEARCH_INDEX_FILE_RE.test(file) || !current || current.file !== file) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  let encoding = pickEncoding(request.headers.get('accept-encoding'));
  let body = encoding ? await load(encoding === 'br' ? `${file}.br` : `${file}.gz`) : null;
  if (!body) {
    encoding = null;
    body = await load(file);
  }
  if (!body) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.byteLength),
    'Cache-Control': IMMUTABLE,
    Vary: 'Accept-Encoding',
  };
  if (encoding) headers['Content-Encoding'] = encoding;
  return new Response(body, { headers });
}
