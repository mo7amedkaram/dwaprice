// The generated suggestion index must never carry prices, barcodes, companies, counters or
// internal ids. Checked on the pure builder (rows that deliberately carry such fields) and, when
// a generated index is on disk (npm run build:index), on the real file too. Also the small pure
// helpers of the client (fallback filter, prefetch skip) and of the index route (encoding).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSearchIndex, serializeSearchIndex, type DrugSource } from '@/lib/search/index-build';
import { SEARCH_INDEX_FILE_RE, SEARCH_INDEX_KEYS, SEARCH_INDEX_VERSION, type SearchIndexFile, type SearchIndexManifest } from '@/lib/search/index-format';
import { matchesLocally, shouldSkipPrefetch, toSuggestion } from '@/lib/search/client';
import { pickEncoding } from '@/app/search-index/[file]/route';

// Rows as the web views could hand them over: full of fields the index must not keep.
const ROWS = [
  {
    slug: 'augmentin-1gm-14-f-c-tabs',
    name_ar: 'أوجمنتين 1جم 14 قرص',
    name_en: 'Augmentin 1 g film-coated tablets (14 tablets)',
    price_list_name: 'Augmentin 1gm 14 f.c. tabs',
    dosage_form_ar: 'أقراص مغلفة',
    ingredient_keys: ['cid:amox'],
    aliases: ['Augmentin 1gm 14 tablets', 'Augmentin 1gm 14 tablets'],
    visit_count: 1234,
    search_count: 77,
    // forbidden extras
    current_price: '287.5',
    old_price: '261.00',
    unit_price: '20.54',
    barcode: '6221045011279',
    company: 'GlaxoSmithKline (manufactured by Medical Union Pharmaceuticals - MUP, Egypt)',
    drug_id: 'b4a0f2d1-9c7e-4c3a-9c1e-1f5e9a0b7c21',
    research_status: 'VERIFIED',
  },
  {
    slug: 'panadol-extra-24-tabs',
    name_ar: 'بانادول اكسترا 24 قرص',
    name_en: 'Panadol Extra 24 f.c. tab',
    price_list_name: 'Panadol extra 24 f.c. tab',
    dosage_form_ar: null,
    ingredient_keys: ['cid:para', 'cid:missing'],
    aliases: [],
    visit_count: 0,
    search_count: 0,
    current_price: '45.5',
    barcode: '5000347012345',
    company: 'Haleon',
  },
] as unknown as DrugSource[];
const INGREDIENTS = [
  { ingredient_key: 'cid:amox', name_en: 'Amoxicillin', name_ar: 'أموكسيسيلين' },
  { ingredient_key: 'cid:para', name_en: 'Paracetamol', name_ar: null },
];

