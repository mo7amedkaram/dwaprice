// The English A-Z grouping (LETTER_EXPR) against the live read-only database. Opt-in via
// WEB_DATABASE_URL (or .env.local); skipped otherwise. Covers the brief: every listed drug lands
// in one of the 27 buckets, "Brufen" is under "b", and the grouping loses no drug.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BROWSE_LETTERS, LETTER_EXPR } from '@/lib/listing/logic';

function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}
const DB = envVar('WEB_DATABASE_URL');

(DB ? describe : describe.skip)('drug A-Z English grouping (live DB)', () => {
  it('buckets every listed drug into one of the 27 and puts Brufen under "b"', { timeout: 60_000 }, async () => {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const groups = (
        await client.query<{ letter: string; n: number }>(
          `select ${LETTER_EXPR} as letter, count(*)::int as n from web.drug_cards where indexable group by 1`,
        )
      ).rows;

      // every bucket the grouping produces is one of the fixed 27
      for (const g of groups) expect(BROWSE_LETTERS, `unexpected bucket "${g.letter}"`).toContain(g.letter);

      // "Brufen" (and anything whose English name starts with it) is under "b"
      const brufen = (
        await client.query<{ letter: string }>(
          `select distinct ${LETTER_EXPR} as letter from web.drug_cards where sort_name like 'brufen%'`,
        )
      ).rows;
      expect(brufen.length, 'no Brufen rows found').toBeGreaterThan(0);
      for (const r of brufen) expect(r.letter).toBe('b');

      // the grouping loses no indexable drug
      const total = (await client.query<{ n: number }>(`select count(*)::int as n from web.drug_cards where indexable`)).rows[0].n;
      expect(groups.reduce((s, g) => s + Number(g.n), 0)).toBe(total);
    } finally {
      await client.end();
    }
  });
});
