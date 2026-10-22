import 'server-only';
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { REVALIDATE_SECONDS, tags } from '@/lib/cache';
import { nonCanonicalSlugs } from '@/lib/drug/logic';
import type { HubDrug, HubRow, HubType, LatestChange, ListFilters } from './types';

// Loaders of the listing pages (home, hubs, A-Z, last prices). Every one is
// cached for a day under the `catalog` tag (+ `prices` for price lists).
// Lists show listed products only: indexable, and not a pack variant whose
// group canonicalises to another member (part 3 group rule, same set as the
// sitemaps). noindex pages (no price, unresolved research, illegal import…)
// stay reachable from search but are not promoted.
// Every list query takes that duplicate set as $1.

const cache = { revalidate: REVALIDATE_SECONDS, tags: [tags.catalog] };
const priceCache = { revalidate: REVALIDATE_SECONDS, tags: [tags.catalog, tags.prices] };

/** Columns of a drug row in a list (web.drug_cards). */
const LIST_COLUMNS = `slug, name_ar, name_en, strength, dosage_form_ar, form_class, company, current_price, unit_price,
  units_per_package, prescription_status, cardinality(ingredient_keys) as ingredient_count`;

/** A product shown in lists (with the duplicate slugs as $1). */
const LISTED = 'indexable and not (slug = any($1::text[]))';

/**
 * Arabic alphabetical order. The database collation (en_US) misplaces hamza
 * forms (إيجنير before ابسيموكس); folded to ا and compared by code point,
 * which follows the Arabic alphabet.
 */
const AR_SORT = `translate(name_ar, 'آأإٱ', 'اااا') collate "C"`;

/** Pack variants that are noindex because another member of their group is canonical. */
export const getDuplicateSlugs = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await query<{ group_key: string; slug: string; indexable: boolean; is_rpi_canonical: boolean; visit_count: string | number }>(
      'select group_key, slug, indexable, is_rpi_canonical, visit_count from web.product_group_members',
    );
    return [
      ...nonCanonicalSlugs(
        rows.map((g) => ({ groupKey: g.group_key, slug: g.slug, indexable: g.indexable, isRpiCanonical: g.is_rpi_canonical, visitCount: Number(g.visit_count) || 0 })),
      ),
    ];
  },
  ['duplicate-slugs'],
  cache,
);

// ---------------------------------------------------------------- site-wide


// ---------------------------------------------------------------- latest price changes

export const getLatestChanges = unstable_cache(
  async (direction: 'increase' | 'decrease' | null, limit: number, offset: number): Promise<{ rows: LatestChange[]; total: number }> => {
    const rows = await query<LatestChange & { total: string }>(
      `select l.slug, l.name_ar, l.name_en, l.strength, l.dosage_form_ar, l.previous_price, l.new_price,
              l.change_abs, l.change_pct, l.effective_date, l.is_increase, count(*) over () as total
       from web.latest_price_changes l
       join web.drug_cards c on c.slug = l.slug and c.indexable and not (c.slug = any($1::text[]))
       where l.effective_date <= current_date
         and ($2::text is null or l.is_increase = ($2 = 'increase'))
       order by l.effective_date desc, abs(l.change_pct) desc nulls last, l.slug
       limit $3 offset $4`,
      [await getDuplicateSlugs(), direction, limit, offset],
    );
    return { rows, total: Number(rows[0]?.total ?? 0) };
  },
  ['latest-changes-v2'],
  priceCache,
);

// ---------------------------------------------------------------- hubs

/** Hub views and the drug_cards condition of a hub ($2 = hub key). */
const HUBS: Record<HubType, { view: string; key: string; filter: string }> = {
  ingredient: { view: 'ingredients', key: 'ingredient_key', filter: 'ingredient_keys @> array[$2::text]' },
  company: { view: 'companies', key: 'company_key', filter: 'company_keys @> array[$2::text]' },
  category: { view: 'categories', key: 'category_key', filter: 'category_key = $2' },
  atc: { view: 'atc_classes', key: 'atc_code', filter: 'atc_prefixes @> array[$2::text]' },
};

function hubSelect(type: HubType): string {
  const h = HUBS[type];
  const extra = type === 'atc' ? ', level, parent_code' : type === 'ingredient' ? ', single_ingredient_count' : '';
  return `select slug, ${h.key} as key, name_en, name_ar, product_count, indexable_count, min_price, max_price,
            indexable, last_price_date${extra}
          from web.${h.view}`;
}

/** One hub by slug (ATC: by lower-case code). */
export function getHub(type: HubType, slug: string): Promise<HubRow | null> {
  return unstable_cache(
    async () => (await query<HubRow>(`${hubSelect(type)} where slug = $1`, [slug]))[0] ?? null,
    ['hub', type, slug],
    { revalidate: REVALIDATE_SECONDS, tags: [tags.catalog, tags.hub(type, slug)] },
  )();
}

