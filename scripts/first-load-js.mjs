// First-load JavaScript of a page = the <script src> files its HTML references,
// measured gzip-compressed (as served by `next start`). `noModule` scripts (the
// legacy-browser polyfills) are reported separately: modern browsers never load them.
// usage: BASE_URL=http://localhost:3000 node scripts/first-load-js.mjs /path [...]
import { gzipSync } from 'node:zlib';
const base = process.env.BASE_URL || 'http://localhost:3000';
for (const path of process.argv.slice(2)) {
  const html = await (await fetch(base + path)).text();
  const tags = [...html.matchAll(/<script[^>]+src="([^"]+)"[^>]*>/g)];
  const legacy = tags.filter((m) => /noModule/i.test(m[0])).map((m) => m[1]);
  const srcs = [...new Set(tags.filter((m) => !/noModule/i.test(m[0])).map((m) => m[1]))];
  let total = 0;
  const rows = [];
  for (const src of srcs) {
    const body = Buffer.from(await (await fetch(new URL(src, base))).arrayBuffer());
    const gz = gzipSync(body, { level: 6 }).length;
    total += gz;
    rows.push([gz, src]);
  }
  console.log(`${path}: ${srcs.length} scripts, ${(total / 1024).toFixed(1)} KB gzipped (modern browsers; ${legacy.length} noModule polyfill script(s) excluded)`);
  for (const [gz, src] of rows.sort((a, b) => b[0] - a[0])) console.log(`   ${(gz / 1024).toFixed(1).padStart(6)} KB  ${src}`);
}
