// Wildcard search ("Au*in", "Br?fen", "أو*ين"): parsing guards, the engine tier, ranking, highlighting,
// the SQL pattern builder (nothing typed reaches Postgres as a regex), and a performance check over
// the real built index when it is on disk (npm run build:index).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SearchEngine, TIER } from '@/lib/search/engine';
import { highlightSegments } from '@/lib/search/engine-shared';
import { buildSearchIndex, type DrugSource, type IngredientSource } from '@/lib/search/index-build';
import type { SearchIndexFile } from '@/lib/search/index-format';
import { isWildcardQuery, parseWildcard, toSqlWildcard, WILDCARD_LIMIT, WILDCARD_MESSAGES, wildcardProblem, wildcardSegments } from '@/lib/search/wildcard';

const INGREDIENTS: IngredientSource[] = [
  { ingredient_key: 'cid:amox', name_en: 'Amoxicillin', name_ar: 'أموكسيسيلين' },
  { ingredient_key: 'cid:ibu', name_en: 'Ibuprofen', name_ar: 'إيبوبروفين' },
];
const drug = (slug: string, ar: string, en: string, extra: Partial<DrugSource> = {}): DrugSource => ({
  slug, name_ar: ar, name_en: en, price_list_name: en, dosage_form_ar: 'أقراص', ingredient_keys: [], aliases: [], visit_count: 0, search_count: 0, ...extra,
});
const DRUGS: DrugSource[] = [
  drug('augmentin-1gm-14-tabs', 'أوجمنتين 1جم 14 قرص', 'Augmentin 1 g 14 tablets', { ingredient_keys: ['cid:amox'], visit_count: 50 }),
  drug('augmentin-625mg-10-tabs', 'أوجمنتين 625 مجم 10 أقراص', 'Augmentin 625 mg 10 tablets', { ingredient_keys: ['cid:amox'], visit_count: 20 }),
  drug('autrin-30-caps', 'أوترين 30 كبسولة', 'Autrin 30 capsules', { visit_count: 5 }),
  drug('brufen-600mg-30-tab', 'بروفين 600 مجم 30 قرص', 'Brufen 600 mg 30 tablets', { ingredient_keys: ['cid:ibu'], visit_count: 80 }),
  drug('profen-400mg-20-tab', 'بروفين فورت', 'Profen 400 mg 20 tablets', { ingredient_keys: ['cid:ibu'] }),
  drug('panadol-extra-24-tab', 'بنادول إكسترا 24 قرص', 'Panadol Extra 24 tablets', { visit_count: 90 }),
  drug('ibuprofen-generic-400', 'إيبوبروفين 400', 'Ibuprofen 400 mg tablets'),
  drug('otrivin-nasal-10ml', 'أوتريفين نقط للأنف 10 مل', 'Otrivin nasal drops 10 ml', { aliases: ['Otrivine'] }),
];
const engine = new SearchEngine(buildSearchIndex(DRUGS, INGREDIENTS));
const slugs = (q: string) => engine.search(q, WILDCARD_LIMIT).map((s) => s.slug);

