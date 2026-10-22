import { describe, expect, it } from 'vitest';
import {
  alsoSearchedAs,
  arabicUnits,
  historyPoints,
  alternativesH1,
  alternativesTitle,
  chooseGroupCanonical,
  cleanCompanyName,
  drugDescription,
  drugH1,
  drugRobots,
  drugTitle,
  groupAlternatives,
  groupSubstitutes,
  hasEnglishInfo,
  isSubstitute,
  hasUsesPage,
  latestChange,
  nameWithStrength,
  nonCanonicalSlugs,
  priceChanges,
  priceYear,
  shortStrength,
  unitPrice,
  type AlternativeInput,
  type GroupMember,
} from '@/lib/drug/logic';

const member = (slug: string, o: Partial<GroupMember> = {}): GroupMember => ({ slug, indexable: true, isRpiCanonical: false, visitCount: 0, ...o });

describe('indexable / noindex', () => {
  it('indexes a canonical, indexable product with a self canonical', () => {
    expect(drugRobots({ slug: 'a', indexable: true, noindexReason: null, groupCanonicalSlug: null, subPage: '' })).toEqual({
      index: true,
      canonicalPath: '/dawa/a',
      reason: null,
    });
  });

  it('keeps a self canonical but noindexes a non-indexable product, with its reason', () => {
    expect(drugRobots({ slug: 'a', indexable: false, noindexReason: 'PRICE_UNVERIFIED', groupCanonicalSlug: null, subPage: '' })).toEqual({
      index: false,
      canonicalPath: '/dawa/a',
      reason: 'PRICE_UNVERIFIED',
    });
  });

  it('a group canonical page is self-canonical', () => {
    expect(drugRobots({ slug: 'a', indexable: true, noindexReason: null, groupCanonicalSlug: 'a', subPage: '/badael' })).toMatchObject({
      index: true,
      canonicalPath: '/dawa/a/badael',
    });
  });

  it('a non-canonical group member points to the canonical and is noindex, even when indexable', () => {
    expect(drugRobots({ slug: 'b', indexable: true, noindexReason: null, groupCanonicalSlug: 'a', subPage: '' })).toEqual({
      index: false,
      canonicalPath: '/dawa/a',
      reason: 'DUPLICATE_PACK',
    });
    expect(drugRobots({ slug: 'b', indexable: true, noindexReason: null, groupCanonicalSlug: 'a', subPage: '/badael' }).canonicalPath).toBe('/dawa/a/badael');
  });

  it('falls back to the canonical main page when the canonical has no such sub-page', () => {
    expect(
      drugRobots({ slug: 'b', indexable: true, noindexReason: null, groupCanonicalSlug: 'a', subPage: '/dawaei-estemal', canonicalHasSubPage: false }).canonicalPath,
    ).toBe('/dawa/a');
  });

  it('builds a uses page only with indications plus two other clinical sections', () => {
    expect(hasUsesPage(['uses', 'side_effects', 'warnings'])).toBe(true);
    expect(hasUsesPage(['uses', 'side_effects'])).toBe(false);
    expect(hasUsesPage(['side_effects', 'warnings', 'contraindications'])).toBe(false);
    // payload dosage statements and mechanism do not count (dosing only from approved rules)
    expect(hasUsesPage(['uses', 'dosage_statements', 'mechanism', 'storage'])).toBe(false);
    expect(hasUsesPage(null)).toBe(false);
  });
});

