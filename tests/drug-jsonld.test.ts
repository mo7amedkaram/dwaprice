// Drug-page structured data (lib/seo/jsonld.ts): a schema.org Drug, never a Product, with one
// Offer that carries only what a price directory can state — and never the e-commerce fields
// (rating, review, shipping, returns, seller) Search Console asked for.
import { describe, expect, it } from 'vitest';
import { drugJsonLd, isValidGtin13, offerAvailability, priceValidUntil, type DrugJsonLdInput } from '@/lib/seo/jsonld';
import { drugFactsDescription } from '@/lib/drug/logic';

const NOW = new Date('2026-10-23T12:00:00Z');
const base: DrugJsonLdInput = {
  slug: 'brufen-600mg-30-tab',
  nameEn: 'Brufen 600 mg 30 tablets',
  nameAr: 'بروفين 600مجم 30 قرص',
  ingredients: ['Ibuprofen'],
  scientificName: 'Ibuprofen',
  dosageForm: 'Tablets',
  route: 'Oral',
  manufacturer: 'Kahira Pharmaceuticals',
  prescriptionStatus: 'OTC',
  price: '99.00',
  priceUpdated: '2024-07-07',
  listingStatus: null,
  imageUrl: null,
  barcode: '6221076070139',
  description: 'سعر بروفين في مصر 99.00 ج.م.',
};
const FORBIDDEN = ['aggregateRating', 'review', 'reviews', 'shippingDetails', 'hasMerchantReturnPolicy', 'seller', 'itemCondition'];

describe('gtin13', () => {
  it('accepts a 13-digit code with a correct GS1 check digit only', () => {
    expect(isValidGtin13('6221076070139')).toBe(true);
    expect(isValidGtin13('6223004900488')).toBe(true);
    expect(isValidGtin13('4006381333931')).toBe(true);
    expect(isValidGtin13('6221076070138')).toBe(false); // wrong check digit
    expect(isValidGtin13('622107607013')).toBe(false); // 12 digits
    expect(isValidGtin13('62210760701391')).toBe(false); // 14 digits
    expect(isValidGtin13('6221O76070139')).toBe(false); // letter O
    expect(isValidGtin13(null)).toBe(false);
    expect(isValidGtin13('')).toBe(false);
  });
});

describe('priceValidUntil', () => {
  it('is 30 days after the update when that is still ahead, else 30 days from today (never in the past)', () => {
    expect(priceValidUntil('2026-10-20', NOW)).toBe('2026-11-22');
    expect(priceValidUntil('2026-10-30', NOW)).toBe('2026-11-29');
    expect(priceValidUntil('2024-07-07', NOW)).toBe('2026-11-22');
    expect(priceValidUntil(null, NOW)).toBe('2026-11-22');
    expect(priceValidUntil('garbage', NOW)).toBe('2026-11-22');
  });
});

describe('availability', () => {
  it('maps the listing status to InStock / OutOfStock, or nothing', () => {
    expect(offerAvailability(null)).toBe('https://schema.org/InStock');
    expect(offerAvailability('NOT_AVAILABLE')).toBe('https://schema.org/OutOfStock');
    expect(offerAvailability('NOT_YET_AVAILABLE')).toBe('https://schema.org/OutOfStock');
    expect(offerAvailability('CANCELLED')).toBe('https://schema.org/OutOfStock');
    expect(offerAvailability('ILLEGAL_IMPORT')).toBeNull();
  });
});

