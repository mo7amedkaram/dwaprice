// View model shared by generateMetadata and the page body of the three drug
// templates, so metadata and content can never disagree. Pure (no server-only).

import type { Crumb } from '@/lib/seo/jsonld';
import type { DrugJsonLdInput } from '@/lib/seo/jsonld';
import { atcName, routes } from '@/lib/site';
import type { DrugPageData } from '@/lib/data/drug-page';
import {
  alsoSearchedAs,
  cleanCompanyName,
  displayName,
  drugRobots,
  groupAlternatives,
  groupSubstitutes,
  hasUsesPage,
  historyPoints,
  latestChange,
  nameWithStrength,
  priceYear,
  shortStrength,
  unitLabel,
  unitPrice,
  type DrugNames,
  type DrugSubPage,
} from './logic';

export function drugModel(data: DrugPageData, subPage: DrugSubPage) {
  const { card, page } = data;
  const names: DrugNames = { nameAr: page.name_ar, nameEn: page.name_en, priceListName: page.price_list_name, strength: page.strength };
  const year = priceYear(page.price_updated_date);
  const usesPage = hasUsesPage(card.clinical_sections);
  const siblings = new Set(data.group.map((m) => m.member_slug).filter((s) => s !== page.slug));
  const alternatives = groupAlternatives(data.alternatives, page.current_price, siblings);
  // البدائل: different ingredient, same therapeutic class (web.drug_substitutes); never a sibling or a مثيل.
  const substitutes = groupSubstitutes((data.substitutes ?? []).filter((r) => !siblings.has(r.alt_slug)));
  const robots = drugRobots({
    slug: page.slug,
    indexable: page.indexable,
    noindexReason: page.noindex_reason,
    groupCanonicalSlug: data.groupCanonicalSlug,
    subPage,
    canonicalHasSubPage: subPage === '/dawaei-estemal' ? data.canonicalHasUsesPage : subPage === '/badael' ? true : undefined,
  });
  const ingredients = (page.ingredients ?? []).map((i) => (i.name_en ?? i.scientific_name ?? i.name_ar ?? '').replace(/\s*\([^)]*\)/g, '').trim()).filter(Boolean);
  const company = cleanCompanyName(page.marketer ?? page.manufacturer ?? page.company);

  // Breadcrumb parent: Arabic category, else an ATC class with an Arabic name, else none.
  const atcParent = (page.atc_links ?? []).find((a) => a.slug && a.name_ar && atcName(a.name_en));
  const parent: Crumb | null =
    page.category_slug && page.category_name_ar
      ? { name: page.category_name_ar, href: routes.category(page.category_slug) }
      : atcParent
        ? { name: atcParent.name_ar!, href: routes.atc(atcParent.code, atcParent.name_en) }
        : null;
  const drugCrumbName = nameWithStrength(displayName(names), page.strength);
  const crumbs = (current?: string): Crumb[] => [
    ...(parent ? [parent] : []),
    current ? { name: drugCrumbName, href: routes.drug(page.slug) } : { name: drugCrumbName },
    ...(current ? [{ name: current }] : []),
  ];

  const history = historyPoints(page.price_history ?? [], page.old_price, page.current_price, page.price_updated_date);
  const change = latestChange(page.price_history ?? [], page.old_price, page.current_price, page.price_updated_date);
  const jsonLd: DrugJsonLdInput = {
    slug: page.slug,
    nameEn: page.name_en,
    nameAr: page.name_ar,
    ingredients,
    scientificName: page.scientific_name,
    dosageForm: page.dosage_form_en,
    route: page.route,
    manufacturer: cleanCompanyName(page.manufacturer ?? page.company),
    prescriptionStatus: page.prescription_status,
    price: page.current_price,
    priceUpdated: page.price_updated_date,
    listingStatus: page.listing_status,
  };

  return {
    names,
    year,
    usesPage,
    alternatives,
    substitutes,
    robots,
    ingredients,
    company,
    crumbs,
    history,
    change,
    jsonLd,
    imageAlt: `${displayName(names)}${shortStrength(page.strength) ? ` ${shortStrength(page.strength)}` : ''}`,
    unit: { label: unitLabel(page.form_class), price: unitPrice(page.unit_price, page.current_price, page.units_per_package) },
    alsoSearched: alsoSearchedAs(page.aliases, [page.name_ar, page.name_en, page.price_list_name]),
    otherStrengths: alternatives.different.slice(0, 6).map((r) => ({
      slug: r.slug,
      name_ar: r.nameAr,
      name_en: r.nameEn,
      strength: r.strength,
      dosage_form_ar: r.form,
      current_price: r.price === null ? null : String(r.price),
    })),
  };
}

export type DrugModel = ReturnType<typeof drugModel>;