describe('canonical selection for duplicates', () => {
  it('prefers the recognition index canonical when it is indexable', () => {
    expect(chooseGroupCanonical([member('a', { visitCount: 50 }), member('b', { isRpiCanonical: true })])).toBe('b');
  });

  it('never canonicalises to a non-indexable page', () => {
    expect(chooseGroupCanonical([member('a', { isRpiCanonical: true, indexable: false }), member('b', { visitCount: 1 }), member('c', { visitCount: 9 })])).toBe('c');
  });

  it('breaks ties by slug, deterministically', () => {
    expect(chooseGroupCanonical([member('z'), member('m'), member('q')])).toBe('m');
  });

  it('returns null when no member is indexable', () => {
    expect(chooseGroupCanonical([member('a', { indexable: false }), member('b', { indexable: false })])).toBeNull();
  });

  it('lists every non-canonical member across groups for the sitemaps', () => {
    const rows = [
      { groupKey: 'g1', ...member('a', { isRpiCanonical: true }) },
      { groupKey: 'g1', ...member('b') },
      { groupKey: 'g2', ...member('c', { indexable: false }) },
      { groupKey: 'g2', ...member('d', { indexable: false }) },
    ];
    expect([...nonCanonicalSlugs(rows)]).toEqual(['b']);
  });
});

describe('Arabic title, H1 and description builders', () => {
  const augmentin = { nameAr: 'اوجمنتين 1جم 14 قرص', nameEn: 'Augmentin 1 g film-coated tablets (14 tablets)', priceListName: 'Augmentin 1gm 14 tablets', strength: '1 g (amoxicillin 875 mg + clavulanic acid 125 mg per tablet)' };

  it('takes the short strength before the parenthesis', () => {
    expect(shortStrength(augmentin.strength)).toBe('1 g');
    expect(shortStrength('Amoxicillin 875 mg + clavulanic acid 125 mg per tablet (1 g)')).toBeNull(); // too long
    expect(shortStrength('SPF')).toBeNull();
  });

  it('does not repeat a strength the Arabic name already contains', () => {
    expect(nameWithStrength('اوجمنتين 1جم 14 قرص', '1 g')).toBe('اوجمنتين 1جم 14 قرص');
    expect(nameWithStrength('بروفين أقراص', '400 mg')).toBe('بروفين أقراص 400 مجم');
  });

  it('writes strength units in Arabic inside Arabic headings', () => {
    expect(arabicUnits('650/4/60 mg')).toBe('650/4/60 مجم');
    expect(arabicUnits('200 mcg')).toBe('200 مكجم');
    expect(arabicUnits('1 g')).toBe('1 جم');
    expect(arabicUnits('5 ml')).toBe('5 مل');
    expect(arabicUnits('0.2%')).toBe('0.2%');
    expect(nameWithStrength('كونجستال 20 قرص', '650/4/60 mg')).toBe('كونجستال 20 قرص 650/4/60 مجم');
  });

  it('builds the H1 with the price-update year', () => {
    expect(drugH1(augmentin, 2026)).toBe('سعر اوجمنتين 1جم 14 قرص 2026');
    expect(priceYear('2026-09-27')).toBe(2026);
    expect(priceYear('2022-12-03')).toBe(2022);
    expect(priceYear(null, new Date('2027-01-05'))).toBe(2027);
  });

  it('keeps the title within ~60 characters by choosing the shorter English name', () => {
    const t = drugTitle(augmentin, 2026);
    expect(t).toBe('سعر اوجمنتين 1جم 14 قرص 2026 | Augmentin 1gm 14 tablets');
    expect(t.length).toBeLessThanOrEqual(60);
  });

  it('drops the English part rather than cutting the Arabic name', () => {
    const long = { nameAr: 'ماجنابيوتيك 1.2جم فيال للحقن الوريدي والعضلي عبوة مستشفيات', nameEn: 'Magnabiotic 1.2 gm i.v. vial', strength: '1.2 g' };
    expect(drugTitle(long, 2026)).toBe(`سعر ${long.nameAr} 2026`);
  });

  it('writes a description from real fields within 155 characters', () => {
    const d = drugDescription({ ...augmentin, price: '210.00', ingredients: ['Amoxicillin', 'Clavulanic acid'], company: 'GlaxoSmithKline', formAr: 'أقراص مغلفة', updated: '2024-12-02' });
    expect(d.startsWith('سعر اوجمنتين 1جم 14 قرص في مصر 210 ج.م')).toBe(true);
    expect(d).toContain('Amoxicillin + Clavulanic acid');
    expect(d).toContain('GlaxoSmithKline');
    expect(d.length).toBeLessThanOrEqual(155);
  });

  it('describes a drug without a price without inventing one', () => {
    const d = drugDescription({ nameAr: 'دواء', nameEn: 'Drug', strength: null, price: null, ingredients: [], company: null, formAr: null, updated: null });
    expect(d).not.toMatch(/ج\.م/);
  });

  it('builds the alternatives H1 and title (بدائل ومثائل)', () => {
    expect(alternativesH1({ nameAr: 'بروفين أقراص', nameEn: 'Brufen', strength: '400 mg' })).toBe('بدائل ومثائل بروفين أقراص 400 مجم');
    expect(alternativesTitle(augmentin, 2026)).toBe('بدائل ومثائل اوجمنتين 1جم 14 قرص وأسعارها 2026');
  });
});

