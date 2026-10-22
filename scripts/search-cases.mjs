// Real search cases through the local index, for the report (Part 6.3): the brief's six shapes
// plus a couple more. Loads the generated index and runs the engine exactly as the worker does.
// usage: node scripts/search-cases.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { SearchEngine } = await import('../src/lib/search/engine.ts').catch(async () => {
  // run under tsx if imported as .ts fails (node cannot load TS): re-exec note printed by the runner
  throw new Error('run with: npx tsx scripts/search-cases.mjs');
});

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../data/search-index/manifest.json', import.meta.url)), 'utf8'));
const index = JSON.parse(readFileSync(fileURLToPath(new URL(`../data/search-index/${manifest.file}`, import.meta.url)), 'utf8'));
const engine = new SearchEngine(index);

const CASES = [
  ['two Arabic letters', 'بن'],
  ['ى instead of ي', 'مستشفى'],
  ['ه instead of ة (form word)', 'كبسوله'],
  ['one-letter typo', 'اوجمنتن'],
  ['English brand name', 'augmentin'],
  ['ingredient name', 'amoxicillin'],
  ['mixed Arabic + Latin strength', 'اوجمنتين 1g'],
  ['English typo', 'zithromx'],
];
const TIER = ['exact', 'name-prefix', 'word-prefix', 'alias', 'ingredient', 'substring', 'fuzzy'];

for (const [label, q] of CASES) {
  const t = performance.now();
  const r = engine.search(q);
  const ms = (performance.now() - t).toFixed(1);
  console.log(`\n### ${label} — «${q}»  (${r.length} results, ${ms} ms)`);
  for (const s of r.slice(0, 5)) {
    const parts = [`[${TIER[s.tier] ?? s.tier}]`, s.ar, `| ${s.en}`];
    if (s.form) parts.push(`• ${s.form}`);
    if (s.ingredient) parts.push(`• ${s.ingredient}`);
    console.log('  ' + parts.join(' '));
  }
}
