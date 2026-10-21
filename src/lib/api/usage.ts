// Usage accounting after the response is sent: api.usage_daily, usage_drug_ids (scraping
// detection), usage_ips, a sampled api.request_log (never the key), last_used_at.
import { apiQuery } from './db';

export interface UsageEvent {
  keyId: string | null;
  clientId: string | null;
  endpoint: string;
  method: string;
  path: string;
  params: Record<string, string>;
  status: number;
  durationMs: number;
  ipPrefix: string;
  userAgent: string | null;
  requestId: string;
  drugId?: string | null;
}

const LOG_SAMPLE = 0.1;
const lastUsed = new Map<string, number>();

/** Query parameters as stored in the log: `q` truncated, cursors dropped, values capped. */
export function sanitizeParams(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp) {
    if (k === 'cursor') continue;
    out[k] = (k === 'q' ? v.slice(0, 40) : v).slice(0, 120);
  }
  return out;
}

export async function recordUsage(e: UsageEvent): Promise<void> {
  try {
    if (e.keyId) {
      await apiQuery(
        `insert into api.usage_daily (key_id, day, endpoint, requests, errors_4xx, errors_5xx)
         values ($1, (now() at time zone 'utc')::date, $2, 1, $3, $4)
         on conflict (key_id, day, endpoint) do update set
           requests = api.usage_daily.requests + 1,
           errors_4xx = api.usage_daily.errors_4xx + excluded.errors_4xx,
           errors_5xx = api.usage_daily.errors_5xx + excluded.errors_5xx`,
        [e.keyId, e.endpoint, e.status >= 400 && e.status < 500 ? 1 : 0, e.status >= 500 ? 1 : 0],
      );
      if (e.drugId) {
        await apiQuery(
          `insert into api.usage_drug_ids (key_id, day, drug_id) values ($1, (now() at time zone 'utc')::date, $2) on conflict do nothing`,
          [e.keyId, e.drugId],
        );
      }
      await apiQuery(`insert into api.usage_ips (key_id, hour, ip_prefix) values ($1, date_trunc('hour', now()), $2) on conflict do nothing`, [e.keyId, e.ipPrefix]);
      const last = lastUsed.get(e.keyId) ?? 0;
      if (Date.now() - last > 5 * 60_000) {
        lastUsed.set(e.keyId, Date.now());
        await apiQuery(`update api.api_keys set last_used_at = now() where id = $1`, [e.keyId]);
      }
    }
    if (e.status >= 400 || Math.random() < LOG_SAMPLE) {
      await apiQuery(
        `insert into api.request_log (key_id, client_id, method, path, params, status, duration_ms, ip_prefix, user_agent, request_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [e.keyId, e.clientId, e.method, e.path.slice(0, 300), JSON.stringify(e.params), e.status, e.durationMs, e.ipPrefix, e.userAgent?.slice(0, 200) ?? null, e.requestId],
      );
    }
  } catch (error) {
    console.error('usage recording failed', error);
  }
}
