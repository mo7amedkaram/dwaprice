#!/usr/bin/env node
// Admin CLI for the Drug Prices API (until the admin page of phase 3): plans, clients, keys,
// usage and alerts. Talks to the database as api_app (API_DATABASE_URL from the environment
// or .env.local). Keys are printed ONCE; only their SHA-256 hash is stored.
//
//   node scripts/api-admin.mjs plans
//   node scripts/api-admin.mjs client:create --company "Pharmacy X" --contact "Name" --email a@b.c --plan starter [--phone ..]
//   node scripts/api-admin.mjs client:list | client:suspend <id> | client:activate <id> | client:plan <id> <plan>
//   node scripts/api-admin.mjs client:paid <id> <YYYY-MM-DD> [billing reference]
//   node scripts/api-admin.mjs client:allowlist <id> 1.2.3.0/24,5.6.7.8
//   node scripts/api-admin.mjs key:create <clientId> [--name default] [--scopes drugs:read,changes:read]
//   node scripts/api-admin.mjs key:list <clientId> | key:rotate <keyId> | key:revoke <keyId>
//   node scripts/api-admin.mjs usage <clientId> [days] | alerts | requests
//   node scripts/api-admin.mjs admin:create --email a@b.c --name "Name" [--password ...] | admin:password --email a@b.c [--password ...]
//   node scripts/api-admin.mjs admin:list | admin:disable --email a@b.c
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}
const url = env('API_DATABASE_URL');
if (!url) throw new Error('API_DATABASE_URL is required');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (text, params = []) => (await client.query(text, params)).rows;

