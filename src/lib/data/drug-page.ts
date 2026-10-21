import 'server-only';
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { REVALIDATE_SECONDS, tags } from '@/lib/cache';
import { chooseGroupCanonical, hasUsesPage, type AlternativeInput } from '@/lib/drug/logic';
import type { DosingRule, DrugCard, DrugPage, GroupMemberRow } from './types';

export interface RelatedCard {
  slug: string;
  name_ar: string | null;
  name_en: string;
  strength: string | null;
  dosage_form_ar: string | null;
  current_price: string | null;
}

export interface DrugPageData {
  card: DrugCard;
  page: DrugPage;
  /** Other products of the same recognition_product_index group (other packs), self included. */
  group: GroupMemberRow[];
  /** Page that represents the group (chooseGroupCanonical); null when not grouped. */
  groupCanonicalSlug: string | null;
  /** Whether the group canonical has a uses page (for the canonical of a duplicate's uses page). */
  canonicalHasUsesPage: boolean;
  alternatives: AlternativeInput[];
  sameCompany: RelatedCard[];
  sameCategory: RelatedCard[];
  /** APPROVED rules only (web.dosing_rules_public). */
  dosingRules: DosingRule[];
}

const RELATED_COLUMNS = 'slug, name_ar, name_en, strength, dosage_form_ar, current_price';

/** Normalised ingredient keys for clinical_dosing_rules (lower(trim(name)), as the app's approved_dosing_rules()). */
function dosingKeys(page: DrugPage): string[] {
  const keys = new Set<string>();
  for (const i of page.ingredients ?? []) {
    for (const name of [i.name_en, i.scientific_name]) {
      if (!name) continue;
      keys.add(name.toLowerCase().trim());
      keys.add(name.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim());
    }
  }
  return [...keys].filter(Boolean);
}

async function load(slug: string): Promise<DrugPageData | null> {
  const [card] = await query<DrugCard>('select * from web.drug_cards where slug = $1', [slug]);
  if (!card) return null;

  const [[page], group, alternatives, sameCompany, sameCategory] = await Promise.all([
    query<DrugPage>('select * from web.drug_pages where slug = $1', [slug]),
    query<GroupMemberRow>('select * from web.drug_group_members where slug = $1', [slug]),
    query<AlternativeInput>(
      `select alt_slug, name_ar, name_en, strength, dosage_form_ar, company, units_per_package,
              current_price, unit_price, match_type, alt_listing_status, same_form
       from web.drug_alternatives where slug = $1 limit 300`,
      [slug],
    ),
    card.company_keys.length
      ? query<RelatedCard>(
          `select ${RELATED_COLUMNS} from web.drug_cards
           where company_keys && $1::text[] and slug <> $2 and indexable
           order by sort_name limit 6`,
          [card.company_keys.slice(-1), slug], // the marketing company (last part)
        )
      : Promise.resolve([]),
    card.category_key
      ? query<RelatedCard>(
          `select ${RELATED_COLUMNS} from web.drug_cards
           where category_key = $1 and slug <> $2 and indexable
           order by sort_name limit 6`,
          [card.category_key, slug],
        )
      : Promise.resolve([]),
  ]);
  if (!page) return null;

  const groupCanonicalSlug =
    group.length > 1
      ? chooseGroupCanonical(
          group.map((m) => ({ slug: m.member_slug, indexable: m.indexable, isRpiCanonical: m.is_rpi_canonical, visitCount: Number(m.visit_count) || 0 })),
        )
      : null;

  let canonicalHasUsesPage = hasUsesPage(card.clinical_sections);
  if (groupCanonicalSlug && groupCanonicalSlug !== slug) {
    const [c] = await query<{ clinical_sections: string[] }>('select clinical_sections from web.drug_cards where slug = $1', [groupCanonicalSlug]);
    canonicalHasUsesPage = hasUsesPage(c?.clinical_sections);
  }

  const keys = dosingKeys(page);
  const dosingRules = keys.length
    ? await query<DosingRule>('select * from web.dosing_rules_public where ingredient_key = any($1::text[]) order by ingredient_key, version desc', [keys])
    : [];

  return { card, page, group, groupCanonicalSlug, canonicalHasUsesPage, alternatives, sameCompany, sameCategory, dosingRules };
}

/** Everything a drug template needs, cached for a day (tags: catalog, drug:<slug>). */
export function getDrugPageData(slug: string): Promise<DrugPageData | null> {
  return unstable_cache(() => load(slug), ['drug-page-data-v3', slug], {
    revalidate: REVALIDATE_SECONDS,
    tags: [tags.catalog, tags.drug(slug)],
  })();
}
