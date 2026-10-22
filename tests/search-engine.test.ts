// The in-browser suggestion engine: tiers and their order, typo tolerance, aliases, ingredients,
// mixed Arabic/Latin input, letter variants, popularity tie-break, highlighting.
import { describe, expect, it } from 'vitest';
import { allowedTypos, matchedWords, prefixDistance, SearchEngine, TIER } from '@/lib/search/engine';
import { buildSearchIndex, popularityBucket, type DrugSource, type IngredientSource } from '@/lib/search/index-build';

const INGREDIENTS: IngredientSource[] = [
  { ingredient_key: 'cid:amox', name_en: 'Amoxicillin', name_ar: 'أموكسيسيلين' },
  { ingredient_key: 'cid:clav', name_en: 'Clavulanic acid', name_ar: 'حمض الكلافولانيك' },
  { ingredient_key: 'cid:para', name_en: 'Paracetamol', name_ar: 'باراسيتامول' },
  { ingredient_key: 'cid:caff', name_en: 'Caffeine', name_ar: 'كافيين' },
  { ingredient_key: 'cid:ibu', name_en: 'Ibuprofen', name_ar: 'إيبوبروفين' },
  { ingredient_key: 'cid:azi', name_en: 'Azithromycin', name_ar: 'أزيثروميسين' },
  { ingredient_key: 'cid:pse', name_en: 'Pseudoephedrine', name_ar: 'سودوإيفيدرين' },
];

const drug = (slug: string, ar: string, en: string, extra: Partial<DrugSource> = {}): DrugSource => ({
  slug,
  name_ar: ar,
  name_en: en,
  price_list_name: en,
  dosage_form_ar: 'أقراص',
  ingredient_keys: [],
  aliases: [],
  visit_count: 0,
  search_count: 0,
  ...extra,
});

const DRUGS: DrugSource[] = [
  drug('augmentin-1gm-14-f-c-tabs', 'أوجمنتين 1جم 14 قرص', 'Augmentin 1 g film-coated tablets (14 tablets)', {
    price_list_name: 'Augmentin 1gm 14 f.c. tabs',
    dosage_form_ar: 'أقراص مغلفة',
    ingredient_keys: ['cid:amox', 'cid:clav'],
    aliases: ['Augmentin 1gm 14 tablets'],
    visit_count: 10,
  }),
  drug('augmentin-625mg-10-tabs', 'أوجمنتين 625 مجم 10 أقراص', 'Augmentin 625 mg 10 film-coated tablets', {
    price_list_name: 'Augmentin 625mg 10 f.c.tab.',
    dosage_form_ar: 'أقراص مغلفة',
    ingredient_keys: ['cid:amox', 'cid:clav'],
    visit_count: 2,
  }),
  drug('panadol-20-tabs', 'بانادول', 'Panadol', { ingredient_keys: ['cid:para'], aliases: ['Banadol'] }),
  drug('panadol-extra-24-tabs', 'بانادول اكسترا 24 قرص', 'Panadol Extra 24 f.c. tab', { ingredient_keys: ['cid:para', 'cid:caff'], visit_count: 50, search_count: 3 }),
  drug('panadol-night-20-tabs', 'بانادول نايت 20 قرص', 'Panadol Night 20 f.c. tabs', { ingredient_keys: ['cid:para'], visit_count: 5 }),
  drug('bienadol-30-tab', 'بينادول 30 قرص', 'Bienadol 30 tab.', { ingredient_keys: ['cid:para'] }),
  drug('amoxicillin-500mg-12-caps', 'أموكسيسيللين 500 مجم 12 كبسولة', 'Amoxicillin 500 mg 12 capsules', { dosage_form_ar: 'كبسولات', ingredient_keys: ['cid:amox'] }),
  drug('flumox-500mg-16-caps', 'فلوموكس 500مجم 16 كبسولة', 'Flumox 500 mg 16 capsules', { dosage_form_ar: 'كبسولات', ingredient_keys: ['cid:amox'] }),
  drug('congestal-20-tabs', 'كونجستال 20 قرص', 'Congestal 20 tabs', { ingredient_keys: ['cid:para', 'cid:pse'], visit_count: 1 }),
  drug('brufen-400mg-30-tabs', 'بروفين 400 مجم 30 قرص', 'Brufen 400 mg 30 tablets', { ingredient_keys: ['cid:ibu'] }),
  drug('zithromax-500mg-3-tabs', 'زيثروماكس 500 مجم 3 أقراص', 'Zithromax 500 mg 3 tablets', { ingredient_keys: ['cid:azi'] }),
  drug('amal-syrup-120ml', 'مستشفى الأمل شراب 120 مل', 'Al Amal hospital syrup 120 ml', { dosage_form_ar: 'شراب' }),
];