describe('البدائل selection rule (isSubstitute)', () => {
  // ATC: level-4 = 5 chars (C07AB), level-5 = 7 chars (C07AB07). atcLevel() reads them from the
  // prefix arrays web.products stores (lengths 1/3/4/5/7).
  const bisoprolol = { atcPrefixes: ['C', 'C07', 'C07A', 'C07AB', 'C07AB07'], routeClass: 'oral', ingredientCount: 1 };
  const atenolol = { atcPrefixes: ['C', 'C07', 'C07A', 'C07AB', 'C07AB03'], routeClass: 'oral', ingredientCount: 1 };
  const atenololTopical = { ...atenolol, routeClass: 'topical' };
  const anotherBisoprolol = { ...bisoprolol };
  const amlodipine = { atcPrefixes: ['C', 'C08', 'C08C', 'C08CA', 'C08CA01'], routeClass: 'oral', ingredientCount: 1 }; // different level-4
  const combo = { atcPrefixes: ['C', 'C09', 'C09B', 'C09BB', 'C09BB04'], routeClass: 'oral', ingredientCount: 2 };
  const noAtc = { atcPrefixes: [], routeClass: 'oral', ingredientCount: 1 };

  it('accepts same ATC level-4 + different level-5 + same route', () => {
    expect(isSubstitute(bisoprolol, atenolol)).toBe(true);
    expect(isSubstitute(atenolol, bisoprolol)).toBe(true);
  });
  it('rejects a different ATC level-4 (never falls back to the broad category)', () => {
    expect(isSubstitute(bisoprolol, amlodipine)).toBe(false);
    expect(isSubstitute(noAtc, atenolol)).toBe(false); // no ATC on the source => no substitutes
  });
  it('rejects the same ATC level-5 (that is a مثيل, same ingredient)', () => {
    expect(isSubstitute(bisoprolol, anotherBisoprolol)).toBe(false);
  });
  it('rejects a different route of administration', () => {
    expect(isSubstitute(bisoprolol, atenololTopical)).toBe(false);
  });
  it('does not offer a combination as a substitute for a single-ingredient drug, but allows it for a combination', () => {
    const comboSameL4 = { ...combo, atcPrefixes: ['C09BB', 'C09BB07'], ingredientCount: 2 };
    const single = { atcPrefixes: ['C09BB', 'C09BB01'], routeClass: 'oral', ingredientCount: 1 };
    expect(isSubstitute(single, comboSameL4)).toBe(false); // single original -> no combo substitute
    expect(isSubstitute(combo, { ...comboSameL4, atcPrefixes: ['C09BB', 'C09BB09'] })).toBe(true); // combo original -> combo ok
    expect(isSubstitute(combo, single)).toBe(true); // combo original -> single is allowed
  });
  it('English toggle shows only when some English text exists (hasEnglishInfo)', () => {
    expect(hasEnglishInfo({})).toBe(false);
    expect(hasEnglishInfo({ uses: [{ indication_en: '' }], side_effects: [{ en: ' ' }] })).toBe(false);
    expect(hasEnglishInfo({ description_en: 'An antihistamine.' })).toBe(true);
    expect(hasEnglishInfo({ description_en: 'x', description_needs_review: true })).toBe(false); // directory note: not shown
    expect(hasEnglishInfo({ uses: [{ indication_en: 'Allergic rhinitis' }] })).toBe(true);
    expect(hasEnglishInfo({ warnings: [{ en: 'Use with caution.' }] })).toBe(true);
    expect(hasEnglishInfo({ ingredient_details: [{ mechanism_en: 'Blocks H1 receptors' }] })).toBe(true);
    expect(hasEnglishInfo({ pregnancy: { breastfeeding: [{ en: 'Avoid.' }] } })).toBe(true);
  });

  it('groupSubstitutes sorts by price, carries no savings difference', () => {
    const row = (slug: string, price: number | null) => ({
      alt_slug: slug, name_ar: slug, name_en: slug, strength: null, dosage_form_ar: null, form_class: null,
      company: null, units_per_package: null, current_price: price, unit_price: null, alt_listing_status: null,
    });
    const g = groupSubstitutes([row('b', 30), row('a', 10), row('c', null)]);
    expect(g.map((r) => r.slug)).toEqual(['a', 'b', 'c']);
    expect(g.every((r) => r.diffAbs === null && r.diffPct === null && !r.cheapest)).toBe(true);
  });
});