describe('drugJsonLd', () => {
  it('is a Drug with the Arabic name, the English alternateName and the main entity fields', () => {
    const j = drugJsonLd(base, NOW) as Record<string, unknown>;
    expect(j['@type']).toBe('Drug');
    expect(j.name).toBe(base.nameAr);
    expect(j.alternateName).toBe(base.nameEn);
    expect(j.url).toBe('https://dwaprice.com/dawa/brufen-600mg-30-tab');
    expect(j.activeIngredient).toBe('Ibuprofen');
    expect(j.dosageForm).toBe('Tablets');
    expect(j.administrationRoute).toBe('Oral');
    expect(j.manufacturer).toEqual({ '@type': 'Organization', name: 'Kahira Pharmaceuticals' });
    expect(j.prescriptionStatus).toBe('https://schema.org/OTC');
    expect(j.description).toBe(base.description);
    expect(j.gtin13).toBe('6221076070139');
    expect(JSON.stringify(j)).not.toMatch(/"Product"|Store/);
  });

  it('one Offer: price, EGP, availability, priceValidUntil, VAT-inclusive priceSpecification — and no store fields', () => {
    const j = drugJsonLd(base, NOW) as { offers: Record<string, unknown> };
    expect(j.offers['@type']).toBe('Offer');
    expect(j.offers.price).toBe('99.00');
    expect(j.offers.priceCurrency).toBe('EGP');
    expect(j.offers.availability).toBe('https://schema.org/InStock');
    expect(j.offers.priceValidUntil).toBe('2026-11-22');
    expect(j.offers.priceSpecification).toEqual({ '@type': 'UnitPriceSpecification', price: '99.00', priceCurrency: 'EGP', valueAddedTaxIncluded: true });
    const keys = JSON.stringify(j);
    for (const k of FORBIDDEN) expect(keys, k).not.toContain(`"${k}"`);
  });

  it('omits image and gtin13 unless real, omits availability for an unofficial import, maps Rx', () => {
    const j = drugJsonLd({ ...base, imageUrl: null, barcode: '12345', listingStatus: 'ILLEGAL_IMPORT', prescriptionStatus: 'PRESCRIPTION' }, NOW) as { offers: Record<string, unknown>; prescriptionStatus: string };
    expect('image' in j).toBe(false);
    expect('gtin13' in j).toBe(false);
    expect('availability' in j.offers).toBe(false);
    expect(j.prescriptionStatus).toBe('https://schema.org/PrescriptionOnly');
    const withImage = drugJsonLd({ ...base, imageUrl: 'https://cdn.example/x.webp' }, NOW) as { image: string };
    expect(withImage.image).toBe('https://cdn.example/x.webp');
    const noRx = drugJsonLd({ ...base, prescriptionStatus: 'NOT_APPLICABLE' }, NOW);
    expect('prescriptionStatus' in noRx).toBe(false);
  });

  it('no price → no offers at all; withdrawn → OutOfStock', () => {
    expect('offers' in drugJsonLd({ ...base, price: null }, NOW)).toBe(false);
    expect('offers' in drugJsonLd({ ...base, price: '0' }, NOW)).toBe(false);
    const out = drugJsonLd({ ...base, listingStatus: 'NOT_AVAILABLE' }, NOW) as { offers: { availability: string } };
    expect(out.offers.availability).toBe('https://schema.org/OutOfStock');
  });
});

describe('drugFactsDescription', () => {
  const names = { nameAr: 'بروفين 600مجم 30 قرص', nameEn: 'Brufen 600 mg 30 tablets', strength: '600 mg' };
  it('states only real fields: price + date, ingredient, form + company, Rx status', () => {
    const d = drugFactsDescription({ ...names, price: '99.00', updated: '2024-07-07', ingredients: ['Ibuprofen'], company: 'Kahira', formAr: 'أقراص', prescriptionStatus: 'OTC' });
    expect(d).toMatch(/سعر .* في مصر 99 ج\.م \(آخر تحديث /); // formatAmount drops trailing zeros
    expect(d).toContain('المادة الفعالة: Ibuprofen.');
    expect(d).toContain('أقراص من Kahira.');
    expect(d).toContain('دون وصفة');
    expect(d).not.toContain('المثائل'); // no marketing sentence
  });
  it('returns null when nothing factual is known', () => {
    expect(drugFactsDescription({ ...names, price: null, updated: null, ingredients: [], company: null, formAr: null, prescriptionStatus: null })).toBeNull();
  });
});
