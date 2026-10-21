// Row shapes of the web.* views (docs/DATA_PLAN.md §2). Numeric columns arrive
// from pg as strings; dates as strings (YYYY-MM-DD) or Date objects.

export type ListingStatus = 'ILLEGAL_IMPORT' | 'CANCELLED' | 'NOT_YET_AVAILABLE' | 'NOT_AVAILABLE' | null;

export type NoindexReason =
  | 'ILLEGAL_IMPORT'
  | 'CANCELLED'
  | 'RESEARCH_UNRESOLVED'
  | 'PRICE_UNVERIFIED'
  | 'NO_PRICE'
  | 'NO_ARABIC_NAME'
  | null;

/** web.drug_cards */
export interface DrugCard {
  slug: string;
  product_key: string;
  drug_id: string;
  name_en: string;
  name_ar: string | null;
  price_list_name: string;
  strength: string | null;
  dosage_form_en: string | null;
  dosage_form_ar: string | null;
  form_class: string | null;
  route_class: string | null;
  company: string | null;
  units_per_package: number | null;
  current_price: string | null;
  old_price: string | null;
  unit_price: string | null;
  price_updated_date: string | null;
  price_verified: boolean;
  image_url: string | null;
  prescription_status: string | null;
  research_status: string;
  ingredient_keys: string[];
  company_keys: string[];
  category_key: string | null;
  atc_prefixes: string[];
  set_key: string | null;
  exact_key: string | null;
  indexable: boolean;
  noindex_reason: NoindexReason;
  listing_status: ListingStatus;
  sort_name: string | null;
  /** Clinical sections with at least one usable statement (web.products.clinical_sections). */
  clinical_sections: string[];
}

export interface Statement {
  en?: string;
  ar?: string;
  statement_id?: string;
  evidence_level?: string;
  source_country?: string;
  applicability_note?: string;
  source_ids?: string[];
}

export interface PageIngredient {
  position: number;
  name_en: string | null;
  name_ar: string | null;
  scientific_name: string | null;
  strength: string | null;
  atc_code: string | null;
  ingredient_key: string | null;
  slug: string | null;
}

export interface PricePoint {
  price: number;
  effective_date: string | null;
  source: 'catalog' | 'event';
}

export interface IngredientDetail {
  name_en: string | null;
  name_ar: string | null;
  mechanism_ar: string | null;
  mechanism_en: string | null;
  pharmacological_class_ar: string | null;
  therapeutic_class_ar: string | null;
  atc_code: string | null;
  pubchem_cid: number | null;
  drugbank_id: string | null;
}

export interface CompanyLink {
  name: string;
  slug: string | null;
  role: 'company' | 'manufacturer' | 'marketer' | 'partner';
}

export interface AtcLink {
  code: string;
  slug: string | null;
  name_en: string | null;
  name_ar: string | null;
}

export interface Interaction {
  interacting_substance?: string;
  severity?: string;
  description_ar?: string;
  description_en?: string;
  source_ids?: string[];
}

export interface Source {
  source_id: string;
  source_name?: string;
  source_type?: string;
  url?: string;
  document_title?: string;
  country?: string;
  publication_date?: string;
}

/** web.drug_pages (the columns the website reads). */
export interface DrugPage extends Omit<DrugCard, 'ingredient_keys' | 'company_keys' | 'atc_prefixes' | 'set_key' | 'exact_key' | 'product_key' | 'sort_name' | 'clinical_sections'> {
  product_key: string;
  scientific_name: string | null;
  manufacturer: string | null;
  marketer: string | null;
  route: string | null;
  packaging: string | null;
  price_change_pct: string | null;
  category: string | null;
  category_slug: string | null;
  category_name_ar: string | null;
  atc_codes: string[];
  barcode: string | null;
  updated_at: string | Date;
  ingredients: PageIngredient[];
  aliases: string[];
  description_ar: string | null;
  description_en: string | null;
  description_needs_review: boolean;
  price_verified_at: string | null;
  uses: Array<{ indication_ar?: string; indication_en?: string; population?: string; approval_status?: string; source_ids?: string[] }>;
  /** Payload dosage statements: NOT displayed (dosing comes only from approved rules). */
  dosage: Record<string, Statement[]>;
  contraindications: Statement[];
  warnings: Statement[];
  side_effects: Statement[];
  interactions: Interaction[];
  monitoring: Statement[];
  pregnancy: { risk_summary?: Statement[]; breastfeeding?: Statement[] } & Record<string, unknown>;
  storage: { ar?: string | null; en?: string | null } | null;
  ingredient_details: IngredientDetail[];
  scientific_references: Array<{ ingredient_name?: string; pubchem_cid?: number | null; pubchem_url?: string | null; drugbank_id?: string | null; drugbank_url?: string | null }>;
  price_history: PricePoint[];
  sources: Source[] | null;
  company_links: CompanyLink[];
  atc_links: AtcLink[];
}

