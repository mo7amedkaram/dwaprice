-- Section coverage of the drug page, measured on web.drug_pages itself (so it counts
-- what the website will actually receive: statements awaiting review are already
-- filtered out). One hash chunk (:K of :N) at a time; every row is an additive count.
with p as (
  select * from web.drug_pages
  where abs(hashtext(drug_id::text)) % :N = :K
), f as (
  select p.indexable,
         jsonb_array_length(p.uses) > 0                                             as has_uses,
         p.dosage ? 'adult'                                                         as has_dosage_adult,
         p.dosage ? 'pediatric'                                                     as has_dosage_pediatric,
         (p.dosage ? 'renal_impairment' or p.dosage ? 'hepatic_impairment')         as has_dosage_organ,
         p.dosage <> '{}'::jsonb                                                    as has_any_dosage,
         jsonb_array_length(p.side_effects) > 0                                     as has_side_effects,
         jsonb_array_length(p.contraindications) > 0                                as has_contraindications,
         jsonb_array_length(p.warnings) > 0                                         as has_warnings,
         jsonb_array_length(p.interactions) > 0                                     as has_interactions,
         jsonb_array_length(p.monitoring) > 0                                       as has_monitoring,
         (p.pregnancy ? 'risk_summary' or p.pregnancy ? 'breastfeeding')            as has_pregnancy,
         p.storage is not null and p.storage @? '$.* ? (@ != null && @ != "")'       as has_storage,
         p.egyptian_leaflet is not null                                             as has_egyptian_leaflet,
         p.us_label is not null                                                     as has_us_label,
         jsonb_array_length(p.international_leaflets) > 0                           as has_intl_leaflets,
         nullif(btrim(p.description_ar), '') is not null                            as has_description_ar,
         p.description_needs_review                                                 as description_needs_review,
         p.packaging_needs_review                                                   as packaging_needs_review,
         jsonb_array_length(p.ingredients) > 0                                      as has_ingredients,
         p.ingredient_details @? '$[*] ? (@.mechanism_ar != null)'                  as has_mechanism_ar,
         jsonb_array_length(p.price_history) >= 2                                   as has_price_history,
         p.old_price is not null and p.old_price <> p.current_price                 as has_price_change,
         p.image_url is not null                                                    as has_image,
         p.barcode is not null                                                      as has_barcode,
         p.prescription_status is not null                                          as has_rx_status,
         jsonb_array_length(p.aliases) > 0                                          as has_aliases,
         exists (select 1 from web.products x where x.set_key = (select c.set_key from web.drug_cards c where c.drug_id = p.drug_id)
                   and x.is_live and x.product_key <> p.product_key)                as has_alternatives
  from p
), g as (
  select f.*,
         (has_uses and (has_any_dosage::int + has_side_effects::int + has_contraindications::int
                        + has_interactions::int + has_pregnancy::int + has_warnings::int) >= 2) as uses_page_candidate,
         not (has_uses or has_any_dosage or has_side_effects or has_contraindications) and not has_alternatives as thin_page
  from f
)
select 'drug pages' as metric, case when indexable then 'indexable' else 'noindex' end as key, count(*) as n from g group by 2
union all
select 'section coverage (indexable products)', s.section, count(*) filter (where s.present)
from g cross join lateral (values
  ('uses', has_uses), ('dosage: any', has_any_dosage), ('dosage: adult', has_dosage_adult), ('dosage: pediatric', has_dosage_pediatric),
  ('dosage: renal/hepatic', has_dosage_organ), ('side effects', has_side_effects), ('contraindications', has_contraindications),
  ('warnings', has_warnings), ('interactions', has_interactions), ('monitoring', has_monitoring), ('pregnancy/breastfeeding', has_pregnancy),
  ('storage', has_storage), ('Egyptian leaflet (found)', has_egyptian_leaflet), ('US label (DailyMed) found', has_us_label),
  ('international leaflets', has_intl_leaflets), ('Arabic description', has_description_ar),
  ('description mentions research/competitor', description_needs_review), ('packaging mentions research/competitor', packaging_needs_review),
  ('ingredients', has_ingredients), ('mechanism (Arabic)', has_mechanism_ar), ('price history >= 2 points', has_price_history),
  ('old price -> current price', has_price_change), ('verified image', has_image), ('barcode', has_barcode),
  ('prescription status', has_rx_status), ('aliases', has_aliases), ('alternatives', has_alternatives),
  ('uses-page candidate (uses + >=2 clinical sections)', uses_page_candidate), ('thin (no clinical content, no alternatives)', thin_page)
) s(section, present)
where g.indexable
group by 2;
