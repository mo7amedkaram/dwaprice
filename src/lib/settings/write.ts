import 'server-only';
// Admin writes to the editable site settings and assets, using the write-capable role api_app
// (api schema). Every change records an audit row (old -> new, who) and revalidates the
// 'site-settings' tag so the public site picks it up within seconds. Callers are admin server
// actions that have already passed requireAdminSession(); these functions do no auth of their own.
import { revalidateTag } from 'next/cache';
import { apiQuery } from '@/lib/api/db';
import { tags } from '@/lib/cache';
import { SETTING_GROUPS, type SettingGroup, type SiteSettings } from './config';

/** Current stored value of one settings group (null when never saved). */
export async function readGroup<G extends SettingGroup>(group: G): Promise<SiteSettings[G] | null> {
  const rows = await apiQuery<{ value: SiteSettings[G] }>('select value from api.site_settings where key = $1', [group]);
  return rows[0]?.value ?? null;
}

/** Stored row of a group including who changed it and when (null when never saved) — for the admin "last changed" line. */
export async function groupRow<G extends SettingGroup>(group: G): Promise<{ updated_at: string | Date; updated_by: string | null } | null> {
  const rows = await apiQuery<{ updated_at: string | Date; updated_by: string | null }>('select updated_at, updated_by from api.site_settings where key = $1', [group]);
  return rows[0] ?? null;
}

/** Upsert one settings group, append an audit row, and revalidate the public cache. */
export async function saveGroup<G extends SettingGroup>(group: G, value: SiteSettings[G], by: string): Promise<void> {
  if (!SETTING_GROUPS.includes(group)) throw new Error('unknown settings group');
  const old = await readGroup(group);
  await apiQuery(
    `insert into api.site_settings (key, value, updated_by) values ($1, $2, $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [group, JSON.stringify(value), by],
  );
  await apiQuery('insert into api.site_settings_audit (key, old_value, new_value, changed_by) values ($1, $2, $3, $4)', [
    group,
    old === null ? null : JSON.stringify(old),
    JSON.stringify(value),
    by,
  ]);
  revalidateTag(tags.settings, 'max');
}

/** Store a set of generated binary assets (favicon.ico, icon-*.png, …), audit once, and revalidate. */
export async function putAssets(assets: Array<{ name: string; bytes: Buffer; contentType: string }>, by: string): Promise<void> {
  for (const a of assets) {
    await apiQuery(
      `insert into api.site_assets (name, bytes, content_type, updated_by) values ($1, $2, $3, $4)
       on conflict (name) do update set bytes = excluded.bytes, content_type = excluded.content_type, updated_at = now(), updated_by = excluded.updated_by`,
      [a.name, a.bytes, a.contentType, by],
    );
  }
  await apiQuery('insert into api.site_settings_audit (key, old_value, new_value, changed_by) values ($1, $2, $3, $4)', [
    'assets',
    null,
    JSON.stringify({ uploaded: assets.map((a) => a.name) }),
    by,
  ]);
  revalidateTag(tags.settings, 'max');
}

/** Whether a custom favicon has been uploaded (any icon asset present). */
export async function hasCustomIcon(): Promise<boolean> {
  const rows = await apiQuery<{ n: string }>("select count(*) n from api.site_assets where name = 'favicon.ico'");
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Remove a set of assets (e.g. reset the favicon to the built-in icon) and revalidate. */
export async function deleteAssets(names: string[], by: string): Promise<void> {
  if (names.length === 0) return;
  await apiQuery('delete from api.site_assets where name = any($1::text[])', [names]);
  await apiQuery('insert into api.site_settings_audit (key, old_value, new_value, changed_by) values ($1, $2, $3, $4)', ['assets', JSON.stringify(names), null, by]);
  revalidateTag(tags.settings, 'max');
}

export interface AuditRow {
  id: string;
  key: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string | null;
  changed_at: string | Date;
}

/** Recent settings changes, newest first (audit log page). */
export async function recentAudit(limit = 100): Promise<AuditRow[]> {
  return apiQuery<AuditRow>(
    'select id::text, key, old_value, new_value, changed_by, changed_at from api.site_settings_audit order by changed_at desc, id desc limit $1',
    [Math.min(Math.max(limit, 1), 500)],
  );
}
