// Periodic jobs run through GET/POST /api/v1/internal/jobs (Vercel Cron or any scheduler,
// every 15 minutes): scraping detection, webhook deliveries, cache invalidation when the
// dataset version changed. Idempotent; each returns what it did.
import { revalidateTag } from 'next/cache';
import { apiQuery } from './db';
import { clearResponseCache } from './handler';
import { getDataset } from './dataset';
import { notifyAdmin } from './notify';
import { processWebhooks } from './webhooks';
import { tags } from '@/lib/cache';

export const THRESHOLDS = {
  /** distinct /drugs/{id} ids per key per day */
  distinctIdsPerDay: 2000,
  /** share of the catalogue paged through unfiltered /drugs per day (non-Enterprise) */
  catalogueShare: 0.8,
  /** distinct source networks (/24) per key per hour */
  ipsPerHour: 50,
};

interface Finding {
  kind: string;
  key_id: string;
  client_id: string;
  details: Record<string, unknown>;
}

/** Scraping patterns per key (docs/API_SPEC.md §12); one alert per key, kind and day. */
export async function detectAbuse(): Promise<{ alerts: Finding[] }> {
  const dataset = await getDataset();
  const catalogue = Number(dataset.counts.drugs ?? 15000);
  const pagesThreshold = Math.ceil((THRESHOLDS.catalogueShare * catalogue) / 100);
  const [ids, pages, ips] = await Promise.all([
    apiQuery<{ key_id: string; client_id: string; n: string }>(
      `select u.key_id, k.client_id, count(*) as n from api.usage_drug_ids u join api.api_keys k on k.id = u.key_id
       where u.day = (now() at time zone 'utc')::date group by 1, 2 having count(*) > $1`,
      [THRESHOLDS.distinctIdsPerDay],
    ),
    apiQuery<{ key_id: string; client_id: string; n: string }>(
      `select u.key_id, k.client_id, sum(u.requests) as n from api.usage_daily u
       join api.api_keys k on k.id = u.key_id join api.clients c on c.id = k.client_id
       where u.day = (now() at time zone 'utc')::date and u.endpoint = 'drugs:list:all' and c.plan_id <> 'enterprise'
       group by 1, 2 having sum(u.requests) >= $1`,
      [pagesThreshold],
    ),
    apiQuery<{ key_id: string; client_id: string; n: string }>(
      `select u.key_id, k.client_id, count(*) as n from api.usage_ips u join api.api_keys k on k.id = u.key_id
       where u.hour = date_trunc('hour', now()) group by 1, 2 having count(*) > $1`,
      [THRESHOLDS.ipsPerHour],
    ),
  ]);
  const findings: Finding[] = [
    ...ids.map((r) => ({ kind: 'scraping_ids', key_id: r.key_id, client_id: r.client_id, details: { distinct_ids_today: Number(r.n), threshold: THRESHOLDS.distinctIdsPerDay } })),
    ...pages.map((r) => ({ kind: 'scraping_pages', key_id: r.key_id, client_id: r.client_id, details: { unfiltered_list_requests_today: Number(r.n), threshold: pagesThreshold } })),
    ...ips.map((r) => ({ kind: 'many_ips', key_id: r.key_id, client_id: r.client_id, details: { distinct_networks_this_hour: Number(r.n), threshold: THRESHOLDS.ipsPerHour } })),
  ];
  const alerts: Finding[] = [];
  for (const f of findings) {
    const dup = await apiQuery<{ id: string }>(`select id from api.alerts where kind = $1 and key_id = $2 and at > now() - interval '1 day' limit 1`, [f.kind, f.key_id]);
    if (dup.length) continue;
    await apiQuery('insert into api.alerts (kind, key_id, client_id, details) values ($1, $2, $3, $4)', [f.kind, f.key_id, f.client_id, JSON.stringify(f.details)]);
    const sent = await notifyAdmin(`Possible scraping (${f.kind})`, `Key ${f.key_id} of client ${f.client_id}: ${JSON.stringify(f.details)}. Review usage and suspend the client if needed.`);
    if (sent) await apiQuery('update api.alerts set notified_at = now() where key_id = $1 and kind = $2 and notified_at is null', [f.key_id, f.kind]);
    alerts.push(f);
  }
  return { alerts };
}

let lastSeenVersion: string | null = null;

/** When a new dataset version exists: drop the in-memory API cache and the website's price caches. */
export async function syncCaches(): Promise<{ version: string; invalidated: boolean }> {
  const dataset = await getDataset();
  const changed = lastSeenVersion !== null && lastSeenVersion !== dataset.version;
  lastSeenVersion = dataset.version;
  if (changed) {
    clearResponseCache();
    revalidateTag(tags.prices, 'max');
  }
  return { version: dataset.version, invalidated: changed };
}

export async function runJobs(which: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (which === 'all' || which === 'cache') out.cache = await syncCaches();
  if (which === 'all' || which === 'abuse') out.abuse = await detectAbuse();
  if (which === 'all' || which === 'webhooks') out.webhooks = await processWebhooks();
  return out;
}
