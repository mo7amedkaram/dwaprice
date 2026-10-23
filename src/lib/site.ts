export const SITE = {
  /**
   * The site name Google shows: WebSite JSON-LD `name` (home page), og:site_name,
   * the title suffix and the logo all use it, so they never disagree.
   */
  name: 'دليل الأدوية المصري',
  /** WebSite JSON-LD alternateName (other names people may use for the site). */
  alternateNames: ['دليل الأدوية', 'dwaprice.com'],
  domain: 'dwaprice.com',
  url: (process.env.SITE_URL || 'https://dwaprice.com').replace(/\/+$/, ''),
  locale: 'ar_EG',
  /** Public contact address (/contact, /about); set CONTACT_EMAIL in production. */
  contactEmail: process.env.CONTACT_EMAIL || 'info@dwaprice.com',
  description:
    'أسعار الأدوية في مصر محدثة، مع البدائل والمادة الفعالة ودواعي الاستعمال والجرعات من مصادر موثقة.',
} as const;

/** Appended to page titles by the layout (title.template), unless the title would get too long. */
export const TITLE_SUFFIX = ` | ${SITE.name}`;

/** Titles longer than this lose the suffix (Google cuts around 60 characters and shows the site name anyway). */
export const TITLE_WITH_SUFFIX_MAX = 60;

/** Absolute URL on the canonical origin. */
export function absoluteUrl(path = '/'): string {
  return `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Latin slug: lowercase words joined by "-" (same idea as web.slugify). */
export function slugify(text: string, max = 60): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/** An ATC class name, or null for placeholders like "ATC B05BA03". */
export function atcName(name: string | null | undefined): string | null {
  const n = name?.trim();
  return n && !/^ATC\s/i.test(n) ? n : null;
}

/** Public URL map (see docs/DATA_PLAN.md §4 and docs/DESIGN.md §9). */
export const routes = {
  home: () => '/',
  drug: (slug: string) => `/dawa/${slug}`,
  alternatives: (slug: string) => `/dawa/${slug}/badael`,
  uses: (slug: string) => `/dawa/${slug}/dawaei-estemal`,
  /** Drugs A-Z by the first letter of the English trade name. */
  letters: () => '/adwiya',
  /** A browse bucket page: "a".."z" or "0-9" (lower-case Latin, URL-safe as is). */
  letter: (letter: string) => `/adwiya/${letter}`,
  ingredients: () => '/active-ingredient',
  ingredient: (slug: string) => `/active-ingredient/${slug}`,
  companies: () => '/sharika',
  company: (slug: string) => `/sharika/${slug}`,
  categories: () => '/category',
  category: (slug: string) => `/category/${slug}`,
  atcIndex: () => '/atc',
  /** "/atc/j01cr02-penicillin-with-beta-lactamase-inhibitor"; the code alone when the class has no name. */
  atc: (code: string, nameEn?: string | null) => {
    const name = atcName(nameEn);
    return `/atc/${code.toLowerCase()}${name ? `-${slugify(name)}` : ''}`;
  },
  lastPrices: () => '/last-prices',
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : '/search'),
  about: () => '/about',
  contact: () => '/contact',
  privacy: () => '/privacy',
  terms: () => '/terms',
  disclaimer: () => '/disclaimer',
  guide: () => '/guide',
} as const;

/**
 * First URL segment -> slug entity type in web.slugs, for the 301s of retired
 * slugs (src/proxy.ts). ATC URLs are keyed by the code, which never changes.
 */
export const ENTITY_PREFIXES = {
  dawa: 'drug',
  'active-ingredient': 'ingredient',
  sharika: 'company',
  category: 'category',
} as const;
export type EntityType = (typeof ENTITY_PREFIXES)[keyof typeof ENTITY_PREFIXES];
