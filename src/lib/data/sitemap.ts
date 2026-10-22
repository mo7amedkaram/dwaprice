import 'server-only';
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { SITEMAP_REVALIDATE_SECONDS, tags } from '@/lib/cache';
import { isoDate } from '@/lib/format';
import { routes } from '@/lib/site';
import { hasUsesPage, nonCanonicalSlugs } from '@/lib/drug/logic';
import type { SitemapEntry } from './types';

/** Google allows 50,000 URLs per file; stay below with margin. */
export const SITEMAP_MAX_URLS = 45_000;

export type SitemapType = 'static' | 'drugs' | 'alternatives' | 'uses' | 'ingredients' | 'companies' | 'categories' | 'atc' | 'letters';
export const SITEMAP_TYPES: SitemapType[] = ['static', 'drugs', 'alternatives', 'uses', 'ingredients', 'companies', 'categories', 'atc', 'letters'];

/** Home, index pages and static pages (page 1 of each list only: pages 2+ are noindex). */
const STATIC_PATHS = [
  routes.home(),
  routes.letters(),
  routes.ingredients(),
  routes.companies(),
  routes.categories(),
  routes.atcIndex(),
  routes.lastPrices(),
  routes.about(),
  routes.guide(),
  routes.contact(),
  routes.disclaimer(),
  routes.privacy(),
  routes.terms(),
];

type Row = { slug: string; lastmod: string | Date | null };

/** Every indexable URL of one type, with lastmod (only `indexable = true`). */
async function load(type: SitemapType): Promise<SitemapEntry[]> {
  switch (type) {
    case 'static':
      return STATIC_PATHS.map((path) => ({ path, lastmod: null }));
    case 'drugs':
    case 'alternatives':
    case 'uses': {
      const [rows, groups] = await Promise.all([
        query<Row & { has_alternatives: boolean; clinical_sections: string[] }>(
          'select slug, lastmod, has_alternatives, clinical_sections from web.sitemap_drugs order by slug',
        ),
        query<{ group_key: string; slug: string; indexable: boolean; is_rpi_canonical: boolean; visit_count: string | number }>(
          'select group_key, slug, indexable, is_rpi_canonical, visit_count from web.product_group_members',
        ),
      ]);
      // Pack variants that canonicalise to another member of their group are noindex: leave them out.
      const duplicates = nonCanonicalSlugs(
        groups.map((g) => ({ groupKey: g.group_key, slug: g.slug, indexable: g.indexable, isRpiCanonical: g.is_rpi_canonical, visitCount: Number(g.visit_count) || 0 })),
      );
      const route = type === 'drugs' ? routes.drug : type === 'alternatives' ? routes.alternatives : routes.uses;
      return rows
        .filter((r) => !duplicates.has(r.slug))
        .filter((r) => type === 'drugs' || (type === 'alternatives' ? r.has_alternatives : hasUsesPage(r.clinical_sections)))
        .map((r) => ({ path: route(r.slug), lastmod: isoDate(r.lastmod) }));
    }
    case 'ingredients':
    case 'companies':
    case 'categories': {
      const rows = await query<Row>(`select slug, last_price_date as lastmod from web.${type} where indexable order by slug`);
      const route = type === 'ingredients' ? routes.ingredient : type === 'companies' ? routes.company : routes.category;
      return rows.map((r) => ({ path: route(r.slug), lastmod: isoDate(r.lastmod) }));
    }
    case 'atc': {
      const rows = await query<Row & { atc_code: string; name_en: string | null }>(
        'select slug, atc_code, name_en, last_price_date as lastmod from web.atc_classes where indexable order by slug',
      );
      return rows.map((r) => ({ path: routes.atc(r.atc_code, r.name_en), lastmod: isoDate(r.lastmod) }));
    }
    case 'letters': {
      // Page 1 of each A-Z letter (drug counts per first letter, as in lib/data/listings.ts).
      const rows = await query<{ letter: string; lastmod: string | null }>(
        `select translate(left(name_ar, 1), 'آأإٱى', 'ااااي') as letter, max(price_updated_date) as lastmod
         from web.drug_cards where indexable and name_ar is not null group by 1 order by 1`,
      );
      return rows.map((r) => ({ path: routes.letter(r.letter), lastmod: isoDate(r.lastmod) }));
    }
  }
}

export const getSitemapEntries = unstable_cache(load, ['sitemap-entries-v4'], {
  revalidate: SITEMAP_REVALIDATE_SECONDS,
  tags: [tags.catalog, tags.sitemap],
});

/** File names of the sitemap index: "<type>-<n>.xml", split at SITEMAP_MAX_URLS. */
export async function getSitemapFiles(): Promise<Array<{ file: string; lastmod: string | null }>> {
  const files: Array<{ file: string; lastmod: string | null }> = [];
  for (const type of SITEMAP_TYPES) {
    const entries = await getSitemapEntries(type);
    const chunks = Math.max(1, Math.ceil(entries.length / SITEMAP_MAX_URLS));
    for (let n = 1; n <= chunks; n++) {
      const part = entries.slice((n - 1) * SITEMAP_MAX_URLS, n * SITEMAP_MAX_URLS);
      const lastmod = part.reduce<string | null>((max, e) => (e.lastmod && (!max || e.lastmod > max) ? e.lastmod : max), null);
      files.push({ file: `${type}-${n}.xml`, lastmod });
    }
  }
  return files;
}

/** Entries of one file, or null when the name is not a valid file. */
export async function getSitemapFile(file: string): Promise<SitemapEntry[] | null> {
  const m = /^([a-z]+)-(\d{1,4})\.xml$/.exec(file);
  if (!m || !SITEMAP_TYPES.includes(m[1] as SitemapType)) return null;
  const n = Number(m[2]);
  const entries = await getSitemapEntries(m[1] as SitemapType);
  const part = entries.slice((n - 1) * SITEMAP_MAX_URLS, n * SITEMAP_MAX_URLS);
  return n >= 1 && (part.length > 0 || n === 1) ? part : null;
}
