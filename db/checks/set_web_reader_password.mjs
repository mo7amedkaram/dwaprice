// Rotates the web_reader password. Generates a random password locally, sends only its
// SCRAM-SHA-256 verifier to the database (the plaintext never reaches the server or its
// logs) and writes WEB_DATABASE_URL to the file given as argument (keep it out of git).
// usage: SUPABASE_ACCESS_TOKEN=... node set_web_reader_password.mjs ../../.env.web_reader
import {randomBytes, pbkdf2Sync, createHmac, createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';

const ref = process.env.SUPABASE_PROJECT_REF || 'rksvuvxheduesqibykra';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const out = process.argv[2];
if (!token || !out) throw new Error('usage: SUPABASE_ACCESS_TOKEN=... node set_web_reader_password.mjs <env file to write>');

const password = randomBytes(32).toString('base64url');
const salt = randomBytes(16);
const iterations = 4096;
const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const storedKey = createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest();
const serverKey = createHmac('sha256', salted).update('Server Key').digest();
const verifier = `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
  body: JSON.stringify({query: `alter role web_reader password '${verifier}'`}),
});
if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
writeFileSync(out,
  '# dwaprice.com — read-only role web_reader. Server-side only; never expose as NEXT_PUBLIC_*.\n' +
  '# Supavisor transaction mode (6543); session mode is port 5432 on the same host.\n' +
  `WEB_DATABASE_URL=postgresql://web_reader.${ref}:${password}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres\n`);
console.log(`web_reader password rotated; connection string written to ${out}`);