describe('alternatives grouping', () => {
  const alt = (slug: string, price: number | null, same: boolean, o: Partial<AlternativeInput> = {}): AlternativeInput => ({
    alt_slug: slug,
    name_ar: slug,
    name_en: slug,
    strength: null,
    dosage_form_ar: null,
    company: null,
    units_per_package: null,
    current_price: price === null ? null : String(price),
    unit_price: null,
    match_type: same ? 'SAME_INGREDIENTS_SAME_STRENGTH' : 'SAME_INGREDIENTS_DIFFERENT_STRENGTH',
    alt_listing_status: null,
    same_form: true,
    ...o,
  });

  it('splits same and different strength, each sorted by price with missing prices last', () => {
    const g = groupAlternatives([alt('c', 90, true), alt('x', 10, false), alt('a', 36, true), alt('n', null, true), alt('y', 5, false)], 210);
    expect(g.same.map((r) => r.slug)).toEqual(['a', 'c', 'n']);
    expect(g.different.map((r) => r.slug)).toEqual(['y', 'x']);
  });

  it('flags the cheapest available same-strength alternative only', () => {
    const g = groupAlternatives([alt('a', 30, true, { alt_listing_status: 'NOT_AVAILABLE' }), alt('b', 40, true), alt('y', 5, false)], 210);
    expect(g.same.find((r) => r.cheapest)?.slug).toBe('b');
    expect(g.different.some((r) => r.cheapest)).toBe(false);
  });

  it('never flags another pack of the same drug as the cheapest alternative', () => {
    const g = groupAlternatives([alt('fucidin-20g', 75, true), alt('other-brand', 90, true)], 96, new Set(['fucidin-20g']));
    expect(g.same.find((r) => r.slug === 'fucidin-20g')).toMatchObject({ sibling: true, cheapest: false });
    expect(g.same.find((r) => r.cheapest)?.slug).toBe('other-brand');
  });

  it('lists the same dosage form first and prefers it for "cheapest"', () => {
    const g = groupAlternatives([alt('dressing', 20, true, { same_form: false }), alt('ointment-b', 60, true), alt('ointment-a', 50, true)], 96);
    expect(g.same.map((r) => r.slug)).toEqual(['ointment-a', 'ointment-b', 'dressing']);
    expect(g.same.find((r) => r.cheapest)?.slug).toBe('ointment-a');
    // with no same-form alternative, the cheapest of any form is flagged
    expect(groupAlternatives([alt('cream', 30, true, { same_form: false }), alt('gel', 25, true, { same_form: false })], 96).same.find((r) => r.cheapest)?.slug).toBe('gel');
  });

  it('shows the marketing company of "Manufacturer > Marketer"', () => {
    const [row] = groupAlternatives([alt('a', 30, true, { company: 'Spimaco > EIMC' })], 50).same;
    expect(row.company).toBe('EIMC');
  });

  it('computes the difference vs the original in EGP and percent', () => {
    const [row] = groupAlternatives([alt('a', 36, true)], 210).same;
    expect(row.diffAbs).toBe(-174);
    expect(row.diffPct).toBeCloseTo(-82.857, 2);
  });

  it('derives unit price from the pack when no stored unit price exists', () => {
    expect(unitPrice(null, 210, 14)).toBe(15);
    expect(unitPrice('3.60', 36, 10)).toBe(3.6);
    expect(unitPrice(null, 210, null)).toBeNull();
  });
});

