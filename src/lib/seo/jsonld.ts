// schema.org JSON-LD builders. Render with <JsonLd data={...} />.
import { SITE, absoluteUrl, routes } from '@/lib/site';
import { toNumber } from '@/lib/format';
import type { ListingStatus } from '@/lib/data/types';

type Json = Record<string, unknown>;

export function websiteJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    name: SITE.name,
    alternateName: SITE.alternateNames,
    url: SITE.url,
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
    url: SITE.url,
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
}

const RX_STATUS: Record<string, string> = {
  PRESCRIPTION: 'https://schema.org/PrescriptionOnly',
  OTC: 'https://schema.org/OTC',
};

const AVAILABILITY: Record<string, string> = {
  NOT_AVAILABLE: 'https://schema.org/OutOfStock',
  NOT_YET_AVAILABLE: 'https://schema.org/PreOrder',
  CANCELLED: 'https://schema.org/Discontinued',
};

/** schema.org Drug; `offers` only when a price exists. */
export function drugJsonLd(d: DrugJsonLdInput): Json {
  const price = toNumber(d.price);
  const url = absoluteUrl(routes.drug(d.slug));
  return {
    '@context': 'https://schema.org',
    '@type': 'Drug',
    '@id': `${url}#drug`,
    name: d.nameEn,
    ...(d.nameAr ? { alternateName: d.nameAr } : {}),
    url,
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
            price: price.toFixed(2),
            priceCurrency: 'EGP',
            url,
            ...(d.priceUpdated ? { validFrom: d.priceUpdated } : {}),
            ...(d.listingStatus && AVAILABILITY[d.listingStatus] ? { availability: AVAILABILITY[d.listingStatus] } : {}),
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