describe('wildcard parsing and guards', () => {
  it('only a query with * or ? (or the Arabic star ٭) is a wildcard query', () => {
    expect(isWildcardQuery('Au*in')).toBe(true);
    expect(isWildcardQuery('Br?fen')).toBe(true);
    expect(isWildcardQuery('أو٭ين')).toBe(true);
    expect(isWildcardQuery('*fen')).toBe(true);
    expect(isWildcardQuery('au*')).toBe(true);
    expect(isWildcardQuery('augmentin')).toBe(false);
    expect(isWildcardQuery('')).toBe(false);
  });
  it('a star before a number is the multiplication sign of pack names, and ؟ just ends a question', () => {
    for (const name of ['سيستان قطرة عين 30 وحدة * 0.7 مل', 'بولي فريش 0.2% قطرة للعين 20*0.4مل', 'سويتال ستفيا 2جي*50 كيس', 'stem hair lotion 5 x 5ml', 'ampoules 20 *25ml']) {
      expect(isWildcardQuery(name), name).toBe(false);
    }
    expect(isWildcardQuery('بنادول؟')).toBe(false);
    // the normal engine still finds such names
    const packs = new SearchEngine(buildSearchIndex([drug('systane-30', 'سيستان قطرة عين 30 وحدة * 0.7 مل', 'Systane eye drops 30 x 0.7 ml')], []));
    expect(packs.search('سيستان قطرة عين 30 وحدة * 0.7 مل').map((s) => s.slug)).toEqual(['systane-30']);
  });
  it('needs at least 2 literal characters: only wildcards is rejected with a friendly message', () => {
    expect(wildcardProblem('*')).toBe(WILDCARD_MESSAGES['too-few-literals']);
    expect(wildcardProblem('*?*')).toBe(WILDCARD_MESSAGES['too-few-literals']);
    expect(wildcardProblem('a*')).toBe(WILDCARD_MESSAGES['too-few-literals']);
    expect(wildcardProblem('au*')).toBeNull();
    expect(wildcardProblem('augmentin')).toBeNull(); // not a wildcard query at all
    expect(engine.search('*', WILDCARD_LIMIT)).toEqual([]);
  });
  it('allows at most 3 wildcards (a run of * counts once)', () => {
    expect(wildcardProblem('a*b*c*d')).toBeNull();
    expect(wildcardProblem('a*b*c*d*')).toBe(WILDCARD_MESSAGES['too-many-wildcards']);
    expect(wildcardProblem('a**b')).toBeNull();
    const p = parseWildcard('a***b');
    expect(p.ok && p.pattern.wildcards).toBe(1);
  });
  it('escapes every regex character typed: "a(b*c" matches literally and never throws', () => {
    for (const q of ['a(b*c', 'a[b?c', 'a.b*', '(*)+ab', 'a\\b*c', 'au*in$', '^au*in', 'a{2}*b', 'au|in*']) {
      expect(() => engine.search(q, WILDCARD_LIMIT)).not.toThrow();
      const p = parseWildcard(q);
      if (p.ok) expect(() => p.pattern.regex.test('augmentin')).not.toThrow();
    }
    // "." has no regex meaning: normalisation drops it ("a.u" = "au"), it never means "any character"
    const p = parseWildcard('a.u*in');
    expect(p.ok && p.pattern.regex.test('augmentin')).toBe(true);
    expect(p.ok && p.pattern.regex.test('axugmentin')).toBe(false);
    const paren = parseWildcard('(au)*in');
    expect(paren.ok && paren.pattern.regex.test('augmentin')).toBe(true);
    expect(paren.ok && paren.pattern.regex.source).toBe('^au.*in$');
  });
  it('normalises the literals like the rest of the search (case, hamza, ة/ه, ى/ي)', () => {
    const p = parseWildcard('ÄU*İN');
    expect(p.ok && p.pattern.regex.test('augmentin')).toBe(true);
    const ar = parseWildcard('أو*ين');
    expect(ar.ok && ar.pattern.regex.test('اوجمنتين')).toBe(true);
    const ta = parseWildcard('كبس*ة');
    expect(ta.ok && ta.pattern.regex.test('كبسوله')).toBe(true);
  });
});

describe('wildcard engine', () => {
  it('Au*in → the Augmentin products (and Autrin), nothing else', () => {
    const r = slugs('Au*in');
    expect(r).toContain('augmentin-1gm-14-tabs');
    expect(r).toContain('augmentin-625mg-10-tabs');
    expect(r).toContain('autrin-30-caps');
    expect(r).not.toContain('brufen-600mg-30-tab');
    expect(r).not.toContain('panadol-extra-24-tab');
    expect(engine.search('Au*in')[0].tier).toBe(TIER.wildcard);
  });
  it('أو*ين → أوجمنتين (Arabic, hamza-insensitive); أوترين ranks first as the closer match', () => {
    const r = slugs('أو*ين');
    // أوترين (6 letters, 2 covered), the two أوجمنتين (8, 4 covered; by popularity), then أوتريفين (8, 4 covered, no visits)
    expect(r).toEqual(['autrin-30-caps', 'augmentin-1gm-14-tabs', 'augmentin-625mg-10-tabs', 'otrivin-nasal-10ml']);
    expect(slugs('او*ين')).toEqual(r); // without the hamza: same
  });
  it('Br?fen → Brufen only (? is exactly one character; Profen does not start with br)', () => {
    expect(slugs('Br?fen')).toEqual(['brufen-600mg-30-tab']);
    expect(slugs('Br??fen')).toEqual([]);
  });
  it('ranks the closest match first (fewest wildcard-covered characters), then popularity', () => {
    // "Autrin" (6 letters, 2 covered) before "Augmentin" (9 letters, 5 covered); the two Augmentins by popularity
    expect(slugs('Au*in').slice(0, 3)).toEqual(['autrin-30-caps', 'augmentin-1gm-14-tabs', 'augmentin-625mg-10-tabs']);
  });
  it('anchors to the first word; tries any brand word only when the anchored tier finds fewer than 3', () => {
    // "*fen" matches brufen/profen/ibuprofen first words → 3 results, so the any-word tier is not needed
    expect(slugs('*fen').length).toBe(3);
    // "*trin*" anchored: autrin, otrivin?? no — "otrivin" does not end with trin; any-word tier adds the alias "otrivine"? no either.
    // "ex*ra" matches "extra" (second word of Panadol Extra) only through the any-word tier:
    expect(slugs('ex*ra')).toEqual(['panadol-extra-24-tab']);
    // strength / pack words are never matched: "1*g" (the "1 g" strength) finds nothing
    expect(slugs('10*ml')).toEqual([]);
  });
  it('matches approved alias tokens too', () => {
    expect(slugs('otr*ne')).toEqual(['otrivin-nasal-10ml']);
  });
  it('never returns more than 20', () => {
    const many = Array.from({ length: 40 }, (_, i) => drug(`zed-${i}`, `زد ${i}`, `Zedrin${i} 10 tablets`));
    const big = new SearchEngine(buildSearchIndex([...DRUGS, ...many], INGREDIENTS));
    expect(big.search('ze*', WILDCARD_LIMIT).length).toBe(20);
  });
});

