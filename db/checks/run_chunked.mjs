// Runs a SQL file containing :K / :N placeholders once per hash chunk and sums column n
// per (metric, key). Keeps temp-file usage small on the project's 2 GB disk.
// usage: SUPABASE_ACCESS_TOKEN=... node run_chunked.mjs ../audit/12_content_quality_chunk.sql 8
import {readFileSync} from 'node:fs';

const ref = process.env.SUPABASE_PROJECT_REF || 'rksvuvxheduesqibykra';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required');
const [file, N] = [process.argv[2], Number(process.argv[3] || 8)];
const tpl = readFileSync(file, 'utf8');

const acc = new Map();
for (let k = 0; k < N; k++) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: tpl.replaceAll(':K', String(k)).replaceAll(':N', String(N))}),
    signal: AbortSignal.timeout(300000),
  });
  if (!r.ok) { console.error('chunk', k, r.status, await r.text()); process.exit(1); }
  for (const row of await r.json()) {
    const key = `${row.metric}\t${row.key}`;
    acc.set(key, (acc.get(key) || 0) + Number(row.n));
  }
}
console.log('metric\tkey\tn');
for (const [k, v] of [...acc.entries()].sort()) console.log(`${k}\t${v}`);
