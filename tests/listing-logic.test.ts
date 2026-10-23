import { describe, expect, it } from 'vitest';
import {
  BROWSE_LETTERS,
  DEFAULT_FILTERS,
  filterQuery,
  groupByFormAndStrength,
  indexLetter,
  isBrowseLetter,
  letterLabel,
  orderLetters,
  pageCount,
  pageOfGroups,
  parseAtcParam,
  parseFilters,
  parsePage,
  sameQuery,
  strengthLabel,
} from '@/lib/listing/logic';
import { compareNamesEn } from '@/lib/format';
import { atcName, routes, slugify } from '@/lib/site';
import type { HubDrug } from '@/lib/data/types';

const drug = (slug: string, price: number | null, o: Partial<HubDrug> = {}): HubDrug => ({
  slug,
  name_ar: slug,
  name_en: slug,
  strength: '500 mg',
  dosage_form_ar: 'أقراص',
  form_class: 'tablet',
  company: null,
  current_price: price === null ? null : String(price),
  unit_price: null,
  units_per_package: null,
  prescription_status: null,
  ingredient_count: 1,
  ...o,
});

describe('pagination params', () => {
  it('reads ?page=N and rejects junk or out-of-range values', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('3')).toBe(3);
    expect(parsePage('0')).toBeNull();
    expect(parsePage('abc')).toBeNull();
    expect(parsePage('2.5')).toBeNull();
    expect(parsePage('5000', 1000)).toBeNull();
  });

  it('counts pages (at least one)', () => {
    expect(pageCount(0, 48)).toBe(1);
    expect(pageCount(48, 48)).toBe(1);
    expect(pageCount(49, 48)).toBe(2);
  });
});

describe('list filters', () => {
  const forms = new Set(['tablet', 'syrup', 'other']);

  it('treats the default list as unfiltered and drops empty parameters', () => {
    const r = parseFilters({ form: '', rx: '', min: '', max: '', sort: 'name' }, forms);
    expect(r.filters).toEqual(DEFAULT_FILTERS);
    expect(r.filtered).toBe(false);
    expect(r.cleanQuery).toBe('');
    // the request carried empty params -> the page redirects to the clean URL
    expect(sameQuery({ form: '', rx: '', sort: 'name' }, r.cleanQuery)).toBe(false);
    expect(sameQuery({}, r.cleanQuery)).toBe(true);
  });

  it('keeps valid filters, ignores unknown forms and swaps an inverted price range', () => {
    const r = parseFilters({ form: 'syrup', rx: 'otc', min: '100', max: '20', sort: 'price-asc', page: '2' }, forms);
    expect(r.filters).toEqual({ form: 'syrup', rx: 'otc', min: 20, max: 100, sort: 'price-asc' });
    expect(r.filtered).toBe(true);
    expect(new URLSearchParams(r.cleanQuery).get('page')).toBe('2');
    expect(parseFilters({ form: 'banana' }, forms).filters.form).toBeNull();
    expect(parseFilters({ min: '-5' }, forms).filters.min).toBeNull();
  });

  it('page=1 is not part of the clean URL (one canonical URL for page 1)', () => {
    const r = parseFilters({ page: '1' }, forms);
    expect(r.cleanQuery).toBe('');
    expect(sameQuery({ page: '1' }, r.cleanQuery)).toBe(false);
  });

  it('serialises only non-default filters for pagination links', () => {
    expect(filterQuery(DEFAULT_FILTERS).toString()).toBe('');
    expect(filterQuery({ ...DEFAULT_FILTERS, form: 'tablet', sort: 'price-desc' }).toString()).toBe('form=tablet&sort=price-desc');
  });
});

describe('ingredient page groups', () => {
  const rows = [
    drug('panadol-24', 45),
    drug('cetal-20', 20),
    drug('adol-500', 30),
    drug('paracetamol-syrup', 25, { form_class: 'syrup', dosage_form_ar: 'شراب', strength: '120 mg/5 ml' }),
    drug('panadol-extra', 60, { ingredient_count: 2, strength: '500 mg/65 mg' }),
    drug('panadol-1g', 70, { strength: '1 g' }),
    drug('no-price', null),
  ];
  const groups = groupByFormAndStrength(rows);

  it('groups single-ingredient products by form and strength, combinations last', () => {
    expect(groups.map((g) => [g.single, g.form, g.strength])).toEqual([
      [true, 'أقراص', '1 جم'],
      [true, 'أقراص', '500 مجم'],
      [true, 'شراب', '120 مجم/5 مل'],
      [false, 'أقراص', null],
    ]);
  });

  it('sorts rows by price (no price last) and flags the cheapest when 2+ are priced', () => {
    const tabs500 = groups.find((g) => g.strength === '500 مجم')!;
    expect(tabs500.rows.map((r) => r.slug)).toEqual(['cetal-20', 'adol-500', 'panadol-24', 'no-price']);
    expect(tabs500.cheapest).toBe('cetal-20');
    expect(tabs500.minPrice).toBe(20);
    // a single priced product is not "the cheapest" of anything
    expect(groups.find((g) => g.strength === '1 جم')!.cheapest).toBeNull();
  });

  it('pages grouped rows and marks groups continued from the previous page', () => {
    const p1 = pageOfGroups(groups, 1, 3);
    const p2 = pageOfGroups(groups, 2, 3);
    expect(p1.pages).toBe(3);
    expect(p1.slices.map((s) => [s.strength, s.pageRows.length, s.continued])).toEqual([
      ['1 جم', 1, false],
      ['500 مجم', 2, false],
    ]);
    expect(p2.slices[0]).toMatchObject({ strength: '500 مجم', continued: true });
    expect(p2.slices[0].pageRows.map((r) => r.slug)).toEqual(['panadol-24', 'no-price']);
    // the cheapest flag is computed on the whole group, not the page
    expect(p2.slices[0].cheapest).toBe('cetal-20');
  });
});

