import type { Metadata } from 'next';
import { SITE, TITLE_SUFFIX, TITLE_WITH_SUFFIX_MAX, absoluteUrl } from '@/lib/site';
import { letterLabel } from '@/lib/listing/logic';

/**
 * Page kinds and their default indexing rule (docs/DESIGN.md "SEO rules"):
 * - search results, filtered lists and pagination beyond page 1 are noindex,follow;
 * - pagination keeps a self-referencing canonical (?page=N), never page 1;
 * - drugs/hubs pass `indexable` from the web views.
 */
export type PageKind =
  | 'home'
  | 'drug'
  | 'alternatives'
  | 'uses'
  | 'ingredient'
  | 'company'
  | 'category'
  | 'atc'
  | 'prices'
  | 'search'
  | 'static'
  | 'internal';

export interface PageMetaInput {
  kind: PageKind;
  /** Path without query, e.g. "/dawa/panadol-500mg-24-tab". */
  path: string;
  title: string;
  description: string;
  /** From the web views (drug_cards.indexable, ingredients.indexable…). Default true. */
  indexable?: boolean;
  /** 1-based page number of a paginated list. */
  page?: number;
  /** A filter/sort is applied (e.g. ?filter=increase). */
  filtered?: boolean;
  /** Absolute image URL for Open Graph (no image is better than a generic one). */
  image?: string;
  /** rel=canonical to another page (duplicates point to their group's page). Default: `path`. */
  canonicalPath?: string;
  /** Use the title as is, without the layout's " | دليل الأدوية المصري" suffix. */
  absoluteTitle?: boolean;
  /** hreflang alternates, e.g. { ar: '/api', en: '/api/en' } (paths). */
  languages?: Record<string, string>;
  /** Site-verification meta tags (home page only), from the editable settings. */
  verification?: Metadata['verification'];
}

const NOINDEX_KINDS: ReadonlySet<PageKind> = new Set(['search', 'internal']);

export function shouldIndex(input: Pick<PageMetaInput, 'kind' | 'indexable' | 'page' | 'filtered'>): boolean {
  if (NOINDEX_KINDS.has(input.kind)) return false;
  if (input.indexable === false) return false;
  if (input.filtered) return false;
  if ((input.page ?? 1) > 1) return false;
  return true;
}

/** Canonical URL: the path itself, plus ?page=N for N > 1 (self-referencing). */
export function canonicalUrl(path: string, page?: number): string {
  return absoluteUrl(page && page > 1 ? `${path}?page=${page}` : path);
}

/** Builds title, description, canonical, robots, Open Graph and Twitter tags. */
export function buildMetadata(input: PageMetaInput): Metadata {
  const index = shouldIndex(input);
  const canonical = input.canonicalPath ? absoluteUrl(input.canonicalPath) : canonicalUrl(input.path, input.page);
  const pageSuffix = input.page && input.page > 1 ? ` — صفحة ${input.page}` : '';
  const title = `${input.title}${pageSuffix}`;
  // Pages 2+ of a list get their own description too (unique per URL).
  const description = input.page && input.page > 1 ? `${input.description} (صفحة ${input.page})` : input.description;
  // The site-name suffix is dropped when it would push the title past ~60 characters.
  const absolute = input.absoluteTitle || title.length + TITLE_SUFFIX.length > TITLE_WITH_SUFFIX_MAX;
  return {
    title: absolute ? { absolute: title } : title,
    description,
    ...(input.verification ? { verification: input.verification } : {}),
    alternates: {
      canonical,
      ...(input.languages ? { languages: Object.fromEntries([...Object.entries(input.languages).map(([l, p]) => [l, absoluteUrl(p)]), ['x-default', absoluteUrl(input.languages.ar ?? input.path)]]) } : {}),
    },
    robots: index
      ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' } }
      : { index: false, follow: true },
    openGraph: {
      type: 'website',
      locale: SITE.locale,
      siteName: SITE.name,
      url: canonical,
      title,
      description,
      ...(input.image ? { images: [{ url: input.image }] } : {}),
    },
    twitter: {
      card: input.image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(input.image ? { images: [input.image] } : {}),
    },
  };
}

// ---------------------------------------------------------------- titles & descriptions per page type
// Drug, alternatives and uses pages: see lib/drug/logic.ts (drugTitle, drugDescription…).
// Hubs and lists below are Arabic-first; the layout appends " | دليل الأدوية المصري" (title.template)
// when the title stays within TITLE_WITH_SUFFIX_MAX.

