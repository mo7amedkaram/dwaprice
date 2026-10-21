// Runs a SQL file (or -e "sql") through the Supabase Management API and prints TSV.
// usage: SUPABASE_ACCESS_TOKEN=... node run_sql.mjs ../audit/01_row_counts.sql
import {readFileSync} from 'node:fs';

const ref = process.env.SUPABASE_PROJECT_REF || 'rksvuvxheduesqibykra';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required');
const [a, b] = process.argv.slice(2);
const query = a === '-e' ? b : readFileSync(a, 'utf8');

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
  body: JSON.stringify({query}),
  signal: AbortSignal.timeout(300000),
});
const text = await r.text();
if (!r.ok) { console.error('HTTP', r.status, text); process.exit(1); }
const rows = JSON.parse(text);
if (Array.isArray(rows) && rows.length && typeof rows[0] === 'object') {
  const keys = Object.keys(rows[0]);
  console.log(keys.join('\t'));
  for (const row of rows) {
    console.log(keys.map(k => row[k] === null ? '∅' : typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k])).join('\t'));
  }
} else console.log(JSON.stringify(rows));
