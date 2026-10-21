// Retired slugs -> current slug, for the 301 in src/proxy.ts. Retired rows are
// rare (renamed products, merged ingredients), so the whole map is held in
// memory and refreshed in the background every 10 minutes: no request waits
// on the database except the very first one after a cold start.
import { query } from '@/lib/db/pool';
import type { EntityType } from '@/lib/site';

const REFRESH_MS = 10 * 60 * 1000;
const RETRY_MS = 60 * 1000;

type RedirectMap = Map<string, string>; // "drug:old-slug" -> "new-slug"

let map: RedirectMap | null = null;
let loadedAt = 0;
let inflight: Promise<RedirectMap> | null = null;

async function load(): Promise<RedirectMap> {
  try {
    const rows = await query<{ entity_type: string; slug: string; current_slug: string }>(
      `select entity_type, slug, current_slug
       from web.slug_lookup
       where not is_current and current_slug is not null and current_slug <> slug`,
    );
    const next: RedirectMap = new Map();
    for (const r of rows) next.set(`${r.entity_type}:${r.slug}`, r.current_slug);
    map = next;
    loadedAt = Date.now();
    return next;
  } catch (error) {
    // Database unreachable: keep serving pages (from the ISR cache) without
    // redirects, and retry in a minute instead of making every request wait.
    console.error('retired-slug map refresh failed', error);
    map ??= new Map();
    loadedAt = Date.now() - REFRESH_MS + RETRY_MS;
    return map;
  }
}

function refresh(): Promise<RedirectMap> {
  inflight ??= load().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Current slug for a retired one, or null when the slug is current/unknown. */
export async function redirectTarget(type: EntityType, slug: string): Promise<string | null> {
  if (!map) {
    await refresh();
  } else if (Date.now() - loadedAt > REFRESH_MS) {
    void refresh().catch(() => undefined); // serve the old map while refreshing
  }
  return map?.get(`${type}:${slug}`) ?? null;
}
