import 'server-only';
// Public, read-only access to the editable site settings and uploaded assets. Uses the website's
// read-only role (web_reader) through the web.site_settings / web.site_assets views, wrapped in a
// tagged cache ('site-settings'); saving a setting in the admin area calls revalidateTag, so the
// live site updates within seconds with no deploy. Every read merges the database over the code
// defaults and is wrapped in try/catch returning the defaults, so a database hiccup never makes a
// page 500 or fails the build.
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { tags } from '@/lib/cache';
import { defaultSettings, type SiteSettings } from './config';

interface SettingRow {
  key: string;
  value: unknown;
}

function merge(rows: SettingRow[]): SiteSettings {
  const base = defaultSettings();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const over = <K extends keyof SiteSettings>(key: K): SiteSettings[K] => {
    const v = byKey.get(key);
    if (v && typeof v === 'object') {
      // shallow-merge group fields (and the nested social object) so partial saves keep defaults
      const social = (v as { social?: unknown }).social;
      return {
        ...base[key],
        ...(v as object),
        ...('social' in base[key] && social && typeof social === 'object'
          ? { social: { ...(base[key] as { social: object }).social, ...(social as object) } }
          : {}),
      } as SiteSettings[K];
    }
    return base[key];
  };
  return { seo: over('seo'), analytics: over('analytics'), verification: over('verification'), contact: over('contact') };
}

const load = unstable_cache(
  async (): Promise<SiteSettings> => {
    try {
      const rows = await query<SettingRow>('select key, value from web.site_settings');
      return merge(rows);
    } catch {
      return defaultSettings();
    }
  },
  // Key bumped when a CODE default changes (v2: the home title now starts with the site name): the
  // data cache persists across builds, so a stale computed default would otherwise survive a deploy.
  ['site-settings-v2'],
  { tags: [tags.settings], revalidate: 3600 },
);

/** The merged site settings (defaults + database overrides). Never throws. */
export function getSiteSettings(): Promise<SiteSettings> {
  return load();
}

export interface StoredAsset {
  /** base64 of the bytes (unstable_cache cannot serialise a Buffer). */
  base64: string;
  contentType: string;
  updatedAt: string;
}

const loadAsset = unstable_cache(
  async (name: string): Promise<StoredAsset | null> => {
    try {
      const rows = await query<{ bytes: Buffer; content_type: string; updated_at: string | Date }>(
        'select bytes, content_type, updated_at from web.site_assets where name = $1',
        [name],
      );
      const row = rows[0];
      if (!row) return null;
      return { base64: row.bytes.toString('base64'), contentType: row.content_type, updatedAt: String(row.updated_at) };
    } catch {
      return null;
    }
  },
  ['site-asset-v1'],
  { tags: [tags.settings], revalidate: 86_400 },
);

/** A stored asset by name (favicon.ico, icon-192.png, …), or null when none is uploaded. */
export function getSiteAsset(name: string): Promise<StoredAsset | null> {
  return loadAsset(name);
}
