import 'server-only';
// Read-only dashboard data for the admin home. Cheap queries only (the shared database has a 5 s
// statement timeout); the heavier site_stats read is cached. No personal data.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { apiQuery } from '@/lib/api/db';
import { REVALIDATE_SECONDS, tags } from '@/lib/cache';

export interface SiteStats {
  indexable_drugs: number;
  all_drugs: number;
  priced_drugs: number;
  last_price_date: string | null;
  last_change_date: string | null;
  last_sync_at: string | null;
}

const getStats = unstable_cache(
  async (): Promise<SiteStats | null> => {
    try {
      const rows = await query<SiteStats>('select indexable_drugs, all_drugs, priced_drugs, last_price_date, last_change_date, last_sync_at from web.site_stats');
      return rows[0] ?? null;
    } catch {
      return null;
    }
  },
  ['admin-site-stats-v1'],
  { revalidate: REVALIDATE_SECONDS, tags: [tags.catalog] },
);

export interface TopDrug {
  slug: string;
  name_ar: string | null;
  name_en: string;
  visit_count: number;
}

export interface IndexInfo {
  drugs: number;
  brotliKb: number;
  generatedAt: string | null;
}

export interface Dashboard {
  commit: string | null;
  dbOk: boolean;
  stats: SiteStats | null;
  changesThisWeek: number | null;
  topVisited: TopDrug[];
  index: IndexInfo | null;
  api: { activeClients: number; activeKeys: number } | null;
}

async function readIndexInfo(): Promise<IndexInfo | null> {
  try {
    const text = await readFile(join(process.cwd(), 'data', 'search-index', 'manifest.json'), 'utf8');
    const m = JSON.parse(text) as { drugs?: number; bytes?: { brotli?: number }; generatedAt?: string };
    return { drugs: m.drugs ?? 0, brotliKb: Math.round((m.bytes?.brotli ?? 0) / 1024), generatedAt: m.generatedAt ?? null };
  } catch {
    return null;
  }
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export async function getDashboard(): Promise<Dashboard> {
  const [dbPing, stats, changes, top, index, api] = await Promise.all([
    safe(query<{ ok: number }>('select 1 as ok').then((r) => r.length > 0), false),
    getStats(),
    safe(query<{ n: string }>('select count(*) n from web.latest_price_changes where effective_date >= current_date - 7').then((r) => Number(r[0]?.n ?? 0)), null),
    safe(
      query<TopDrug & { visit_count: string | number }>(
        `select p.slug, c.name_ar, c.name_en, p.visit_count
         from web.popular_drugs p join web.drug_cards c on c.slug = p.slug
         where p.indexable and p.visit_count > 0 order by p.visit_count desc, p.slug limit 20`,
      ).then((rows) => rows.map((r) => ({ slug: r.slug, name_ar: r.name_ar, name_en: r.name_en, visit_count: Number(r.visit_count) || 0 }))),
      [],
    ),
    readIndexInfo(),
    safe(
      apiQuery<{ clients: string; keys: string }>(
        "select (select count(*) from api.clients where status = 'active') clients, (select count(*) from api.api_keys where status = 'active') keys",
      ).then((r) => ({ activeClients: Number(r[0]?.clients ?? 0), activeKeys: Number(r[0]?.keys ?? 0) })),
      null,
    ),
  ]);
  return { commit: process.env.COMMIT_SHA || null, dbOk: dbPing, stats, changesThisWeek: changes, topVisited: top, index, api };
}