/** Every indexable hub of a type (index pages, home shortcuts), largest first. */
export const getHubIndex = unstable_cache(
  async (type: HubType): Promise<HubRow[]> =>
    query<HubRow>(`${hubSelect(type)} where indexable order by indexable_count desc, slug`),
  ['hub-index'],
  cache,
);

/** ATC classes under a code (one level down), including unnamed ones. */
export const getAtcChildren = unstable_cache(
  async (code: string): Promise<HubRow[]> =>
    query<HubRow>(`${hubSelect('atc')} where parent_code = $1 order by atc_code`, [code]),
  ['atc-children'],
  cache,
);

/** ATC level-1 groups (14), for the ATC index and the home shortcuts. */
export const getAtcRoots = unstable_cache(
  async (): Promise<HubRow[]> => query<HubRow>(`${hubSelect('atc')} where level = 1 order by atc_code`),
  ['atc-roots'],
  cache,
);

const SORTS = {
  name: `${AR_SORT} nulls last, sort_name, slug`,
  'price-asc': `current_price nulls last, ${AR_SORT}, slug`,
  'price-desc': `current_price desc nulls last, ${AR_SORT}, slug`,
} as const;

/** A page of a hub's drugs with optional filters; `total` counts the filtered rows. */
export function getHubDrugs(type: HubType, hub: Pick<HubRow, 'slug' | 'key'>, f: ListFilters, limit: number, offset: number): Promise<{ rows: HubDrug[]; total: number }> {
  return unstable_cache(
    async () => {
      const where = [HUBS[type].filter, LISTED];
      const params: unknown[] = [await getDuplicateSlugs(), hub.key];
      if (f.form === 'other') where.push('form_class is null');
      else if (f.form) {
        params.push(f.form);
        where.push(`form_class = $${params.length}`);
      }
      if (f.rx) where.push(f.rx === 'rx' ? "prescription_status = 'PRESCRIPTION'" : "prescription_status = 'OTC'");
      if (f.min !== null) {
        params.push(f.min);
        where.push(`current_price >= $${params.length}`);
      }
      if (f.max !== null) {
        params.push(f.max);
        where.push(`current_price <= $${params.length}`);
      }
      params.push(limit, offset);
      const rows = await query<HubDrug & { total: string }>(
        `select ${LIST_COLUMNS}, count(*) over () as total
         from web.drug_cards
         where ${where.join(' and ')}
         order by ${SORTS[f.sort]}
         limit $${params.length - 1} offset $${params.length}`,
        params,
      );
      return { rows, total: Number(rows[0]?.total ?? 0) };
    },
    ['hub-drugs-v2', type, hub.key, JSON.stringify(f), String(limit), String(offset)],
    { revalidate: REVALIDATE_SECONDS, tags: [tags.catalog, tags.hub(type, hub.slug)] },
  )();
}

/** Dosage-form classes present in a hub (filter options), largest first; null = other. Their sum is the hub's list size. */
export function getHubForms(type: HubType, key: string): Promise<Array<{ form_class: string | null; n: number }>> {
  return unstable_cache(
    async () =>
      query<{ form_class: string | null; n: number }>(
        `select form_class, count(*)::int as n from web.drug_cards
         where ${HUBS[type].filter} and ${LISTED}
         group by form_class order by n desc, form_class nulls last`,
        [await getDuplicateSlugs(), key],
      ),
    ['hub-forms-v2', type, key],
    cache,
  )();
}

/** Every listed drug of an ingredient (grouped by form and strength on the page). */
export function getIngredientDrugs(key: string): Promise<HubDrug[]> {
  return unstable_cache(
    async () =>
      query<HubDrug>(
        `select ${LIST_COLUMNS} from web.drug_cards
         where ${HUBS.ingredient.filter} and ${LISTED}
         order by current_price nulls last, ${AR_SORT}, slug`,
        [await getDuplicateSlugs(), key],
      ),
    ['ingredient-drugs-v2', key],
    cache,
  )();
}

// ---------------------------------------------------------------- A-Z

/** First letter as used by the A-Z pages: hamza forms of alif fold into ا, ى into ي. */
const FIRST_LETTER = `translate(left(name_ar, 1), 'آأإٱى', 'ااااي')`;

export const getLetterCounts = unstable_cache(
  async (): Promise<Array<{ letter: string; n: number }>> =>
    query<{ letter: string; n: number }>(
      `select ${FIRST_LETTER} as letter, count(*)::int as n
       from web.drug_cards where ${LISTED} and name_ar is not null
       group by 1`,
      [await getDuplicateSlugs()],
    ),
  ['letter-counts-v2'],
  cache,
);

export function getLetterDrugs(letter: string, limit: number, offset: number): Promise<HubDrug[]> {
  return unstable_cache(
    async () =>
      query<HubDrug>(
        `select ${LIST_COLUMNS} from web.drug_cards
         where ${LISTED} and ${FIRST_LETTER} = $2
         order by ${AR_SORT}, slug
         limit $3 offset $4`,
        [await getDuplicateSlugs(), letter, limit, offset],
      ),
    ['letter-drugs-v2', letter, String(limit), String(offset)],
    cache,
  )();
}
