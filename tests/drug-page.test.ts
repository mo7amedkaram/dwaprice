// Section order and language toggle on a real drug page, and البدائل-view consistency, against a
// running server. Opt-in: set DRUG_PAGE_BASE_URL (e.g. http://localhost:3100); otherwise skipped.
//   npm run build && npx next start -p 3100
//   DRUG_PAGE_BASE_URL=http://localhost:3100 npx vitest run tests/drug-page.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isSubstitute } from '@/lib/drug/logic';

const BASE = process.env.DRUG_PAGE_BASE_URL?.replace(/\/$/, '');
const SLUG = process.env.DRUG_PAGE_SLUG || 'alerid-10mg-30-f-c-tabs';
const run = BASE ? describe : describe.skip;

function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}
const DB = envVar('WEB_DATABASE_URL');

run('drug page (live)', () => {
  it('orders the sections: price card → معلومات الدواء → المثائل → البدائل → تاريخ السعر', async () => {
    const html = await (await fetch(`${BASE}/dawa/${SLUG}`)).text();
    const at = (needle: string) => html.indexOf(needle);
    const priceButton = at('المثائل والبدائل'); // inside the price card (aside), which precedes the content column
    const info = at('id="info"');
    const similars = at('id="similars"');
    const substitutes = at('id="substitutes"');
    const history = at('id="history"');
    expect(info, 'معلومات الدواء present').toBeGreaterThan(-1);
    expect(history, 'تاريخ السعر present').toBeGreaterThan(-1);
    // price card (its button) comes before the drug-info section
    expect(priceButton).toBeGreaterThan(-1);
    expect(priceButton).toBeLessThan(info);
    // info before similars before substitutes before history (sections that exist)
    const order = [info, similars, substitutes, history].filter((i) => i > -1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(info).toBeLessThan(history);
    // exactly one H1
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
  });

  it('renders both languages for the info section with a toggle (English container present, lang=en)', async () => {
    const html = await (await fetch(`${BASE}/dawa/${SLUG}`)).text();
    expect(html).toContain('class="info-en"');
    expect(html).toMatch(/lang="en"[^>]*dir="ltr"|dir="ltr"[^>]*lang="en"/);
    expect(html).toContain('>عربي<'); // the toggle's Arabic button label
    expect(html).toContain('>English<');
  });
});

(DB ? describe : describe.skip)('web.drug_substitutes matches the isSubstitute rule (live)', () => {
  it('every substitute the view returns satisfies the rule for several source drugs', { timeout: 60_000 }, async () => {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const atc = async (slug: string) =>
        (await client.query<{ atc_prefixes: string[]; route_class: string | null; n: number }>(
          `select atc_prefixes, route_class, coalesce(array_length(ingredient_keys,1),0) n
           from web.drug_cards where slug=$1`,
          [slug],
        )).rows[0];
      for (const slug of ['bisoprol-5mg-20-f-c-tab', 'augmentin-1gm-14-tablets', 'alerid-10mg-30-f-c-tabs']) {
        const src = await atc(slug);
        if (!src) continue;
        const alts = (await client.query<{ alt_slug: string }>('select alt_slug from web.drug_substitutes where slug=$1 limit 25', [slug])).rows;
        expect(alts.length).toBeGreaterThan(0);
        for (const { alt_slug } of alts) {
          const a = await atc(alt_slug);
          expect(
            isSubstitute({ atcPrefixes: src.atc_prefixes, routeClass: src.route_class, ingredientCount: src.n }, { atcPrefixes: a.atc_prefixes, routeClass: a.route_class, ingredientCount: a.n }),
            `${slug} -> ${alt_slug}`,
          ).toBe(true);
        }
      }
    } finally {
      await client.end();
    }
  });
});
