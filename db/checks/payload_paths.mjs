// Inventory of every drugs.payload key path (depth <= 4, arrays shown as key[]) with the
// number of drugs holding a meaningful value and 2 sample values. Runs in 16 hash chunks:
// a single recursive pass spilled >1 GB of temp files and filled the 2 GB disk.
// usage: SUPABASE_ACCESS_TOKEN=... node payload_paths.mjs > payload_paths.json
import {readFileSync} from 'node:fs';

const ref = process.env.SUPABASE_PROJECT_REF || 'rksvuvxheduesqibykra';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required');
const tpl = readFileSync(new URL('../audit/04_payload_paths_chunk.sql', import.meta.url), 'utf8');

const agg = new Map();
for (let k = 0; k < 16; k++) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: tpl.replaceAll(':K', String(k))}),
  });
  if (!r.ok) { console.error('chunk', k, r.status, await r.text()); process.exit(1); }
  for (const row of await r.json()) {
    const a = agg.get(row.path) || {type: null, n: 0, samples: []};
    a.type = a.type || row.type;
    a.n += Number(row.drugs_with_value || 0);
    for (const s of row.samples || []) if (a.samples.length < 2 && s && !a.samples.includes(s)) a.samples.push(s);
    agg.set(row.path, a);
  }
}
console.log(JSON.stringify([...agg.entries()].sort((x, y) => x[0].localeCompare(y[0]))
  .map(([path, a]) => ({path, type: a.type, drugs_with_value: a.n, samples: a.samples})), null, 1));