const engine = new SearchEngine(buildSearchIndex(DRUGS, INGREDIENTS));
const slugs = (q: string) => engine.search(q).map((s) => s.slug);
const tiers = (q: string) => Object.fromEntries(engine.search(q).map((s) => [s.slug, s.tier]));

describe('engine tiers and order', () => {
  it('2 Arabic letters: only names that start with them', () => {
    expect(slugs('بر')).toEqual(['brufen-400mg-30-tabs']);
    expect(tiers('با')).toEqual({ 'panadol-extra-24-tabs': TIER.namePrefix, 'panadol-night-20-tabs': TIER.namePrefix, 'panadol-20-tabs': TIER.namePrefix });
  });

  it('1 character gives nothing', () => {
    expect(engine.search('ب')).toEqual([]);
    expect(engine.search('  ')).toEqual([]);
  });

  it('exact > name prefix, then popularity, then shorter name', () => {
    expect(slugs('panadol')).toEqual(['panadol-20-tabs', 'panadol-extra-24-tabs', 'panadol-night-20-tabs']);
    expect(tiers('panadol')['panadol-20-tabs']).toBe(TIER.exact);
    // same tier: most popular first (extra: 50 visits + 3 searches, night: 5)
    expect(slugs('با').slice(0, 2)).toEqual(['panadol-extra-24-tabs', 'panadol-night-20-tabs']);
  });

  it('word prefix in any order', () => {
    expect(tiers('extra panad')).toEqual({ 'panadol-extra-24-tabs': TIER.wordPrefix });
  });

  it('alias tokens (spelling variants, price-list words) rank after word matches', () => {
    // "banadol" exists only as an approved alias of one product; the others are typo matches
    expect(tiers('banadol')).toEqual({ 'panadol-20-tabs': TIER.alias, 'panadol-extra-24-tabs': TIER.fuzzy, 'panadol-night-20-tabs': TIER.fuzzy }); // bienadol: 2 edits
    expect(slugs('banadol')[0]).toBe('panadol-20-tabs');
    // "f c tab" also starts "film coated tablets" in the displayed names: a word match, one tier better
    expect(tiers('augmentin f.c.tab')).toEqual({ 'augmentin-1gm-14-f-c-tabs': TIER.wordPrefix, 'augmentin-625mg-10-tabs': TIER.wordPrefix });
  });

  it('ingredient matches come after name matches and say which ingredient', () => {
    const r = engine.search('amoxicillin');
    expect(r[0]).toMatchObject({ slug: 'amoxicillin-500mg-12-caps', tier: TIER.namePrefix, ingredient: null });
    const flumox = r.find((s) => s.slug === 'flumox-500mg-16-caps');
    expect(flumox).toMatchObject({ tier: TIER.ingredient, ingredient: 'Amoxicillin' });
    expect(r.map((s) => s.slug)).toContain('augmentin-1gm-14-f-c-tabs');
    expect(engine.search('باراسيتامول').map((s) => s.slug).sort()).toEqual(['bienadol-30-tab', 'congestal-20-tabs', 'panadol-20-tabs', 'panadol-extra-24-tabs', 'panadol-night-20-tabs']);
  });

  it('substring after everything else', () => {
    expect(tiers('gestal')).toEqual({ 'congestal-20-tabs': TIER.substring });
  });

  it('mixed Arabic name + Latin strength', () => {
    expect(tiers('اوجمنتين 1g')).toEqual({ 'augmentin-1gm-14-f-c-tabs': TIER.wordPrefix });
    expect(tiers('اوجمنتين 1 جم')).toEqual({ 'augmentin-1gm-14-f-c-tabs': TIER.wordPrefix });
    expect(tiers('augmentin 625')).toEqual({ 'augmentin-625mg-10-tabs': TIER.namePrefix }); // the English name starts with it
    expect(tiers('625 augmentin')).toEqual({ 'augmentin-625mg-10-tabs': TIER.wordPrefix });
  });

  it('ى/ي and ة/ه and hamza variants are the same letter', () => {
    expect(tiers('مستشفي')).toEqual({ 'amal-syrup-120ml': TIER.namePrefix });
    expect(slugs('كبسوله').sort()).toEqual(['amoxicillin-500mg-12-caps', 'flumox-500mg-16-caps']);
    expect(slugs('اوجمنتين')).toEqual(['augmentin-1gm-14-f-c-tabs', 'augmentin-625mg-10-tabs']);
    expect(slugs('إيبوبروفين')).toEqual(['brufen-400mg-30-tabs']);
  });

  it('English brand names', () => {
    expect(tiers('Zithromax')).toEqual({ 'zithromax-500mg-3-tabs': TIER.namePrefix });
    expect(tiers('ZITHROMAX 500')).toEqual({ 'zithromax-500mg-3-tabs': TIER.namePrefix });
  });

  it('shows the dosage form', () => {
    expect(engine.search('flumox')[0]).toMatchObject({ form: 'كبسولات', ar: 'فلوموكس 500مجم 16 كبسولة', en: 'Flumox 500 mg 16 capsules' });
  });
});

