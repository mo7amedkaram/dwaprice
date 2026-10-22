// Client/server normalisation parity: src/lib/search/normalize.ts (bundled into the browser's
// search worker and used by the index generator) must return exactly what the database's
// web.search_normalize returns, because /api/search and the stored aliases use that function.
// tests/fixtures/normalize-parity.json holds inputs with the database's answers (crafted edge
// cases plus real names; regenerate it with the script in docs/search/README.md). When a
// database is reachable (WEB_DATABASE_URL in the environment or .env.local) the fixture is
// also re-checked live.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeSearch, searchTokens } from '@/lib/search/normalize';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/normalize-parity.json', import.meta.url), 'utf8')) as {
  cases: Array<{ in: string; out: string }>;
};

function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

describe('normalizeSearch = web.search_normalize (fixture from the database)', () => {
  it(`matches all ${fixture.cases.length} recorded cases`, () => {
    const mismatches = fixture.cases.filter((c) => normalizeSearch(c.in) !== c.out).map((c) => ({ in: c.in, db: c.out, client: normalizeSearch(c.in) }));
    expect(mismatches).toEqual([]);
  });

  it('applies the rules of the brief', () => {
    expect(normalizeSearch('أإآٱ')).toBe('اااا');
    expect(normalizeSearch('مستشفى')).toBe('مستشفي');
    expect(normalizeSearch('كبسولة')).toBe('كبسوله');
    expect(normalizeSearch('رؤوف هيئة')).toBe('رووف هييه');
    expect(normalizeSearch('بَنَادُولْ')).toBe('بنادول'); // tashkeel
    expect(normalizeSearch('بـــنادول')).toBe('بنادول'); // tatweel
    expect(normalizeSearch('١٢٣ ۴۵۶')).toBe('123 456'); // Arabic-Indic and Persian digits
    expect(normalizeSearch('  PANADOL   Extra ')).toBe('panadol extra'); // lower-case, collapsed spaces
    expect(normalizeSearch('f.c. tabs (n/a)')).toBe('f c tabs n a'); // punctuation
    expect(normalizeSearch('اوجمنتين 1g')).toBe('اوجمنتين 1 g'); // digit/Latin boundary
    expect(normalizeSearch('480مجم')).toBe('480مجم'); // no boundary for Arabic letters (same as the database)
    expect(normalizeSearch('')).toBe('');
    expect(normalizeSearch(null)).toBe('');
    expect(searchTokens('Co-Diovan 160/12.5mg')).toEqual(['co', 'diovan', '160', '12', '5', 'mg']);
    expect(searchTokens('   ')).toEqual([]);
  });

  it('is idempotent', () => {
    for (const c of fixture.cases) expect(normalizeSearch(c.out)).toBe(c.out);
  });
});

const DB = envVar('WEB_DATABASE_URL');
(DB ? describe : describe.skip)('live check against web.search_normalize', () => {
  it('agrees on the fixture inputs and on a few more strings', { timeout: 60_000 }, async () => {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const inputs = [...fixture.cases.map((c) => c.in), 'Panadol® Extra 500mg', 'أمُوكسيسيلّين ٥٠٠ مجم', 'ibuprofen-400 F.C.TABS'];
      const r = await client.query<{ i: string; o: string | null }>('select i, web.search_normalize(i) as o from unnest($1::text[]) as i', [inputs]);
      const mismatches = r.rows.filter((row) => normalizeSearch(row.i) !== (row.o ?? '')).map((row) => ({ in: row.i, db: row.o, client: normalizeSearch(row.i) }));
      expect(mismatches).toEqual([]);
    } finally {
      await client.end();
    }
  });
});