/** web.drug_group_members */
export interface GroupMemberRow {
  slug: string;
  group_key: string;
  member_slug: string;
  name_ar: string | null;
  name_en: string;
  price_list_name: string;
  current_price: string | null;
  unit_price: string | null;
  units_per_package: number | null;
  indexable: boolean;
  listing_status: ListingStatus;
  is_rpi_canonical: boolean;
  visit_count: string | number;
}

/** web.dosing_rules_public */
export interface DosingRule {
  id: string;
  ingredient_key: string;
  ingredient_name: string;
  formulations: string[];
  routes: string[];
  indication: string;
  population: string;
  min_age_months: number | null;
  max_age_months: number | null;
  min_weight_kg: string | null;
  max_weight_kg: string | null;
  formula: Record<string, unknown>;
  dose_min_mg: string | null;
  dose_max_mg: string | null;
  max_daily_mg: string | null;
  contraindications: string | null;
  sources: Array<{ title?: string; url?: string; name?: string } | string>;
  guideline_version: string | null;
  reviewer_name: string;
  reviewer_credentials: string | null;
  review_date: string;
  version: number;
}

/** web.search_drugs(): one product per row, best match first. */
export interface SearchHit {
  slug: string;
  name_ar: string | null;
  name_en: string;
  strength: string | null;
  dosage_form_ar: string | null;
  current_price: string | null;
  /** 0 exact … 3 all words; 4 vowel-insensitive; 5 typo (see lib/data/search.ts). */
  match_rank: number;
}

export type HubType = 'ingredient' | 'company' | 'category' | 'atc';

/** web.ingredients / companies / categories / atc_classes, common columns. */
export interface HubRow {
  slug: string;
  /** ingredient_key ("cid:1983"), company_key, category_key or atc_code ("J01CR02"). */
  key: string;
  name_en: string | null;
  name_ar: string | null;
  product_count: string | number;
  indexable_count: string | number;
  min_price: string | null;
  max_price: string | null;
  indexable: boolean;
  last_price_date: string | null;
  /** ATC only. */
  level?: number;
  parent_code?: string | null;
  /** Ingredients only. */
  single_ingredient_count?: string | number;
}

/** A drug row in a listing (subset of web.drug_cards). */
export interface HubDrug {
  slug: string;
  name_ar: string | null;
  name_en: string;
  strength: string | null;
  dosage_form_ar: string | null;
  form_class: string | null;
  company: string | null;
  current_price: string | null;
  unit_price: string | null;
  units_per_package: number | null;
  prescription_status: string | null;
  ingredient_count: number;
}

/** Filters of category/ATC/company lists (query params; any filter = noindex). */
export interface ListFilters {
  form: string | null;
  rx: 'rx' | 'otc' | null;
  min: number | null;
  max: number | null;
  sort: 'name' | 'price-asc' | 'price-desc';
}

/** web.latest_price_changes (+ total for pagination). */
export interface LatestChange {
  slug: string;
  name_ar: string | null;
  name_en: string;
  strength: string | null;
  dosage_form_ar: string | null;
  previous_price: string;
  new_price: string;
  change_abs: string;
  change_pct: string | null;
  effective_date: string;
  is_increase: boolean;
}

export interface SitemapEntry {
  path: string;
  lastmod: string | null;
}