describe('typo tolerance', () => {
  it('one typo from 4 characters, two from 8', () => {
    expect(allowedTypos(3)).toBe(0);
    expect(allowedTypos(4)).toBe(1);
    expect(allowedTypos(7)).toBe(1);
    expect(allowedTypos(8)).toBe(2);
    expect(tiers('اوجمنتن')).toEqual({ 'augmentin-1gm-14-f-c-tabs': TIER.fuzzy, 'augmentin-625mg-10-tabs': TIER.fuzzy }); // missing ي
    expect(tiers('congestl')).toEqual({ 'congestal-20-tabs': TIER.fuzzy });
    expect(tiers('zithromx 500')).toEqual({ 'zithromax-500mg-3-tabs': TIER.fuzzy });
    expect(tiers('augmnetin')).toEqual({ 'augmentin-1gm-14-f-c-tabs': TIER.fuzzy, 'augmentin-625mg-10-tabs': TIER.fuzzy }); // adjacent swap = 1
    expect(tiers('augmetn')).toEqual({ 'augmentin-1gm-14-f-c-tabs': TIER.fuzzy, 'augmentin-625mg-10-tabs': TIER.fuzzy }); // "tn" swapped: 1 edit
    expect(tiers('augmtin')).toEqual({}); // 7 characters: 2 edits are too many
    expect(tiers('agmentn')).toEqual({}); // same
    expect(tiers('augmentnn')).toEqual({ 'augmentin-1gm-14-f-c-tabs': TIER.fuzzy, 'augmentin-625mg-10-tabs': TIER.fuzzy }); // 9 characters: 2 edits
    expect(slugs('cng')).toEqual([]); // 3 characters: no fuzzy
    expect(slugs('xyzqw')).toEqual([]);
  });

  it('fuzzy results come after strict ones and better matches first', () => {
    const r = engine.search('بانادول');
    expect(r.slice(0, 3).map((s) => s.tier)).toEqual([TIER.exact, TIER.namePrefix, TIER.namePrefix]);
    expect(r.at(-1)).toMatchObject({ slug: 'bienadol-30-tab', tier: TIER.fuzzy });
  });

  it('prefix edit distance', () => {
    expect(prefixDistance('augmentn', 'augmentin', 2)).toBe(1);
    expect(prefixDistance('اوجمنتن', 'اوجمنتين', 1)).toBe(1);
    expect(prefixDistance('abcd', 'abdc', 1)).toBe(1);
    expect(prefixDistance('augm', 'augmentin', 1)).toBe(0); // a prefix
    expect(prefixDistance('abc', 'xyz', 1)).toBe(2); // k + 1 = too far
    expect(prefixDistance('abcdef', 'ab', 1)).toBe(2); // the word is far shorter than the query
  });
});

describe('popularity bucket', () => {
  it('never exposes the raw counts', () => {
    expect([0, 1, 3, 8, 20, 50, 100_000].map((v) => popularityBucket(v, 0))).toEqual([0, 1, 2, 3, 4, 5, 5]);
    expect(popularityBucket(0, 1)).toBe(2); // a search weighs 3
    expect(popularityBucket(-5, 0)).toBe(0);
  });
});

describe('highlighting', () => {
  it('marks the words the query matches', () => {
    expect(matchedWords('Panadol Extra 24 f.c. tab', 'panadol ex')).toEqual([true, true, false, false, false]);
    expect(matchedWords('أوجمنتين 1جم 14 قرص', 'اوجمنتين 1g')).toEqual([true, true, true, false]); // "1" also starts "14"
    expect(matchedWords('Augmentin 1 g film-coated tablets', 'اوجمنتين 1 جم')).toEqual([false, true, true, false, false]); // جم = g
    expect(matchedWords('Congestal 20 tabs', 'gestal')).toEqual([true, false, false]); // substring
    expect(matchedWords('Congestal 20 tabs', 'x')).toEqual([false, false, false]);
  });
});
