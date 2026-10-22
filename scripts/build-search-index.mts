// Generates the browser suggestion index at build time (npm run build = this, then next build):
//   data/search-index/index.<hash>.json  (+ .gz and .br, pre-compressed)
//   data/search-index/manifest.json      (next.config.ts inlines `file` as NEXT_PUBLIC_SEARCH_INDEX)
// Reads only the public web.* views with the read-only role (WEB_DATABASE_URL, from the
// environment or .env.local). The set of drugs is the one the sitemap lists: indexable cards
// minus pack variants that canonicalise to another member of their group.
// usage: npx tsx scripts/build-search-index.mts      (fails the build on any error)
import nextEnv from '@next/env';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

nextEnv.loadEnvConfig(process.cwd());

const { pool, query } = await import('../src/lib/db/pool');
const { buildSearchIndex, serializeSearchIndex } = await import('../src/lib/search/index-build');
const { SEARCH_INDEX_VERSION } = await import('../src/lib/search/index-format');
type DrugSource = import('../src/lib/search/index-build').DrugSource;
type SearchIndexManifest = import('../src/lib/search/index-format').SearchIndexManifest;

const OUT_DIR = join(process.cwd(), 'data', 'search-index');
// Alias kinds that are names or spellings of the drug. Never 'catalog_term' (company, class, barcode).
const ALIAS_TYPES = ['canonical_name', 'arabic_name', 'transliteration', 'common_spelling', 'approved_synonym'];
const BATCH = 1000;

const started = performance.now();
const log = (msg: string) => console.log(`[search-index] ${msg}`);

try {
  // Every drug that has a public page — including non-canonical duplicates (a user may search for
  // any of them) and drugs with no Arabic name. Same privacy rule: only names/form/ingredients.
  const [drugs, popular, ingredients] = await Promise.all([
    query<{ slug: string; name_ar: string | null; name_en: string; price_list_name: string | null; dosage_form_ar: string | null; ingredient_keys: string[] | null }>(
      'select slug, name_ar, name_en, price_list_name, dosage_form_ar, ingredient_keys from web.drug_cards',
    ),
    query<{ slug: string; visit_count: string | number | null; search_count: string | number | null }>('select slug, visit_count, search_count from web.popular_drugs'),
    query<{ ingredient_key: string; name_en: string | null; name_ar: string | null }>('select ingredient_key, name_en, name_ar from web.ingredients'),
  ]);
  log(`${drugs.length} drug pages (every page, duplicates included); ${ingredients.length} ingredients`);

  // Approved name aliases, in slug batches (the role's statement timeout is 5 s).
  const aliases = new Map<string, string[]>();
  for (let i = 0; i < drugs.length; i += BATCH) {
    const slugs = drugs.slice(i, i + BATCH).map((d) => d.slug);
    const rows = await query<{ slug: string; alias: string }>(
      'select distinct slug, alias from web.search_index where slug = any($1) and alias_type = any($2)',
      [slugs, ALIAS_TYPES],
    );
    for (const r of rows) aliases.set(r.slug, [...(aliases.get(r.slug) ?? []), r.alias]);
  }
  const counters = new Map(popular.map((p) => [p.slug, p]));

  const sources: DrugSource[] = drugs.map((d) => {
    const c = counters.get(d.slug);
    return {
      slug: d.slug,
      name_ar: d.name_ar,
      name_en: d.name_en,
      price_list_name: d.price_list_name,
      dosage_form_ar: d.dosage_form_ar,
      ingredient_keys: d.ingredient_keys ?? [],
      aliases: aliases.get(d.slug) ?? [],
      visit_count: Number(c?.visit_count) || 0,
      search_count: Number(c?.search_count) || 0,
    };
  });

  const index = buildSearchIndex(sources, ingredients);
  const json = serializeSearchIndex(index);
  const raw = Buffer.from(json, 'utf8');
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
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
    drugs: index.n,
    bytes: { raw: raw.length, gzip: gz.length, brotli: br.length },
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  log(`${file}: ${index.n} drugs, ${index.forms.length} forms, ${index.ing.length} ingredient names, ${index.tok.length} alias tokens`);
  log(`raw ${kb(raw.length)}, gzip ${kb(gz.length)}, brotli ${kb(br.length)} — ${((performance.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await pool().end();
}
