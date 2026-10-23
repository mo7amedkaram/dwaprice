// schema.org JSON-LD builders. Render with <JsonLd data={...} />.
import { SITE, absoluteUrl, routes } from '@/lib/site';
import { toNumber } from '@/lib/format';
import type { ListingStatus } from '@/lib/data/types';

type Json = Record<string, unknown>;

// Site-name signals for Google (home page only, see app/(site)/page.tsx): a WebSite whose `name` is
// the site name, `url` is the home page WITH the trailing slash (Google matches it against the
// canonical home URL), the short brand spellings as alternateName, plus the SearchAction; and the
// publishing Organization with the same name and the logo served from the admin branding upload
// (/icon-512.png falls back to the built-in mark). og:site_name and the title use the same string.
export function websiteJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    name: SITE.name,
    alternateName: SITE.alternateNames,
    url: `${SITE.url}/`,
    inLanguage: 'ar-EG',
    publisher: { '@id': `${SITE.url}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE.url}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function organizationJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    alternateName: SITE.alternateNames,
    url: `${SITE.url}/`,
    logo: absoluteUrl('/icon-512.png'),
    description: SITE.description,
    areaServed: { '@type': 'Country', name: 'Egypt' },
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: SITE.contactEmail, availableLanguage: ['ar', 'en'] },
  };
}

export interface Crumb {
  name: string;
  /** Path; omit for the current page. */
  href?: string;
}

export function breadcrumbJsonLd(items: Crumb[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  };
}

export interface DrugJsonLdInput {
  slug: string;
  nameEn: string;
  nameAr: string | null;
  ingredients: string[];
  scientificName: string | null;
  dosageForm: string | null;
  route: string | null;
  manufacturer: string | null;
  prescriptionStatus: string | null;
  price: string | number | null;
  priceUpdated: string | null;
  listingStatus: ListingStatus;
  /** Verified product photo only (web.drug_pages.image_url is null unless image_verified); never a placeholder. */
  imageUrl: string | null;
  /** Package barcode as stored; emitted as gtin13 only when it is a valid 13-digit GTIN. */
  barcode: string | null;
  /** Data-driven facts paragraph (price, ingredient, form, company) — real fields only. */
  description: string | null;
}

const RX_STATUS: Record<string, string> = {
  PRESCRIPTION: 'https://schema.org/PrescriptionOnly',
  OTC: 'https://schema.org/OTC',
};

/**
 * Offer.availability from the official listing status: a priced drug on the price list is in stock
 * at pharmacies (InStock); withdrawn / not yet released / cancelled → OutOfStock; an unofficial
 * import has no known availability → omitted. Only InStock/OutOfStock are used (what Google reads).
 */
export function offerAvailability(status: ListingStatus): string | null {
  if (status === null) return 'https://schema.org/InStock';
  if (status === 'NOT_AVAILABLE' || status === 'NOT_YET_AVAILABLE' || status === 'CANCELLED') return 'https://schema.org/OutOfStock';
  return null;
}

/** True for a 13-digit GTIN whose check digit (GS1 mod-10) is correct. */
export function isValidGtin13(code: string | null | undefined): code is string {
  if (!code || !/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

const DAY = 86_400_000;
const PRICE_VALID_DAYS = 30;

/**
 * Offer.priceValidUntil: 30 days after the price's last update — but never in the past. Most listed
 * prices were last changed months ago while still being the current official price, and pages
 * regenerate daily, so the window is counted from the later of the update and today (a rolling
 * "still valid for 30 days" statement, not an expired one). `now` is injectable for tests.
 */
export function priceValidUntil(priceUpdated: string | null, now = new Date()): string {
  const today = new Date(now.toISOString().slice(0, 10));
  const updated = priceUpdated ? new Date(priceUpdated.slice(0, 10)) : null;
  const from = updated && !Number.isNaN(updated.getTime()) && updated > today ? updated : today;
  return new Date(from.getTime() + PRICE_VALID_DAYS * DAY).toISOString().slice(0, 10);
}

/**
 * schema.org Drug (never Product, though Google files Drug under its Product reports). Name is the
 * page's display name (Arabic), alternateName the English trade name. `image` only for a verified
 * photo, `gtin13` only for a valid barcode. One Offer only when a price exists: price, EGP,
 * availability from the listing status, priceValidUntil, a priceSpecification stating the listed
 * price is the final consumer price (medicines are VAT-exempt in Egypt: nothing is added at sale).
 * Deliberately absent, because this is a price directory and not a store: seller, aggregateRating,
 * review, shippingDetails, hasMerchantReturnPolicy.
 */
export function drugJsonLd(d: DrugJsonLdInput, now = new Date()): Json {
  const price = toNumber(d.price);
  const url = absoluteUrl(routes.drug(d.slug));
  const availability = offerAvailability(d.listingStatus);
  return {
    '@context': 'https://schema.org',
    '@type': 'Drug',
    '@id': `${url}#drug`,
    name: d.nameAr ?? d.nameEn,
    ...(d.nameAr ? { alternateName: d.nameEn } : {}),
    url,
    ...(d.description ? { description: d.description } : {}),
    ...(d.imageUrl ? { image: d.imageUrl } : {}),
    ...(isValidGtin13(d.barcode) ? { gtin13: d.barcode } : {}),
    ...(d.ingredients.length ? { activeIngredient: d.ingredients.join(', ') } : {}),
    ...(d.scientificName ? { nonProprietaryName: d.scientificName } : {}),
    ...(d.dosageForm ? { dosageForm: d.dosageForm } : {}),
    ...(d.route ? { administrationRoute: d.route } : {}),
    ...(d.manufacturer ? { manufacturer: { '@type': 'Organization', name: d.manufacturer } } : {}),
    ...(d.prescriptionStatus && RX_STATUS[d.prescriptionStatus] ? { prescriptionStatus: RX_STATUS[d.prescriptionStatus] } : {}),
    ...(price !== null && price > 0
      ? {
          offers: {
            '@type': 'Offer',
            url,
            price: price.toFixed(2),
            priceCurrency: 'EGP',
            ...(availability ? { availability } : {}),
            priceValidUntil: priceValidUntil(d.priceUpdated, now),
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: price.toFixed(2),
              priceCurrency: 'EGP',
              valueAddedTaxIncluded: true,
            },
          },
        }
      : {}),
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** FAQPage only for real Q&A content; returns null when there is none. */
export function faqJsonLd(items: FaqItem[]): Json | null {
  const real = items.filter((i) => i.question.trim() && i.answer.trim());
  if (real.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: real.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  };
}
