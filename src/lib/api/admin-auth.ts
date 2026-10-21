import 'server-only';
// Admin accounts (api.admin_users): scrypt password hashes, lockout after repeated failures,
// per-network attempt limits. Used by the admin login action and the CLI.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { apiQuery } from './db';
import { hit } from './ratelimit';

// promisify() picks the 3-argument overload; keep the options by wrapping the callback form
const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LEN = 32;
export const MAX_FAILURES = 8;
export const LOCK_MINUTES = 15;
export const PASSWORD_MIN = 12;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export interface AdminRow {
  id: string;
  email: string;
  name: string | null;
  status: 'active' | 'disabled';
}

export type AdminLoginResult = { ok: true; admin: AdminRow } | { ok: false; reason: 'invalid' | 'locked' | 'limited' };

/** Checks credentials; always runs the hash (no user enumeration by timing) and tracks failures. */
export async function loginAdmin(emailRaw: string, password: string, ipPrefix: string): Promise<AdminLoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const [perIp] = await hit([{ scope: `adminlogin:${ipPrefix}:m`, window: 'minute' }]);
  if (perIp.count > 10) return { ok: false, reason: 'limited' };
  const rows = await apiQuery<AdminRow & { password_hash: string; failed_attempts: number; locked_until: Date | null }>(
    'select id, email, name, status, password_hash, failed_attempts, locked_until from api.admin_users where email = $1',
    [email],
  );
  const admin = rows[0];
  // a dummy hash keeps the timing of unknown and known addresses alike
  const stored = admin?.password_hash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  const valid = await verifyPassword(password, stored);
  if (!admin) return { ok: false, reason: 'invalid' };
  if (admin.locked_until && new Date(admin.locked_until).getTime() > Date.now()) return { ok: false, reason: 'locked' };
  if (!valid || admin.status !== 'active') {
    await apiQuery(
      `update api.admin_users set failed_attempts = failed_attempts + 1,
         locked_until = case when failed_attempts + 1 >= $2 then now() + ($3 || ' minutes')::interval else locked_until end
       where id = $1`,
      [admin.id, MAX_FAILURES, String(LOCK_MINUTES)],
    );
    return { ok: false, reason: 'invalid' };
  }
  await apiQuery('update api.admin_users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1', [admin.id]);
  return { ok: true, admin: { id: admin.id, email: admin.email, name: admin.name, status: admin.status } };
}

export async function getAdmin(id: string): Promise<AdminRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const rows = await apiQuery<AdminRow>('select id, email, name, status from api.admin_users where id = $1', [id]);
  return rows[0] ?? null;
}

export async function setAdminPassword(email: string, password: string, name?: string): Promise<AdminRow> {
  if (password.length < PASSWORD_MIN) throw new Error(`password must be at least ${PASSWORD_MIN} characters`);
  const hash = await hashPassword(password);
  const rows = await apiQuery<AdminRow>(
    `insert into api.admin_users (email, name, password_hash) values ($1, $2, $3)
     on conflict (email) do update set password_hash = excluded.password_hash, name = coalesce(excluded.name, api.admin_users.name),
       password_changed_at = now(), failed_attempts = 0, locked_until = null, status = 'active'
     returning id, email, name, status`,
    [email.trim().toLowerCase(), name ?? null, hash],
  );
  return rows[0];
}