const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    flags[rest[i].slice(2)] = rest[i + 1] ?? true;
    i++;
  } else args.push(rest[i]);
}
const print = (rows) => console.table(rows);

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
function base32(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function newKey() {
  const key = `dp_live_${base32(randomBytes(25))}`;
  return { key, prefix: key.slice(0, 16), hash: createHash('sha256').update(key).digest('hex') };
}
// Same format as src/lib/api/admin-auth.ts: scrypt$N$r$p$salt$hash (base64)
function hashPassword(password) {
  const N = 2 ** 15, r = 8, p = 1;
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize('NFKC'), salt, 32, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
function newPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  return Array.from(randomBytes(20), (b) => alphabet[b % alphabet.length]).join('');
}

const DEFAULT_SCOPES = { sample: [], starter: ['drugs:read', 'changes:read'], business: ['drugs:read', 'changes:read'], enterprise: ['drugs:read', 'changes:read', 'export', 'webhooks'] };

async function issueKey(clientId, name, scopes, rotatedFrom = null) {
  const [c] = await q('select c.id, c.plan_id, p.max_keys, (select count(*) from api.api_keys k where k.client_id = c.id and k.status = $2) as active from api.clients c join api.plans p on p.id = c.plan_id where c.id = $1', [clientId, 'active']);
  if (!c) throw new Error('client not found');
  if (Number(c.active) >= c.max_keys && !rotatedFrom) throw new Error(`plan ${c.plan_id} allows ${c.max_keys} active key(s)`);
  const k = newKey();
  const [row] = await q(
    'insert into api.api_keys (client_id, name, key_prefix, key_hash, scopes, rotated_from) values ($1, $2, $3, $4, $5, $6) returning id, key_prefix, scopes, created_at',
    [clientId, name, k.prefix, k.hash, scopes ?? DEFAULT_SCOPES[c.plan_id] ?? ['drugs:read'], rotatedFrom],
  );
  console.log('\nNEW KEY (shown once, store it now):\n');
  console.log(`  ${k.key}\n`);
  print([row]);
  return row;
}

try {
  switch (cmd) {
    case 'plans':
      print(await q('select id, name, rpm, monthly_quota, max_keys, feed_window_days, price_egp_monthly, is_public, features from api.plans order by sort'));
      break;
    case 'client:create': {
      for (const f of ['company', 'contact', 'email', 'plan']) if (!flags[f]) throw new Error(`--${f} is required`);
      const [row] = await q('insert into api.clients (company, contact_name, email, phone, plan_id) values ($1, $2, $3, $4, $5) returning id, company, plan_id, status, created_at',
        [flags.company, flags.contact, flags.email, flags.phone ?? null, flags.plan]);
      print([row]);
      break;
    }
    case 'client:list':
      print(await q('select c.id, c.company, c.contact_name, c.email, c.plan_id, c.status, c.paid_until, (select count(*) from api.api_keys k where k.client_id = c.id and k.status = $1) as keys from api.clients c order by c.created_at', ['active']));
      break;
    case 'client:suspend':
    case 'client:activate':
      print(await q('update api.clients set status = $2, updated_at = now() where id = $1 returning id, company, status', [args[0], cmd.endsWith('suspend') ? 'suspended' : 'active']));
      break;
    case 'client:plan':
      print(await q('update api.clients set plan_id = $2, updated_at = now() where id = $1 returning id, company, plan_id', [args[0], args[1]]));
      break;
    case 'client:paid':
      print(await q('update api.clients set paid_until = $2, billing_reference = coalesce($3, billing_reference), updated_at = now() where id = $1 returning id, company, paid_until, billing_reference', [args[0], args[1], args[2] ?? null]));
      break;
    case 'client:allowlist':
      print(await q('update api.clients set ip_allowlist = $2::cidr[], updated_at = now() where id = $1 returning id, company, ip_allowlist', [args[0], (args[1] ?? '').split(',').filter(Boolean)]));
      break;
    case 'key:create':
      await issueKey(args[0], flags.name ?? 'default', flags.scopes ? flags.scopes.split(',') : null);
      break;
    case 'key:list':
      print(await q('select id, name, key_prefix, scopes, status, created_at, last_used_at, expires_at, rotated_from from api.api_keys where client_id = $1 order by created_at', [args[0]]));
      break;
    case 'key:rotate': {
      const [old] = await q('select * from api.api_keys where id = $1 and status = $2', [args[0], 'active']);
      if (!old) throw new Error('active key not found');
      await issueKey(old.client_id, old.name, old.scopes, old.id);
      await q("update api.api_keys set expires_at = now() + interval '24 hours' where id = $1", [old.id]);
      console.log(`old key ${old.key_prefix}… keeps working for 24 hours`);
      break;
    }
    case 'key:revoke':
      print(await q("update api.api_keys set status = 'revoked', revoked_at = now() where id = $1 returning id, key_prefix, status, revoked_at", [args[0]]));
      break;
    case 'usage':
      print(await q(`select u.day, k.key_prefix, u.endpoint, u.requests, u.errors_4xx, u.errors_5xx from api.usage_daily u join api.api_keys k on k.id = u.key_id
                     where k.client_id = $1 and u.day >= current_date - $2::int order by u.day desc, u.requests desc limit 200`, [args[0], Number(args[1] ?? 7)]));
      break;
    case 'alerts':
      print(await q('select id, at, kind, key_id, client_id, details, notified_at from api.alerts order by at desc limit 50'));
      break;
    case 'requests':
      print(await q('select at, key_id, method, path, status, duration_ms, ip_prefix from api.request_log order by at desc limit 50'));
      break;
    case 'admin:create':
    case 'admin:password': {
      if (!flags.email) throw new Error('--email is required');
      const password = typeof flags.password === 'string' ? flags.password : newPassword();
      if (password.length < 12) throw new Error('password must be at least 12 characters');
      const [row] = await q(
        `insert into api.admin_users (email, name, password_hash) values ($1, $2, $3)
         on conflict (email) do update set password_hash = excluded.password_hash, name = coalesce(excluded.name, api.admin_users.name),
           password_changed_at = now(), failed_attempts = 0, locked_until = null, status = 'active'
         returning id, email, name, status, password_changed_at`,
        [flags.email.trim().toLowerCase(), typeof flags.name === 'string' ? flags.name : null, hashPassword(password)],
      );
      print([row]);
      if (typeof flags.password !== 'string') console.log(`
PASSWORD (shown once, store it now): ${password}
`);
      console.log('log in at /admin/api/login');
      break;
    }
    case 'admin:list':
      print(await q('select id, email, name, status, failed_attempts, locked_until, last_login_at, password_changed_at from api.admin_users order by created_at'));
      break;
    case 'admin:disable':
      print(await q("update api.admin_users set status = 'disabled' where email = $1 returning id, email, status", [String(flags.email ?? '').toLowerCase()]));
      break;
    default:
      console.log('unknown command; see the header of this file');
  }
} finally {
  await client.end();
}
