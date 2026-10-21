import 'server-only';
// Key issuance shared by the developer dashboard and the admin page (server side only).
import { apiQuery } from './db';
import { forgetKey, type PlanRow } from './auth';
import { generateKey } from './keys';

export const DEFAULT_SCOPES: Record<string, string[]> = {
  starter: ['drugs:read', 'changes:read'],
  business: ['drugs:read', 'changes:read'],
  enterprise: ['drugs:read', 'changes:read', 'export', 'webhooks'],
};

export interface KeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  status: 'active' | 'revoked';
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date | null;
  rotated_from: string | null;
  /** Active and not expired (computed by the database, so pages stay pure). */
  live: boolean;
  /** Active with a rotation expiry still ahead. */
  expiring: boolean;
}

const KEY_COLUMNS = `id, name, key_prefix, scopes, status, created_at, last_used_at, expires_at, rotated_from,
  (status = 'active' and (expires_at is null or expires_at > now())) as live,
  (status = 'active' and expires_at is not null and expires_at > now()) as expiring`;

export interface IssuedKey {
  /** The full key: shown once, never stored. */
  key: string;
  row: KeyRow;
}

export async function activeKeyCount(clientId: string): Promise<number> {
  const rows = await apiQuery<{ n: string }>(`select count(*) as n from api.api_keys where client_id = $1 and status = 'active' and (expires_at is null or expires_at > now())`, [clientId]);
  return Number(rows[0]?.n ?? 0);
}

export async function clientPlan(clientId: string): Promise<(PlanRow & { client_status: string }) | null> {
  const rows = await apiQuery<PlanRow & { client_status: string }>(
    `select p.id, p.name, p.rpm, p.monthly_quota, p.max_keys, p.feed_window_days, p.features, c.status as client_status
     from api.clients c join api.plans p on p.id = c.plan_id where c.id = $1`,
    [clientId],
  );
  return rows[0] ?? null;
}

/** Creates a key for the client (plan scopes unless given). Throws when the plan's key limit is reached. */
export async function issueKey(clientId: string, name: string, scopes?: string[], rotatedFrom: string | null = null): Promise<IssuedKey> {
  const plan = await clientPlan(clientId);
  if (!plan) throw new Error('client not found');
  if (!rotatedFrom && (await activeKeyCount(clientId)) >= plan.max_keys) throw new Error(`plan ${plan.name} allows ${plan.max_keys} active key(s)`);
  const k = generateKey();
  const rows = await apiQuery<KeyRow>(
    `insert into api.api_keys (client_id, name, key_prefix, key_hash, scopes, rotated_from)
     values ($1, $2, $3, $4, $5, $6) returning ${KEY_COLUMNS}`,
    [clientId, name.slice(0, 60) || 'default', k.prefix, k.hash, scopes ?? DEFAULT_SCOPES[plan.id] ?? ['drugs:read'], rotatedFrom],
  );
  return { key: k.key, row: rows[0] };
}

/** New key with the same name and scopes; the old one keeps working for 24 hours. */
export async function rotateKey(clientId: string, keyId: string): Promise<IssuedKey | null> {
  const rows = await apiQuery<KeyRow & { key_hash: string }>(`select ${KEY_COLUMNS}, key_hash from api.api_keys where id = $1 and client_id = $2 and status = 'active'`, [keyId, clientId]);
  const old = rows[0];
  if (!old) return null;
  const issued = await issueKey(clientId, old.name, old.scopes, old.id);
  await apiQuery(`update api.api_keys set expires_at = least(coalesce(expires_at, 'infinity'), now() + interval '24 hours') where id = $1`, [old.id]);
  forgetKey(old.key_hash);
  return issued;
}

export async function revokeKey(clientId: string | null, keyId: string): Promise<boolean> {
  const rows = await apiQuery<{ key_hash: string }>(
    `update api.api_keys set status = 'revoked', revoked_at = now() where id = $1 and ($2::uuid is null or client_id = $2) and status = 'active' returning key_hash`,
    [keyId, clientId],
  );
  if (rows[0]) forgetKey(rows[0].key_hash);
  return rows.length > 0;
}

export async function listKeys(clientId: string): Promise<KeyRow[]> {
  return apiQuery<KeyRow>(`select ${KEY_COLUMNS} from api.api_keys where client_id = $1 order by created_at desc`, [clientId]);
}