describe('strength labels', () => {
  it('uses Arabic units and drops a leading ingredient name', () => {
    expect(strengthLabel('500 mg')).toBe('500 مجم');
    expect(strengthLabel('Paracetamol 500 mg')).toBe('500 مجم');
    expect(strengthLabel('Aspirin + paracetamol + caffeine (exact mg strengths not stated)')).toBeNull();
    expect(strengthLabel(null)).toBeNull();
  });
});

describe('hub index grouping (Arabic-aware, companies/ingredients/categories)', () => {
  it('folds hamza forms of alif and alif maqsura, upper-cases Latin', () => {
    expect(indexLetter('أموكسيسيلين')).toBe('ا');
    expect(indexLetter('إيبوبروفين')).toBe('ا');
    expect(indexLetter('آيس')).toBe('ا');
    expect(indexLetter('ىوجا')).toBe('ي');
    expect(indexLetter('eva pharma')).toBe('E');
    expect(indexLetter('3M')).toBe('#');
  });
});

describe('drug A-Z browsing (English)', () => {
  it('has 27 buckets: a–z then 0-9', () => {
    expect(BROWSE_LETTERS).toHaveLength(27);
    expect(BROWSE_LETTERS[0]).toBe('a');
    expect(BROWSE_LETTERS[25]).toBe('z');
    expect(BROWSE_LETTERS[26]).toBe('0-9');
  });

  it('recognises live buckets and labels them for display', () => {
    expect(isBrowseLetter('b')).toBe(true);
    expect(isBrowseLetter('0-9')).toBe(true);
    expect(isBrowseLetter('B')).toBe(false); // the URLs are lower case; upper case 301s to it
    expect(isBrowseLetter('ب')).toBe(false); // old Arabic letter: no live bucket
    expect(letterLabel('b')).toBe('B');
    expect(letterLabel('0-9')).toBe('0-9');
  });

  it('orders all 27 buckets, filling missing counts with 0', () => {
    const ordered = orderLetters([
      { letter: 'b', n: 5 },
      { letter: '0-9', n: 2 },
    ]);
    expect(ordered).toHaveLength(27);
    expect(ordered.map((l) => l.letter)).toEqual(BROWSE_LETTERS);
    expect(ordered.find((l) => l.letter === 'b')!.n).toBe(5);
    expect(ordered.find((l) => l.letter === '0-9')!.n).toBe(2);
    expect(ordered.find((l) => l.letter === 'a')!.n).toBe(0);
  });

  it('builds lower-case Latin letter URLs', () => {
    expect(routes.letter('b')).toBe('/adwiya/b');
    expect(routes.letter('0-9')).toBe('/adwiya/0-9');
  });
});

describe('English name ordering', () => {
  it('is case-insensitive and English (Arabic names are not sorted on)', () => {
    expect(compareNamesEn('brufen', 'Panadol')).toBeLessThan(0);
    expect(compareNamesEn('Panadol', 'panadol')).toBe(0);
    expect(compareNamesEn('Zyrtec', 'Adol')).toBeGreaterThan(0);
    expect(['Zinc', 'adol', 'Brufen'].sort(compareNamesEn)).toEqual(['adol', 'Brufen', 'Zinc']);
  });
});

describe('ATC URLs', () => {
  it('appends the slugified English name, or nothing for unnamed/placeholder classes', () => {
    expect(routes.atc('J01CR02', 'Penicillin with beta-lactamase inhibitor')).toBe('/atc/j01cr02-penicillin-with-beta-lactamase-inhibitor');
    expect(routes.atc('J01', null)).toBe('/atc/j01');
    expect(routes.atc('B05BA03', 'ATC B05BA03')).toBe('/atc/b05ba03');
    expect(atcName('ATC B05BA03')).toBeNull();
    expect(slugify('Antiinfectives for systemic use')).toBe('antiinfectives-for-systemic-use');
  });

  it('parses the code from the URL segment', () => {
    expect(parseAtcParam('j01cr02-penicillin-with-beta-lactamase-inhibitor')).toEqual({ code: 'J01CR02', suffix: 'penicillin-with-beta-lactamase-inhibitor' });
    expect(parseAtcParam('n')).toEqual({ code: 'N', suffix: '' });
    expect(parseAtcParam('a-alimentary-tract-and-metabolism')?.code).toBe('A');
    expect(parseAtcParam('j01c')?.code).toBe('J01C');
    expect(parseAtcParam('123')).toBeNull();
    expect(parseAtcParam('j0')).toBeNull();
  });
});
