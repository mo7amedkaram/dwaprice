// Pure construction of the suggestion index from rows of the web.* views (no database code
// here: scripts/build-search-index.ts collects the rows, tests/search-index.test.ts feeds
// fixture rows). Only the fields named in the types below ever reach the output; everything
// else a row may carry (price, barcode, company …) is ignored by construction.
import { SEARCH_INDEX_VERSION, type SearchIndexFile } from './index-format';
import { normalizeSearch, searchTokens } from './normalize';

/** A drug the sitemap would list (web.drug_cards, indexable, group-canonical). */
export interface DrugSource {
  slug: string;
  name_ar: string;
  name_en: string;
  /** Price-list line ("Noracin 400mg 10 f.c.tab."): its spare words become alias tokens. */
  price_list_name: string | null;
  dosage_form_ar: string | null;
  ingredient_keys: string[];
  /** Approved alias texts from web.search_index (canonical names, Arabic names, spelling variants). */
  aliases: string[];
  visit_count: number;
  search_count: number;
}

/** web.ingredients: key → names. */
export interface IngredientSource {
  ingredient_key: string;
  name_en: string | null;
  name_ar: string | null;
}

/**
 * Popularity as a small bucket. Visits weigh 1, searches 3 (a search for the drug is a stronger
 * signal than a page view): 0 none, 1 = 1-2, 2 = 3-7, 3 = 8-19, 4 = 20-49, 5 = 50+.
 */
export function popularityBucket(visitCount: number, searchCount: number): number {
  const score = Math.max(0, visitCount || 0) + 3 * Math.max(0, searchCount || 0);
  if (score <= 0) return 0;
  if (score < 3) return 1;
  if (score < 8) return 2;
  if (score < 20) return 3;
  if (score < 50) return 4;
  return 5;
}

class Dictionary {
  readonly values: string[] = [];
  private readonly ids = new Map<string, number>();
  id(value: string): number {
    let id = this.ids.get(value);
    if (id === undefined) {
      id = this.values.length;
      this.values.push(value);
      this.ids.set(value, id);
    }
    return id;
  }
}

/** Builds the index. Drugs are ordered most popular first, then by slug (deterministic output). */
export function buildSearchIndex(drugs: DrugSource[], ingredients: IngredientSource[]): SearchIndexFile {
  const forms = new Dictionary();
  const ing = new Dictionary();
  const tok = new Dictionary();

  // Ingredient dictionary entries per ingredient key (English then Arabic name, when present).
  const ingredientIds = new Map<string, number[]>();
  for (const i of ingredients) {
    const ids: number[] = [];
    for (const name of [i.name_en, i.name_ar]) {
      const clean = name?.trim();
      if (clean && normalizeSearch(clean)) ids.push(ing.id(clean));
    }
    if (ids.length) ingredientIds.set(i.ingredient_key, ids);
  }

  const rows = drugs
    .map((d) => ({ d, pop: popularityBucket(d.visit_count, d.search_count) }))
    .sort((a, b) => b.pop - a.pop || (a.d.slug < b.d.slug ? -1 : a.d.slug > b.d.slug ? 1 : 0));

  const out: SearchIndexFile = { v: SEARCH_INDEX_VERSION, n: rows.length, forms: [], ing: [], tok: [], slug: [], ar: [], en: [], form: [], pop: [], di: [], dt: [] };
  for (const { d, pop } of rows) {
    const nameTokens = new Set([...searchTokens(d.name_ar), ...searchTokens(d.name_en)]);
    // Alias tokens: words of the price-list line and of the approved aliases that the two
    // displayed names do not already contain ("f c tab" for "film-coated tablets", a spelling
    // variant …). Stored once in the dictionary, referenced by id.
    const extra = new Set<number>();
    for (const alias of [d.price_list_name, ...d.aliases]) {
      for (const t of searchTokens(alias)) if (!nameTokens.has(t)) extra.add(tok.id(t));
    }
    const ingredientRefs = new Set<number>();
    for (const key of d.ingredient_keys ?? []) for (const id of ingredientIds.get(key) ?? []) ingredientRefs.add(id);

    out.slug.push(d.slug);
    out.ar.push(d.name_ar.trim());
    out.en.push(d.name_en.trim());
    const form = d.dosage_form_ar?.trim();
    out.form.push(form ? forms.id(form) : -1);
    out.pop.push(pop);
    out.di.push([...ingredientRefs].sort((a, b) => a - b));
    out.dt.push([...extra].sort((a, b) => a - b));
  }
  out.forms = forms.values;
  out.ing = ing.values;
  out.tok = tok.values;
  return out;
}

/** Compact JSON (no whitespace) of the index, with the columns in the documented order. */
export function serializeSearchIndex(index: SearchIndexFile): string {
  return JSON.stringify(index);
}
