// Generates the browser suggestion index at build time (npm run build = this, then next build):
//   data/search-index/index.<hash>.json  (+ .gz and .br, pre-compressed)
//   data/search-index/manifest.json      (next.config.ts inlines `file` as NEXT_PUBLIC_SEARCH_INDEX)
// This file is only the FIRST-LOAD FALLBACK now: in production the browser loads the live
// /search-index/current.json, which rebuilds from the database within minutes of a change. Both are
// built by the same code (src/lib/search/build-from-db.ts) from the same public web.* views with
// the read-only role (WEB_DATABASE_URL), so they are byte-identical for the same data.
// usage: npx tsx scripts/build-search-index.mts      (fails the build on any error)
import nextEnv from '@next/env';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

nextEnv.loadEnvConfig(process.cwd());

const { pool, query } = await import('../src/lib/db/pool');
const { buildIndexFromDb } = await import('../src/lib/search/build-from-db');
const { SEARCH_INDEX_VERSION } = await import('../src/lib/search/index-format');
type SearchIndexManifest = import('../src/lib/search/index-format').SearchIndexManifest;

const OUT_DIR = join(process.cwd(), 'data', 'search-index');
const started = performance.now();
const log = (msg: string) => console.log(`[search-index] ${msg}`);

try {
  const { json, hash, drugs } = await buildIndexFromDb(query);
  const raw = Buffer.from(json, 'utf8');
  const file = `index.${hash}.json`;
  const gz = gzipSync(raw, { level: 9 });
  const br = brotliCompressSync(raw, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
  });

  mkdirSync(OUT_DIR, { recursive: true });
  for (const old of readdirSync(OUT_DIR)) if (old.startsWith('index.') && !old.startsWith(`index.${hash}.`)) rmSync(join(OUT_DIR, old));
  writeFileSync(join(OUT_DIR, file), raw);
  writeFileSync(join(OUT_DIR, `${file}.gz`), gz);
  writeFileSync(join(OUT_DIR, `${file}.br`), br);
  const manifest: SearchIndexManifest = {
    file,
    hash,
    version: SEARCH_INDEX_VERSION,
    drugs,
    bytes: { raw: raw.length, gzip: gz.length, brotli: br.length },
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  log(`${file}: ${drugs} drugs — raw ${kb(raw.length)}, gzip ${kb(gz.length)}, brotli ${kb(br.length)} — ${((performance.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await pool().end();
}
