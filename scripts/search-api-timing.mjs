// Server time of GET /api/search: the route's Server-Timing (total = handler, db = web.search_drugs)
// and the client round trip, for a fixed set of queries, several rounds (round 1 is the cold one).
// usage: BASE_URL=http://localhost:3100 node scripts/search-api-timing.mjs [--rounds 3]
const args = process.argv.slice(2);
const rounds = Number(args[args.indexOf('--rounds') + 1]) || 3;
const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const QUERIES = ['بن', 'بنا', 'اوجمنتين', 'pa', 'pan', 'amox', 'كونجستال', 'سيتال', 'اوجمنتين 1g'];

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};
const num = (header, key) => {
  const m = new RegExp(`${key};dur=([\\d.]+)`).exec(header ?? '');
  return m ? Number(m[1]) : null;
};
const fmt = (x) => (x === null ? '  n/a' : `${x.toFixed(0)} ms`.padStart(7));

const samples = [];
for (let round = 1; round <= rounds; round++) {
  for (const q of QUERIES) {
    const t = performance.now();
    const res = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`, { headers: { 'Accept-Encoding': 'gzip, br' } });
    const body = await res.arrayBuffer();
    const rt = performance.now() - t;
    const st = res.headers.get('server-timing');
    samples.push({ round, q, status: res.status, rt, total: num(st, 'total'), db: num(st, 'db'), bytes: body.byteLength, results: JSON.parse(Buffer.from(body).toString()).results?.length ?? null });
  }
}
console.log(`base=${base} rounds=${rounds}`);
console.log('query'.padEnd(14), 'round1 rt', ' round1 db', ' | warm rt', ' warm total', ' warm db', ' results');
for (const q of QUERIES) {
  const s = samples.filter((x) => x.q === q);
  const cold = s[0];
  const warm = s.slice(1);
  console.log(
    q.padEnd(14),
    fmt(cold.rt),
    fmt(cold.db),
    ' |',
    fmt(median(warm.map((x) => x.rt))),
    fmt(median(warm.map((x) => x.total))),
    fmt(median(warm.map((x) => x.db))),
    String(cold.results).padStart(7),
  );
}
const warm = samples.filter((x) => x.round > 1);
console.log(
  `ALL: cold round-trip median ${fmt(median(samples.filter((x) => x.round === 1).map((x) => x.rt)))}, cold db median ${fmt(median(samples.filter((x) => x.round === 1).map((x) => x.db)))}; ` +
    `warm round-trip median ${fmt(median(warm.map((x) => x.rt)))}, warm total median ${fmt(median(warm.map((x) => x.total)))}, warm db median ${fmt(median(warm.map((x) => x.db)))}`,
);
