// Rate limiting (docs/API_SPEC.md §4): fixed windows per minute, day (sample IPs) and
// calendar month (quota). Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set,
// otherwise api.rate_buckets in Postgres (one statement per request).
import { apiQuery } from './db';

export type Window = 'minute' | 'day' | 'month';

export interface Hit {
  scope: string;
  window: Window;
}

export interface HitResult {
  count: number;
  /** Unix seconds when the window resets. */
  reset: number;
}

function windowStart(w: Window, now = new Date()): Date {
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  if (w === 'day') d.setUTCHours(0, 0, 0, 0);
  if (w === 'month') {
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(1);
  }
  return d;
}

export function windowReset(w: Window, now = new Date()): number {
  const d = windowStart(w, now);
  if (w === 'minute') d.setUTCMinutes(d.getUTCMinutes() + 1);
  if (w === 'day') d.setUTCDate(d.getUTCDate() + 1);
  if (w === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  return Math.floor(d.getTime() / 1000);
}

async function hitUpstash(hits: Hit[], now: Date): Promise<HitResult[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const commands: unknown[][] = [];
  for (const h of hits) {
    const start = windowStart(h.window, now).getTime() / 1000;
    const key = `rl:${h.scope}:${h.window}:${start}`;
    commands.push(['INCR', key], ['EXPIRE', key, windowReset(h.window, now) - Math.floor(now.getTime() / 1000) + 60, 'NX']);
  }
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const out = (await res.json()) as Array<{ result: number }>;
  return hits.map((h, i) => ({ count: Number(out[i * 2].result), reset: windowReset(h.window, now) }));
}

async function hitPostgres(hits: Hit[], now: Date): Promise<HitResult[]> {
  const values = hits.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::timestamptz)`).join(', ');
  const params = hits.flatMap((h) => [h.scope, windowStart(h.window, now).toISOString()]);
  const rows = await apiQuery<{ scope: string; count: number }>(
    `insert into api.rate_buckets (scope, window_start, count)
     select v.scope, v.window_start, 1 from (values ${values}) as v(scope, window_start)
     on conflict (scope, window_start) do update set count = api.rate_buckets.count + 1
     returning scope, count`,
    params,
  );
  return hits.map((h) => ({ count: Number(rows.find((r) => r.scope === h.scope)?.count ?? 0), reset: windowReset(h.window, now) }));
}

/** Increments every window and returns the counts (fail-open on a store error: counts 0). */
export async function hit(hits: Hit[], now = new Date()): Promise<HitResult[]> {
  try {
    return process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? await hitUpstash(hits, now) : await hitPostgres(hits, now);
  } catch (error) {
    console.error('rate limiter unavailable', error);
    return hits.map((h) => ({ count: 0, reset: windowReset(h.window, now) }));
  }
}