function checkStructure(index: SearchIndexFile) {
  expect(Object.keys(index)).toEqual([...SEARCH_INDEX_KEYS]);
  expect(index.v).toBe(SEARCH_INDEX_VERSION);
  for (const col of ['slug', 'ar', 'en', 'form', 'pop', 'di', 'dt'] as const) expect(index[col]).toHaveLength(index.n);
  for (const col of ['forms', 'ing', 'tok', 'slug', 'ar', 'en'] as const) expect(index[col].every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
  // dictionaries hold each string once; slugs are unique (two packs may share a display name)
  for (const col of ['forms', 'ing', 'tok', 'slug'] as const) expect(new Set(index[col]).size).toBe(index[col].length);
  expect(index.pop.every((p) => Number.isInteger(p) && p >= 0 && p <= 5)).toBe(true);
  expect(index.form.every((f) => f === -1 || (f >= 0 && f < index.forms.length))).toBe(true);
  expect(index.di.every((ids) => ids.every((id) => id >= 0 && id < index.ing.length))).toBe(true);
  expect(index.dt.every((ids) => ids.every((id) => id >= 0 && id < index.tok.length))).toBe(true);
  // columnar: no objects (hence no row keys such as price or company) below the top level
  const parsed = JSON.parse(serializeSearchIndex(index)) as Record<string, unknown>;
  const hasObject = (v: unknown): boolean => (Array.isArray(v) ? v.some(hasObject) : typeof v === 'object' && v !== null);
  expect(Object.values(parsed).some(hasObject)).toBe(false);
  // no barcode-like strings anywhere (EAN-13 / GTIN-14 / UPC)
  const strings = [...index.forms, ...index.ing, ...index.tok, ...index.slug, ...index.ar, ...index.en];
  expect(strings.filter((s) => /^\d{12,14}$/.test(s))).toEqual([]);
  expect(strings.filter((s) => /\b\d{12,14}\b/.test(s))).toEqual([]);
}

describe('index builder keeps only the allowed columns', () => {
  const index = buildSearchIndex(ROWS, INGREDIENTS);
  const json = serializeSearchIndex(index);

  it('has exactly the documented keys and consistent columns', () => {
    checkStructure(index);
    expect(index.n).toBe(2);
  });

  it('carries no price, barcode, company, counter or id', () => {
    for (const value of ['287.5', '261.00', '20.54', '45.5', '6221045011279', '5000347012345', 'GlaxoSmithKline', 'Haleon', 'b4a0f2d1', 'VERIFIED', '1234', '"77']) {
      expect(json, value).not.toContain(value);
    }
  });

  it('turns counters into a bucket and orders popular drugs first', () => {
    expect(index.slug).toEqual(['augmentin-1gm-14-f-c-tabs', 'panadol-extra-24-tabs']);
    expect(index.pop).toEqual([5, 0]);
  });

  it('builds the dictionaries: forms, ingredient names, extra alias tokens', () => {
    expect(index.forms).toEqual(['أقراص مغلفة']);
    expect(index.form).toEqual([0, -1]);
    expect(index.ing).toEqual(['Amoxicillin', 'أموكسيسيلين', 'Paracetamol']);
    expect(index.di).toEqual([[0, 1], [2]]); // unknown ingredient keys are skipped
    // price-list words missing from the names: "gm", "f", "c", "tabs" (not "augmentin", "1", "14")
    expect(index.dt[0].map((t) => index.tok[t]).sort()).toEqual(['c', 'f', 'gm', 'tabs']);
    expect(index.dt[1]).toEqual([]);
  });
});

const manifestPath = new URL('../data/search-index/manifest.json', import.meta.url);
// The files are read inside it(): a skipped describe still runs its body to collect tests.
(existsSync(manifestPath) ? describe : describe.skip)('the generated index on disk', () => {
  it('is well-formed, free of forbidden data and under 1 MB compressed', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as SearchIndexManifest;
    const index = JSON.parse(readFileSync(new URL(`../data/search-index/${manifest.file}`, import.meta.url), 'utf8')) as SearchIndexFile;
    expect(SEARCH_INDEX_FILE_RE.test(manifest.file)).toBe(true);
    checkStructure(index);
    expect(index.n).toBe(manifest.drugs);
    expect(index.n).toBeGreaterThan(1000);
    expect(manifest.bytes.brotli).toBeLessThan(1_000_000);
    expect(manifest.bytes.gzip).toBeLessThan(1_000_000);
  });
});

describe('client helpers', () => {
  it('filters the cached server list locally like the index would', () => {
    const hit = toSuggestion({ slug: 'augmentin-1gm-14-f-c-tabs', name_ar: 'أوجمنتين 1جم 14 قرص', name_en: 'Augmentin 1gm 14 f.c. tabs', dosage_form_ar: 'أقراص مغلفة' });
    expect(hit).toEqual({ slug: 'augmentin-1gm-14-f-c-tabs', ar: 'أوجمنتين 1جم 14 قرص', en: 'Augmentin 1gm 14 f.c. tabs', form: 'أقراص مغلفة', ingredient: null, tier: -1 });
    expect(matchesLocally(hit, 'اوجمنتين')).toBe(true);
    expect(matchesLocally(hit, 'اوجمنتين 1')).toBe(true);
    expect(matchesLocally(hit, 'augmentin 14')).toBe(true);
    expect(matchesLocally(hit, 'جمنتين')).toBe(true); // substring
    expect(matchesLocally(hit, 'panadol')).toBe(false);
    expect(toSuggestion({ slug: 'x', name_ar: null, name_en: 'X 10 mg', dosage_form_ar: null }).ar).toBe('X 10 mg');
  });

  it('skips the idle prefetch on Save-Data and 2G', () => {
    const nav = (connection?: object) => ({ connection }) as unknown as Navigator;
    expect(shouldSkipPrefetch(nav())).toBe(false);
    expect(shouldSkipPrefetch(nav({ saveData: false, effectiveType: '4g' }))).toBe(false);
    expect(shouldSkipPrefetch(nav({ saveData: true, effectiveType: '4g' }))).toBe(true);
    expect(shouldSkipPrefetch(nav({ effectiveType: '2g' }))).toBe(true);
    expect(shouldSkipPrefetch(nav({ effectiveType: 'slow-2g' }))).toBe(true);
    expect(shouldSkipPrefetch(nav({ effectiveType: '3g' }))).toBe(false);
  });
});

describe('index route', () => {
  it('negotiates brotli, then gzip, else identity', () => {
    expect(pickEncoding('gzip, deflate, br')).toBe('br');
    expect(pickEncoding('br;q=1.0, gzip;q=0.8')).toBe('br');
    expect(pickEncoding('gzip, deflate')).toBe('gzip');
    expect(pickEncoding('identity')).toBeNull();
    expect(pickEncoding(null)).toBeNull();
    expect(pickEncoding('sbr, zgzip')).toBeNull();
  });
});
