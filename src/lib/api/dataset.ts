// The current dataset version (api.dataset_versions), cached 10 s per process. Every
// response carries it in `meta`; the in-memory response cache is keyed by it, so a new
// capture invalidates every cached list at once.
import { apiQuery } from './db';
import { iso } from './records';

export interface Dataset {
  version: string;
  captured_at: string;
  counts: Record<string, number>;
  last_price_change_at: string | null;
  last_price_list_date: string | null;
}

let cached: { value: Dataset; exp: number } | null = null;

export async function getDataset(): Promise<Dataset> {
  if (cached && cached.exp > Date.now()) return cached.value;
  const rows = await apiQuery<{ version: string; captured_at: Date; counts: Record<string, number>; last_change: Date | null; last_list: string | null }>(
    `select v.version, v.captured_at, v.counts,
            (select max(detected_at) from api.events where type = 'price_changed') as last_change,
            (select max(effective_date) from api.drug_state where is_current and effective_date <= current_date) as last_list
     from api.dataset_versions v order by v.id desc limit 1`,
  );
  const r = rows[0];
  const value: Dataset = r
    ? {
        version: r.version,
        captured_at: iso(r.captured_at)!,
        counts: Object.fromEntries(Object.entries(r.counts ?? {}).map(([k, v]) => [k, Number(v)])),
        last_price_change_at: iso(r.last_change),
        last_price_list_date: r.last_list,
      }
    : { version: 'baseline-pending', captured_at: new Date().toISOString(), counts: {}, last_price_change_at: null, last_price_list_date: null };
  cached = { value, exp: Date.now() + 10_000 };
  return value;
}

export function meta(d: Dataset) {
  return { dataset_version: d.version, generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') };
}
