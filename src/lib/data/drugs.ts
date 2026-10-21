import 'server-only';
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { REVALIDATE_SECONDS, STATIC_TOP_DRUGS, tags } from '@/lib/cache';
import type { DrugCard, DrugPage } from './types';

/** One product card by slug (cached for a day, tag drug:<slug>). */
export function getDrugCard(slug: string): Promise<DrugCard | null> {
  return unstable_cache(
    async () => (await query<DrugCard>('select * from web.drug_cards where slug = $1', [slug]))[0] ?? null,
    ['drug-card', slug],
    { revalidate: REVALIDATE_SECONDS, tags: [tags.catalog, tags.drug(slug)] },
  )();
}

/** The full drug page by slug (cached for a day, tag drug:<slug>). */
export function getDrugPage(slug: string): Promise<DrugPage | null> {
  return unstable_cache(
    async () => (await query<DrugPage>('select * from web.drug_pages where slug = $1', [slug]))[0] ?? null,
    ['drug-page', slug],
    { revalidate: REVALIDATE_SECONDS, tags: [tags.catalog, tags.drug(slug)] },
  )();
}

/**
 * Slugs of the most visited indexable drugs, for generateStaticParams of the
 * drug routes (built at deploy time; every other drug renders on demand + ISR).
 */
export const getTopDrugSlugs = unstable_cache(
  async (limit: number = STATIC_TOP_DRUGS): Promise<string[]> => {
    const rows = await query<{ slug: string }>(
      `select slug from web.popular_drugs
       where indexable
       order by visit_count desc, search_count desc, slug
       limit $1`,
      [limit],
    );
    return rows.map((r) => r.slug);
  },
  ['top-drug-slugs'],
  { revalidate: REVALIDATE_SECONDS, tags: [tags.catalog] },
);