describe('wildcard highlighting', () => {
  it('marks only the typed letters inside the matching word', () => {
    const p = parseWildcard('Au*in');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(wildcardSegments('Augmentin 1 g 14 tablets', p.pattern)).toEqual([
      { text: 'Au', hit: true }, { text: 'gment', hit: false }, { text: 'in', hit: true },
      { text: ' ', hit: false }, { text: '1', hit: false }, { text: ' ', hit: false }, { text: 'g', hit: false }, { text: ' ', hit: false }, { text: '14', hit: false }, { text: ' ', hit: false }, { text: 'tablets', hit: false },
    ]);
    const ar = parseWildcard('أو*ين');
    if (!ar.ok) return;
    expect(wildcardSegments('أوجمنتين 1جم', ar.pattern).slice(0, 3)).toEqual([{ text: 'أو', hit: true }, { text: 'جمنت', hit: false }, { text: 'ين', hit: true }]);
  });
  it('highlightSegments keeps the old whole-word behaviour for normal queries', () => {
    expect(highlightSegments('Augmentin 1 g', 'augm')).toEqual([{ text: 'Augmentin', hit: true }, { text: ' ', hit: false }, { text: '1', hit: false }, { text: ' ', hit: false }, { text: 'g', hit: false }]);
  });
});

describe('SQL pattern builder (server fallback)', () => {
  it('escapes literals, expands Arabic letter classes, keeps wildcards inside a word', () => {
    const p = parseWildcard('a(u*in');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const s = toSqlWildcard(p.pattern);
    expect(s.anchored).toBe('^(au[[:alnum:]]*in)(?:[^[:alnum:]]|$)'); // "(" is not a letter: normalisation dropped it
    expect(s.likePrefix).toBe('au%');
    const ar = parseWildcard('أو?ين');
    if (!ar.ok) return;
    expect(toSqlWildcard(ar.pattern).anchored).toBe('^([اأإآٱ][وؤ][[:alnum:]][يىئ]ن)(?:[^[:alnum:]]|$)');
    const dot = parseWildcard('x.y*z'); // normalisation turns "." into a space, which the pattern drops → "xy*z"
    if (!dot.ok) return;
    expect(toSqlWildcard(dot.pattern).normalizedAnchored).toBe('^xy[^ ]*z$');
    const lead = parseWildcard('*ab?');
    if (!lead.ok) return;
    expect(toSqlWildcard(lead.pattern).likePrefix).toBeNull();
    expect(toSqlWildcard(lead.pattern).anyWord).toBe('(?:^|[^[:alnum:]])([[:alnum:]]*ab[[:alnum:]])(?:[^[:alnum:]]|$)');
  });
});

// ---------------------------------------------------------------- performance over the real index
const DIR = new URL('../data/search-index/', import.meta.url);
const file = existsSync(DIR) ? readdirSync(DIR).find((f) => /^index\.[0-9a-f]+\.json$/.test(f)) : undefined;
(file ? describe : describe.skip)('performance over the full built index', () => {
  it('a wildcard query over all drugs answers in under 50 ms', () => {
    const index = JSON.parse(readFileSync(new URL(file!, DIR), 'utf8')) as SearchIndexFile;
    const full = new SearchEngine(index);
    expect(full.size).toBeGreaterThan(10000);
    const queries = ['Au*in', 'أو*ين', 'Br?fen', '*fen', 'pa?a*ol', 'ex*ra'];
    const times: number[] = [];
    for (let round = 0; round < 3; round++) {
      for (const q of queries) {
        const t = performance.now();
        full.search(q, WILDCARD_LIMIT);
        times.push(performance.now() - t);
      }
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const worst = times[times.length - 1];
    console.log(`wildcard over ${full.size} drugs: median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
    expect(median).toBeLessThan(50);
    expect(worst).toBeLessThan(150); // a cold first run may include JIT warm-up
    expect(full.search('Au*in', WILDCARD_LIMIT).map((s) => s.slug).some((s) => s.startsWith('augmentin'))).toBe(true);
    expect(full.search('Br?fen', WILDCARD_LIMIT).map((s) => s.slug).every((s) => s.startsWith('brufen'))).toBe(true);
  });
});