describe('price changes and aliases', () => {
  it('orders undated (older) catalogue points first and lists changes newest first', () => {
    const changes = priceChanges([
      { price: 419, effective_date: '2026-07-05', source: 'catalog' },
      { price: 230, effective_date: null, source: 'catalog' },
      { price: 399, effective_date: null, source: 'catalog' },
    ]);
    expect(changes.map((c) => [c.previous, c.current])).toEqual([[399, 419], [230, 399]]);
  });

  it('adds the catalogue old -> current change to an empty or partial history', () => {
    const pts = historyPoints([], '31.00', '50.00', '2024-06-06');
    expect(priceChanges(pts).map((c) => [c.previous, c.current, c.date])).toEqual([[31, 50, '2024-06-06']]);
    // nothing to add when the history already has both prices; no change when old = current
    expect(historyPoints([{ price: 131, effective_date: null, source: 'catalog' }, { price: 210, effective_date: '2024-12-02', source: 'catalog' }], '131', '210', '2024-12-02')).toHaveLength(2);
    expect(priceChanges(historyPoints([], null, '50', '2024-06-06'))).toEqual([]);
  });

  it('uses the catalogue old price when no price_change_event exists', () => {
    expect(latestChange([], '131.00', '210.00', '2024-12-02')).toMatchObject({ previous: 131, current: 210, source: 'catalog' });
    expect(latestChange([], '210.00', '210.00', null)).toBeNull();
  });

  it('prefers a recorded price change event', () => {
    const c = latestChange([{ price: 200, effective_date: '2026-01-01', source: 'event' }, { price: 220, effective_date: '2026-10-01', source: 'event' }], '131', '220', null);
    expect(c).toMatchObject({ previous: 200, current: 220, source: 'event' });
  });

  it('shows at most 6 other spellings, none equal to a shown name', () => {
    const out = alsoSearchedAs(['Augmentin 1gm 14 tablets', 'اوجمنتين 1 جم 14 قرص', 'AUGMENTIN 1 G FILM-COATED TABLETS (14 TABLETS)', 'a', 'Augmentine 1g', 'Augmentin 1gm 14 tablets.'], ['اوجمنتين 1جم 14 قرص', 'Augmentin 1 g film-coated tablets (14 tablets)']);
    expect(out).toEqual(['Augmentin 1gm 14 tablets', 'Augmentine 1g']);
    expect(alsoSearchedAs(Array.from({ length: 20 }, (_, i) => `name ${i}`), []).length).toBe(6);
  });

  it('removes research notes from company names', () => {
    expect(cleanCompanyName('Sedico (as listed by Dawa Prices and dw2.org)')).toBe('Sedico');
    expect(cleanCompanyName('LG Life Sciences Ltd (Korea)')).toBe('LG Life Sciences Ltd (Korea)');
  });
});