const n = (count: number) => new Intl.NumberFormat('en-US').format(count);

export const pageText = {
  ingredient: (nameAr: string, nameEn: string | null, count: number) => ({
    title: `أدوية ${nameAr} وأسعارها في مصر`,
    description: `${n(count)} دواء يحتوي على ${nameAr}${nameEn ? ` (${nameEn})` : ''} في مصر، مرتبة حسب الشكل والتركيز مع أرخص سعر في كل مجموعة.`,
  }),
  company: (name: string, count: number) => ({
    title: `أدوية شركة ${name} وأسعارها`,
    description: `أسعار ${n(count)} من أدوية ومنتجات شركة ${name} في مصر، مع المادة الفعالة والشكل الدوائي.`,
  }),
  category: (nameAr: string, count: number) => ({
    title: `${nameAr}: أسعار الأدوية في مصر`,
    description: `${n(count)} دواء من فئة ${nameAr} في مصر، مع الأسعار المحدثة والمادة الفعالة والبدائل.`,
  }),
  atc: (nameAr: string, code: string, count: number) => ({
    title: `${nameAr} (${code}): الأدوية وأسعارها`,
    description: `${n(count)} دواء في مصر مصنف تحت ${nameAr} (رمز ATC ${code})، مع الأسعار والمادة الفعالة.`,
  }),
  letter: (letter: string, count: number) =>
    letter === '0-9'
      ? {
          title: 'أدوية يبدأ اسمها برقم',
          description: `${n(count)} دواء يبدأ اسمه برقم في مصر، مرتبة أبجديًا مع السعر الحالي.`,
        }
      : {
          title: `أدوية تبدأ بحرف ${letterLabel(letter)}`,
          description: `${n(count)} دواء يبدأ اسمه بحرف ${letterLabel(letter)} في مصر، مرتبة أبجديًا مع السعر الحالي.`,
        },
  letters: () => ({
    title: 'دليل الأدوية من A إلى Z',
    description: 'كل الأدوية المتاحة في مصر مرتبة أبجديًا حسب أول حرف في الاسم الإنجليزي، مع الأسعار.',
  }),
  ingredients: (count: number) => ({
    title: 'المواد الفعالة للأدوية في مصر',
    description: `${n(count)} مادة فعالة، ولكل مادة الأدوية التي تحتويها في مصر وأسعارها.`,
  }),
  companies: (count: number) => ({
    title: 'شركات الأدوية في مصر',
    description: `${n(count)} شركة أدوية ومستحضرات في مصر، ولكل شركة منتجاتها وأسعارها.`,
  }),
  categories: (count: number) => ({
    title: 'تصنيفات الأدوية في مصر',
    description: `${n(count)} فئة علاجية للأدوية في مصر: المضادات الحيوية والمسكنات وأدوية الضغط وغيرها، مع الأسعار.`,
  }),
  atcIndex: () => ({
    title: 'تصنيف ATC للأدوية',
    description: 'الأدوية في مصر حسب التصنيف التشريحي العلاجي الكيميائي (ATC) لمنظمة الصحة العالمية، مع الأسعار.',
  }),
  lastPrices: (direction: 'increase' | 'decrease' | null) => ({
    title: direction === 'increase' ? 'أحدث زيادات أسعار الأدوية' : direction === 'decrease' ? 'أحدث تخفيضات أسعار الأدوية' : 'أحدث أسعار الأدوية في مصر',
    description:
      direction === 'increase'
        ? 'الأدوية التي زاد سعرها مؤخرًا في مصر: السعر القديم والجديد ونسبة الزيادة وتاريخها.'
        : direction === 'decrease'
          ? 'الأدوية التي انخفض سعرها مؤخرًا في مصر: السعر القديم والجديد ونسبة الانخفاض وتاريخها.'
          : 'آخر تغييرات أسعار الأدوية في مصر: السعر القديم والجديد ونسبة الزيادة أو الانخفاض وتاريخ التغيير.',
  }),
  search: (q: string) => ({
    title: `نتائج البحث عن ${q}`,
    description: `نتائج البحث عن ${q} في دليل أسعار الأدوية في مصر.`,
  }),
} as const;
