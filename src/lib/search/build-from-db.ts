// Collects the rows the suggestion index needs from the public web.* views and builds the index.
// Shared by the build-time generator (scripts/build-search-index.mts) and the live route
// (src/app/search-index/current.json/route.ts), so both produce byte-identical output from the
// same data. No database handle here: the caller passes its own `query` (the build script's pool,
// or the website's read-only role via @/lib/db), so this file imports no server-only code.
import { createHash } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { buildSearchIndex, serializeSearchIndex, type DrugSource, type IngredientSource } from './index-build';

/** A query function shaped like @/lib/db and scripts' pool: run SQL, get typed rows. */
export type QueryFn = <T extends QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;

// Alias kinds that are names or spellings of the drug. Never 'catalog_term' (company, class, barcode).
export const ALIAS_TYPES = ['canonical_name', 'arabic_name', 'transliteration', 'common_spelling', 'approved_synonym'];
const ALIAS_BATCH = 1000;

/** Everything the index is built from, read only from the public web.* views (names/form/ingredients). */
export async function collectDrugSources(query: QueryFn): Promise<{ sources: DrugSource[]; ingredients: IngredientSource[] }> {
  const [drugs, popular, ingredients] = await Promise.all([
    query<{ slug: string; name_ar: string | null; name_en: string; price_list_name: string | null; dosage_form_ar: string | null; ingredient_keys: string[] | null }>(
      'select slug, name_ar, name_en, price_list_name, dosage_form_ar, ingredient_keys from web.drug_cards',
    ),
    query<{ slug: string; visit_count: string | number | null; search_count: string | number | null }>('select slug, visit_count, search_count from web.popular_drugs'),
    query<IngredientSource>('select ingredient_key, name_en, name_ar from web.ingredients'),
  ]);

  // Approved name aliases, in slug batches (the read-only role's statement timeout is 5 s).
  const aliases = new Map<string, string[]>();
  for (let i = 0; i < drugs.length; i += ALIAS_BATCH) {
    const slugs = drugs.slice(i, i + ALIAS_BATCH).map((d) => d.slug);
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
  return { sources, ingredients };
}

export interface BuiltIndex {
  /** Compact JSON of the columnar index. */
  json: string;
  /** First 12 hex of sha256(json): changes iff the served content changes (the version token). */
  hash: string;
  /** Number of drugs in the index. */
  drugs: number;
  /** When this build was produced (ISO); informational, carried through the tagged cache. */
  generatedAt: string;
}

/** Reads the views with `query`, builds the index and returns its JSON + content hash. */
export async function buildIndexFromDb(query: QueryFn): Promise<BuiltIndex> {
  const { sources, ingredients } = await collectDrugSources(query);
  const index = buildSearchIndex(sources, ingredients);
  const json = serializeSearchIndex(index);
  const hash = createHash('sha256').update(Buffer.from(json, 'utf8')).digest('hex').slice(0, 12);
  return { json, hash, drugs: index.n, generatedAt: new Date().toISOString() };
}
