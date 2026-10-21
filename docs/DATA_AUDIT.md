# Data audit — Drug Home catalogue for dwaprice.com (part 1)

Snapshot: **2026-10-21 10:18 UTC**, after import batch **165** finished: **16,500 live drugs**,
database 427 MB. Project `rksvuvxheduesqibykra` (Postgres 17.6, eu-central-1).

How it was measured: read-only SQL through the Supabase Management API. Every query is in
`db/audit/` (numbered as in this document); the payload inventory and the clinical-statement
counts run in hash-partitioned chunks (`db/checks/run_chunked.mjs`, `payload_paths.mjs`),
because one recursive pass over the payload filled the project's 2 GB disk with temp files.
An import (batches 96 → 165) ran during the audit, so every table below was re-run in one
pass after it finished; numbers quoted from earlier exploration are not used.

## 1. Row counts

| entity | n |
| --- | --- |
| drugs (deleted_at is null) | 16500 |
| drugs (all) | 16500 |
| drug_ingredients | 39172 |
| drug_ingredients (live drugs) | 39172 |
| price_change_events | 0 |
| price_change_events PRICE_CHANGED | 0 |
| price_change_events PRICE_VERIFIED | 0 |
| drug_search_aliases (all) | 157397 |
| drug_search_aliases (approved) | 157397 |
| approved_drug_name_aliases (all) | 0 |
| approved_drug_name_aliases (APPROVED) | 0 |
| clinical_dosing_rules (all) | 0 |
| clinical_dosing_rules (APPROVED) | 0 |
| recognition_product_index | 13821 |
| dataset_batches | 165 |
| egypt_drug_catalog | 20924 |

* `price_change_events` is **empty**: the detection trigger fires on `UPDATE` only, and every
  catalogue row so far arrived as an `INSERT`. Price history comes from the drug rows instead (§6).
* `approved_drug_name_aliases` and `clinical_dosing_rules` have **no rows** (the dosing-rule
  view is ready but empty).
* `drug_search_aliases` (157k) holds only importer-generated aliases (trade name, Arabic
  name, sheet name, ingredient names, company, category, barcode); all are `approved`.
* `egypt_drug_catalog` (20,924 rows) is a separate service-role-only list used by
  prescription recognition; it is not part of the public catalogue and is not exposed.

## 2. Field completeness (`drugs`, live rows)

| field | filled | pct |
| --- | --- | --- |
| arabic_name | 15611 | 94.6 |
| atc_codes (non-empty) | 7456 | 45.2 |
| barcode | 6083 | 36.9 |
| category | 16284 | 98.7 |
| company | 16031 | 97.2 |
| current_price | 15843 | 96.0 |
| current_price > 0 | 15840 | 96.0 |
| description | 16106 | 97.6 |
| dosage_form_ar | 14446 | 87.6 |
| dosage_form_en | 16239 | 98.4 |
| has drug_ingredients row | 14937 | 90.5 |
| image_url | 68 | 0.4 |
| image_url AND verified | 51 | 0.3 |
| image_verified = true | 51 | 0.3 |
| ingredient_names (non-empty) | 14937 | 90.5 |
| old_price | 7809 | 47.3 |
| old_price <> current | 6676 | 40.5 |
| original_sheet_name | 16500 | 100.0 |
| prescription_status | 5754 | 34.9 |
| price_updated_date | 13654 | 82.8 |
| route | 16144 | 97.8 |
| scientific_name | 14058 | 85.2 |
| search_count > 0 | 0 | 0.0 |
| source_revision_date | 16500 | 100.0 |
| strength | 9635 | 58.4 |
| tag_names (non-empty) | 15114 | 91.6 |
| trade_name | 16326 | 98.9 |
| unit_price | 9472 | 57.4 |
| units_per_package | 9731 | 59.0 |
| visit_count > 0 | 157 | 1.0 |

Notes: `original_sheet_name` (the line in the Egyptian price list) is the only field filled
for every row. Images are practically absent (51 verified). `visit_count` is test traffic
(157 rows > 0) and `search_count` is 0 everywhere (§9). `strength` is 58% as a column, but
structured ingredient strengths exist in the payload for most medicines (§4).

## 3. Status breakdowns

| dim | val | n |
| --- | --- | --- |
| image_verified | false | 16449 |
| image_verified | true | 51 |
| manual_review_required | false | 15645 |
| manual_review_required | true | 855 |
| prescription_status | ∅ | 10746 |
| prescription_status | NOT_APPLICABLE | 2550 |
| prescription_status | PRESCRIPTION | 2324 |
| prescription_status | OTC | 880 |
| price_verified | true | 15237 |
| price_verified | false | 1263 |
| research_status | VERIFIED | 8327 |
| research_status | PARTIALLY_VERIFIED | 7956 |
| research_status | UNRESOLVED | 217 |
| research_status x has_price | VERIFIED / has_price=true | 8324 |
| research_status x has_price | PARTIALLY_VERIFIED / has_price=true | 7516 |
| research_status x has_price | PARTIALLY_VERIFIED / has_price=false | 440 |
| research_status x has_price | UNRESOLVED / has_price=false | 217 |
| research_status x has_price | VERIFIED / has_price=false | 3 |
| research_status x price_verified | VERIFIED / price_verified=true | 8205 |
| research_status x price_verified | PARTIALLY_VERIFIED / price_verified=true | 7032 |
| research_status x price_verified | PARTIALLY_VERIFIED / price_verified=false | 924 |
| research_status x price_verified | UNRESOLVED / price_verified=false | 217 |
| research_status x price_verified | VERIFIED / price_verified=false | 122 |

`data_quality.requires_pharmacist_review` is `true` for **all 16,500** rows (§5).

## 4. `drugs.payload` — what it contains

The payload is the full v3.1.0 research record (`schema/drug.schema.v3.1.0.json`).
Top-level keys:

| key | sample_type | present | with_value | pct |
| --- | --- | --- | --- | --- |
| product_details | object | 16500 | 16500 | 100.0 |
| search_count | number | 16500 | 16500 | 100.0 |
| visit_count | number | 16500 | 16500 | 100.0 |
| clinical_information | object | 16500 | 16500 | 100.0 |
| egyptian_package_insert | object | 16500 | 16500 | 100.0 |
| localized_content | object | 16500 | 16500 | 100.0 |
| dailymed | object | 16500 | 16500 | 100.0 |
| data_quality | object | 16500 | 16500 | 100.0 |
| pricing_details | object | 16500 | 16500 | 100.0 |
| sources | array | 16500 | 16404 | 99.4 |
| trade_name | string | 16500 | 16326 | 98.9 |
| category | string | 16500 | 16284 | 98.7 |
| description | string | 16500 | 16106 | 97.6 |
| company | string | 16500 | 16031 | 97.2 |
| current_price | number | 16500 | 15843 | 96.0 |
| arabic_name | string | 16500 | 15611 | 94.6 |
| tags | array | 16500 | 15114 | 91.6 |
| ingredients | array | 16500 | 14937 | 90.5 |
| scientific_name | string | 16500 | 14058 | 85.2 |
| price_updated_date | string | 16500 | 13654 | 82.8 |
| units_per_package | number | 16500 | 9731 | 59.0 |
| unit_price | number | 16500 | 9472 | 57.4 |
| old_price | number | 16500 | 7809 | 47.3 |
| barcode | string | 16500 | 6083 | 36.9 |
| scientific_references | array | 16500 | 5606 | 34.0 |
| indications | string | 16500 | 4218 | 25.6 |
| dosage | string | 16500 | 3846 | 23.3 |
| international_package_inserts | array | 16500 | 2448 | 14.8 |
| ingredient_upper_limits | array | 16500 | 995 | 6.0 |
| same_ingredient_drugs | array | 16500 | 908 | 5.5 |
| combinations | array | 16500 | 115 | 0.7 |
| image_url | string | 16500 | 68 | 0.4 |
| created_at | null | 16500 | 0 | 0.0 |
| updated_at | null | 16500 | 0 | 0.0 |
| id | null | 16500 | 0 | 0.0 |

**Sections that matter for pages** (drugs with at least one usable statement; from
`12_content_quality_chunk.sql`):

| page section | payload path | drugs |
| --- | --- | ---: |
| Indications / uses (`indication_ar/en`, `population`, `approval_status`) | `clinical_information.uses[]` | 9,925 |
| Warnings & precautions | `clinical_information.warnings[]` | 9,971 |
| Contraindications | `clinical_information.contraindications[]` | 8,511 |
| Drug interactions (`interacting_substance`, `severity`, `description_ar/en`) | `clinical_information.drug_interactions[]` | 7,312 |
| Side effects | `clinical_information.adverse_reactions[]` | 7,108 |
| Dosage — adults | `clinical_information.dosage.adult[]` | 7,072 |
| Dosage — children | `clinical_information.dosage.pediatric[]` | 4,247 |
| Dosage — administration / frequency / duration / food / missed dose / max daily | `clinical_information.dosage.*` | 751 – 4,093 |
| Dosage — renal / hepatic impairment, elderly | `clinical_information.dosage.renal_impairment[]` … | 2,421 – 3,025 |
| Overdose | `clinical_information.dosage.overdose[]` | 3,746 |
| Monitoring | `clinical_information.monitoring[]` | 3,538 |
| Pregnancy risk summary / breastfeeding | `clinical_information.pregnancy.risk_summary[]` / `.breastfeeding[]` | 8,090 / 6,473 |
| Mechanism (ar / en), pharmacological class (ar / en) | `ingredients[].mechanism_*`, `ingredients[].pharmacological_class_*` | 7,060 / 7,692; 10,092 / 11,087 |
| Structured strength (value + unit / numerator + denominator) | `ingredients[].strength.*` | 10,731 (9,031 / 2,208) |
| Arabic / English description | `localized_content.description_ar` / `_en` | 12,444 / 14,136 |
| Packaging text | `product_details.packaging` | 16,134 |
| International prescription status | `product_details.international_prescription_status[]` | 2,938 |
| US label (DailyMed) match (set id) + short section summaries | `dailymed.*` | 6,655 |
| International leaflets (SmPC/PIL: regulator, URL, revision date) | `international_package_inserts[]` | 2,448 |
| Official Egyptian leaflet (sections / PDF URLs) | `egyptian_package_insert.*` | **41 / 36** (almost always `UNAVAILABLE`) |
| Storage | `egyptian_package_insert.sections.storage` | **44** |
| Price history | `pricing_details.price_history[]` | 12,626 |
| References (Wikipedia ar/en, PubChem, DrugBank id) | `scientific_references[]` | 5,606 |
| Sources (id, name, type, URL, dates, verification) | `sources[]` | 16,404 |
| Tags (therapeutic, pharmacological, product category…; en/ar; ATC code) | `tags[]` | 15,114 |

Every clinical statement is an evidence object: `en`, `ar`, `statement_id`, `source_ids`,
`evidence_level`, `formulation_match_type`, `source_country`, `applicability_note`,
`verification_status`, `requires_manual_review`.

| metric | key | n |
| --- | --- | --- |
| current price source domain | 4eshopping.com | 2 |
| current price source domain | abdinpharmacies.com | 11 |
| current price source domain | agpharmacies.com | 4 |
| current price source domain | alabdellatif-tarshouby.com | 2 |
| current price source domain | alba-egypt.com | 1 |
| current price source domain | alserafy.com | 1 |
| current price source domain | amazon.eg | 1 |
| current price source domain | atlaspharma.org | 1 |
| current price source domain | aymanpharmacy.com | 2 |
| current price source domain | balbaapharmacies.com | 3 |
| current price source domain | bbipharma.com | 1 |
| current price source domain | beautybounty.net | 1 |
| current price source domain | beesline.com | 4 |
| current price source domain | bioegypt.net | 1 |
| current price source domain | biogeneca-pharma.com | 1 |
| current price source domain | bloompharmacy.com | 13 |
| current price source domain | brilliancepharma.com | 2 |
| current price source domain | chefaa.com | 7 |
| current price source domain | corepharm.org | 1 |
| current price source domain | cosmoshoponline.com | 2 |
| current price source domain | dalilaldwaa.com | 5 |
| current price source domain | dawaagate.com | 117 |
| current price source domain | dawaanews.com | 5 |
| current price source domain | demo.vodachem.com | 1 |
| current price source domain | dlildwa.com | 22 |
| current price source domain | doctorak.com | 2 |
| current price source domain | drahmedelezaby.com | 5 |
| current price source domain | drug-zoom.com | 33 |
| current price source domain | dw2.org | 450 |
| current price source domain | dwaprices.com | 14489 |
| current price source domain | e-impactcompany.com | 2 |
| current price source domain | e-macro.com | 10 |
| current price source domain | e-majestic.com | 5 |
| current price source domain | ebrotherpharma.com | 1 |
| current price source domain | eg.sohaticare.com | 1 |
| current price source domain | egyptdwa.com | 373 |
| current price source domain | egyptiandrugstore.com | 14 |
| current price source domain | eldawaelmasry.com | 2 |
| current price source domain | elghareeb-pharma.com | 2 |
| current price source domain | en.egyptdwa.com | 1 |
| current price source domain | eparkville.com | 8 |
| current price source domain | faces.eg | 1 |
| current price source domain | familaeg.com | 1 |
| current price source domain | gardeniapharmacies.com | 33 |
| current price source domain | green-pharmaceutical.com | 1 |
| current price source domain | greendol.com | 12 |
| current price source domain | internovopharma.com | 1 |
| current price source domain | jumia.com.eg | 3 |
| current price source domain | kempetro.com | 1 |
| current price source domain | koncieve.com | 2 |
| current price source domain | loremedpharma.com | 1 |
| current price source domain | lotusonline.com | 7 |
| current price source domain | marnys.com.eg | 2 |
| current price source domain | masrdoctors.com | 2 |
| current price source domain | meditopic-eg.com | 3 |
| current price source domain | naturalpyramidspharma.com | 1 |
| current price source domain | nowfoodsegypt.com | 2 |
| current price source domain | orchidiashop.com | 4 |
| current price source domain | originalpharmagroup.net | 1 |
| current price source domain | osayapharma.com | 4 |
| current price source domain | perimetro.shop | 1 |
| current price source domain | pharmacia1.com | 1 |
| current price source domain | pharmapedia.pw | 3 |
| current price source domain | prt-office.com | 1 |
| current price source domain | ps.rxtent.com | 1 |
| current price source domain | questocomm.com | 1 |
| current price source domain | re3ayapharmacy.com | 2 |
| current price source domain | rosheta.com | 78 |
| current price source domain | rovymedx.net | 2 |
| current price source domain | russkaya-apteka.com | 2 |
| current price source domain | safelife.website | 1 |
| current price source domain | salmtak.com | 1 |
| current price source domain | see-lit.com | 1 |
| current price source domain | seif-online.com | 7 |
| current price source domain | sekemonline.com | 1 |
| current price source domain | shakshakpharmacy.myeasyorders.com | 1 |
| current price source domain | store.adventpharma.com.eg | 1 |
| current price source domain | syd24.com | 1 |
| current price source domain | taypharmacies.com | 3 |
| current price source domain | teldapharma.com | 2 |
| current price source domain | u-richi.com | 2 |
| current price source domain | vitaplus-eg.com | 2 |
| current price source domain | yosrypharmacy.com | 1 |
| current price source domain | ziaxpharma.com | 1 |
| drugs | cite dwaprices.com in sources | 14967 |
| drugs | current price source is dwaprices.com | 14489 |
| drugs | data_quality.requires_pharmacist_review=true | 16500 |
| drugs with >=1 section statement | adverse_reactions | 7108 |
| drugs with >=1 section statement | contraindications | 8511 |
| drugs with >=1 section statement | dosage.administration | 4093 |
| drugs with >=1 section statement | dosage.adult | 7072 |
| drugs with >=1 section statement | dosage.duration | 1114 |
| drugs with >=1 section statement | dosage.food_instructions | 1711 |
| drugs with >=1 section statement | dosage.frequency | 1633 |
| drugs with >=1 section statement | dosage.geriatric | 2421 |
| drugs with >=1 section statement | dosage.hepatic_impairment | 2470 |
| drugs with >=1 section statement | dosage.maximum_daily_dose | 2286 |
| drugs with >=1 section statement | dosage.missed_dose | 751 |
| drugs with >=1 section statement | dosage.official_egyptian_label | 50 |
| drugs with >=1 section statement | dosage.overdose | 3746 |
| drugs with >=1 section statement | dosage.pediatric | 4247 |
| drugs with >=1 section statement | dosage.renal_impairment | 3025 |
| drugs with >=1 section statement | drug_interactions | 7312 |
| drugs with >=1 section statement | monitoring | 3538 |
| drugs with >=1 section statement | uses | 9925 |
| drugs with >=1 section statement | warnings | 9971 |
| statements | requires_manual_review=true | 2036 |
| statements | total | 127624 |
| statements by evidence_level | EGYPTIAN_LABEL | 1153 |
| statements by evidence_level | EQUIVALENT_FORMULATION_INTL | 33765 |
| statements by evidence_level | EXACT_PRODUCT_INTL | 8216 |
| statements by evidence_level | INGREDIENT_LEVEL | 16591 |
| statements by evidence_level | MANUFACTURER_CLAIM | 3779 |
| statements by evidence_level | SAME_FORMULATION_INTL | 63080 |
| statements by evidence_level | ∅ | 1040 |
| statements by verification_status | PARTIALLY_VERIFIED | 7658 |
| statements by verification_status | UNVERIFIED | 56 |
| statements by verification_status | VERIFIED | 119073 |
| statements by verification_status | ∅ | 837 |

So the clinical content is broad and bilingual, but it is mostly **international label
content applied to the Egyptian product** (`SAME_FORMULATION_INTL` 63k, `EQUIVALENT_FORMULATION_INTL`
34k, `INGREDIENT_LEVEL` 17k statements), not the Egyptian leaflet, and every record is flagged
for pharmacist review. **Storage and the official Egyptian leaflet are essentially missing.**

The **complete key list** (625 paths, depth ≤ 4, arrays shown as `key[]`) with the number of
drugs holding a value and two sample values is in the appendix at the end of this file.

## 5. Provenance and text that must not be published as is

| field | n |
| --- | --- |
| product_details.packaging | 1024 |
| description | 1725 |
| localized_content.description_ar | 139 |
| localized_content.description_en | 1612 |
| dosage_form_en | 7 |
| strength | 47 |
| clinical_information (any text) | 1705 |
| data_quality.limitations | 13148 |

* **14,489 of 16,500 drugs (88%) take their current price from dwaprices.com** (the market leader we
  are competing with); 14,967 cite it somewhere in `sources`. Other price sources: dw2.org 450,
  egyptdwa.com 373, dawaagate.com 117, rosheta.com 78, pharmacies and shops below 35 each.
* Research notes leak into display text: descriptions such as *"Dawa Prices lists … at the same price"*
  or *"listed on the Egyptian directory"* (English 1,612, Arabic 139), packaging such as
  *"30 capsules (3 strips per Dawa Prices)"* (1,024).
* `data_quality.limitations` (13,148 rows), `candidate_values`, `conflicting_information` and
  `missing_fields` are internal research notes. None of them is exposed by the web views.
* **Price-list markers** inside `original_sheet_name`: `(n/a)` 138, `(n/a yet)` 47,
  `(cancelled)` 37 and **`(illegal import)` 91** (counted at batch 149; same order of magnitude now).

## 6. Prices and price changes

| pce_price_changed_rows | pce_drugs | drugs_with_history | drugs_with_2plus_entries | drugs_with_real_change_in_history | max_entries | history_min_date | history_max_date | drugs_old_ne_current | increases | decreases | min_price_date | max_price_date | future_price_dates |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 12626 | 4013 | 3853 | 4 | 2021-09-16 | 2026-10-14 | 6676 | 6640 | 36 | 2021-04-10 | 2026-10-14 | 0 |

By year of `price_updated_date` (`09b_price_years_and_sample.sql`):

| year | drugs | with old → current change |
| --- | ---: | ---: |
| no date | 2,846 | 29 |
| 2021 | 11 | 0 |
| 2022 | 5,708 | 19 |
| 2023 | 1,139 | 350 |
| 2024 | 2,957 | 2,771 |
| 2025 | 1,852 | 1,807 |
| 2026 | 1,987 | 1,700 |

* `price_change_events`: 0 rows, 0 drugs with a `PRICE_CHANGED` event (trigger fires on UPDATE only).
* Usable instead: the row's `old_price → current_price` at `price_updated_date` — **6,676 drugs
  (6,640 increases, 36 decreases)**, dated 2021-04-10 … 2026-10-14 — and the payload's
  `pricing_details.price_history` (12,626 drugs, 3,853 with a real change, up to 4 points,
  2021-09-16 … 2026-10-14). Usually the newest point is dated and older points are undated.
* 5,708 prices are dated 2022 with no change since; 2,846 have no date at all.

Sample history (`09c_price_history_sample.sql`):

| product | old | current | updated | payload price_history |
| --- | ---: | ---: | --- | --- |
| Aptamil Junior 3 Advance Premium+ 400 g | 399 | 419 | 2026-07-05 | 230 (S2, undated) → 399 (S1, undated) → 419 (S1, 2026-07-05) |
| Aptamil Nutriprem PDF 400 g | 431 | 452 | 2026-07-05 | 255 (S2, undated) → 431 (S1, undated) → 452 (S1, 2026-07-05) |

## 7. Duplicates

**`recognition_product_index`** groups rows by
`product_key = md5(norm(trade_name or sheet name) | norm(strength) | norm(dosage_form_en))`,
keeps every member in `drug_ids` and picks `canonical_drug_id` = first by `record_key`.

| groups | groups_gt1 | drugs_in_gt1_groups | non_canonical_rows | max_group_size | presentation_keys | live_drugs_not_indexed | oldest_refresh | newest_refresh |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 13821 | 1460 | 3139 | 1679 | 9 | 13075 | 1000 | 2026-10-21 10:08:55.418319+00 | 2026-10-21 10:08:55.418319+00 |

Group sizes go up to 9. The largest groups show the problem for a price site: they merge
**different pack sizes with different prices** into one "product":

| display_name | strength_text | form_text | n | prices | companies | statuses | sheet_names |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Omnipaque | 300 mg iodine/mL (iohexol 647 mg/mL) | Solution for injection (vial) | 9 | [143.5,244,null] | ["Amersham Health - Ireland (GE HealthCare) / New Technology"] | ["PARTIALLY_VERIFIED","VERIFIED"] | ["Omnipaque 300mg i/ml (100ml) intravascular/intrathecal vial","Omnipaque 300mg i/ml (10ml) intravascular/intrathecal vial","Omnipaque 300mg i/ml (20ml) intravascular/intrathecal vial","Omnipaque 300mg i/ml (50ml) intravascular/intrathecal vial"] |
| Omnipaque | 350 mg iodine/mL (iohexol 755 mg/mL) | Solution for injection (vial) | 7 | [212,331.6,371] | ["Amersham Health - Ireland (GE HealthCare) / New Technology"] | ["VERIFIED"] | ["Omnipaque 350mg i/ml (100ml) intravascular/intrathecal vial","Omnipaque 350mg i/ml (200ml) intravascular/intrathecal vial","Omnipaque 350mg i/ml (50ml) intravascular/intrathecal vial"] |
| Pantogar 90 caps | ∅ | Capsule | 7 | [364.5] | ["Marcyrl co. > merz"] | ["PARTIALLY_VERIFIED"] | ["Pantogar 90 caps"] |
| Osteocare Liquid | ∅ | Oral liquid (syrup) | 5 | [65] | ["Vitabiotics"] | ["PARTIALLY_VERIFIED"] | ["Osteocare liquid 120 ml"] |
| Oxybral SR 30 mg 20 capsules | 30 mg | Sustained-release capsules | 5 | [null] | [null] | ["PARTIALLY_VERIFIED"] | ["Oxybral 30mg 20 s.r. caps. (cancelled)"] |
| Panadol Advance 500 mg tablets | 500 mg | Film-coated tablet | 5 | [46,92] | ["Alexandria > GlaxoSmithKline"] | ["VERIFIED"] | ["Panadol advance 500 mg 24 f.c.tabs.","Panadol advance 500 mg 48 tablets"] |
| Pectokal suspension | ∅ | Oral suspension | 5 | [2.65] | ["Alexandria Company for Pharmaceuticals"] | ["PARTIALLY_VERIFIED"] | ["Pectokal  100 ml suspension","Pectokal 100ml susp.","Pectokal suspension 100 ml"] |
| Pentasa 500 mg 100 slow release tablets | 500 mg | Slow-release (prolonged-release) tablets | 5 | [1100] | ["Ferring Pharmaceuticals > Multipharma"] | ["VERIFIED"] | ["Pentasa 500mg 100 slow release tab"] |
| Potassium chloride 0.2% & dextrose 5% | 0.2% / 5% | Solution for intravenous infusion | 5 | [3,4.5,7.5,11.25] | ["El Nasr","Otsuka Ateco Pharma"] | ["PARTIALLY_VERIFIED","VERIFIED"] | ["Potassium chloride 0.2% & dextrose 5% (el nasr) i.v. inf. 500 ml","Potassium chloride 0.2% & dextrose 5% (el nasr) i.v. inf. 500 ml (rubber cap)","Potassium chloride 0.2% & dextrose 5% (otsuka ateco) i.v. inf. 500 ml","Potassium chloride 0.2% & dextrose 5% (otsuka ateco) i.v. inf. 500 ml (rubber cap)","Potassium chloride 0.2% & dextrose 5% (rub. cap) i.v.infusion"] |
| Rejuve MD | ∅ | ∅ | 5 | [466,495,775,829,1350] | ["Ego Pharmaceuticals Pty Ltd (agent: Vamer Pharma)"] | ["PARTIALLY_VERIFIED","VERIFIED"] | ["Rejuve md complete eye treatment 15 ml","Rejuve md face serum 50 ml","Rejuve md hand daily renewal spf 30+","Rejuve md hand transformative due","Rejuve md sunscreen tinted cream 30 ml"] |
| Risek 40 mg capsules | 40 mg | Hard gelatin capsule (delayed-release granules) | 5 | [30,85] | ["Julphar (Gulf Pharmaceutical Industries)"] | ["VERIFIED"] | ["Risek 40 mg 14 caps.","Risek 40 mg 7 caps."] |
| Atrovent 500mcg/2ml 20 unit dose vial | Ipratropium bromide 500 micrograms/2 ml (250 micrograms/ml) nebuliser solution | Nebuliser solution (single-dose vials) | 4 | [311] | ["Boehringer Ingelheim"] | ["VERIFIED"] | ["Atrovent 500 mcg/2ml 20 unit dose vial","Atrovent 500mcg/2ml 20 unit dose vial"] |

(Euvax-B, seen earlier in the audit: 4 vial sizes at 7.5 / 15 / 37 / 74 EGP in one group.)
The index also lags the catalogue: 1,000 live drugs from the last batches were not in it at the
snapshot (it is refreshed by the importer per batch and by cron at 02:40).

**Exact duplicates of a price-list line** (same `original_sheet_name` after normalisation):

| drugs | distinct_sheet_lines | sheet_dupe_groups | sheet_dupe_extra_rows | sheet_dupe_groups_with_conflicting_price | distinct_trade_names | trade_name_groups_gt1 |
| --- | --- | --- | --- | --- | --- | --- |
| 16500 | 14730 | 1571 | 1770 | 4 | 14387 | 1738 |

1,571 lines appear more than once (1,770 extra rows); only 4 of those groups disagree on the
price (e.g. *Mirablad XR 50 mg 10 f.c. tabs*: 97 EGP dated 2022 vs 190 EGP dated 2026). These
are the real duplicates; the web layer folds them into one product (DATA_PLAN §4).

## 8. Names, ingredients, categories, companies, ATC

| k | v |
| --- | --- |
| category (distinct) | 5296 |
| category with >=5 drugs | 600 |
| company (distinct raw) | 4548 |
| company containing " > " | 5163 |
| company first part (distinct) | 2912 |
| company last part (distinct) | 3366 |
| ingredient name_norm (distinct) | 4737 |
| ingredient with >=2 drugs | 2783 |
| ingredient pubchem_cid (distinct) | 1073 |
| ingredient name_norm per pubchem_cid >1 | 200 |
| atc code (distinct, level5) | 1215 |
| atc level3 (distinct) | 207 |
| atc level4 (distinct) | 502 |
| atc malformed | 48 |
| tag THERAPEUTIC name_en (distinct) | 1984 |
| tag PHARMACOLOGICAL name_en (distinct) | 1755 |
| tag types | ATC,CATEGORY,CHEMICAL,CLINICAL,COSMETIC,INDICATION,OTHER,PHARMACOLOGICAL,PHARMACOLOGICAL_CLASS,PRODUCT_CATEGORY,PRODUCT_TYPE,REGULATORY,REGULATORY_CATEGORY,SUPPLEMENT,THERAPEUTIC,USE |
| dosage_form_en (distinct) | 1715 |
| route (distinct) | 461 |

* **Ingredients**: 4,737 raw names for far fewer substances (`paracetamol` / `paracetamol
  (acetaminophen)`; eight spellings of vitamin D3 under one PubChem CID). 200 CIDs carry
  more than one name. The web layer keys ingredients by PubChem CID when known (DATA_PLAN §4).
* **Categories** are free English text (5,296 distinct, e.g. *"Antibiotic — third-generation
  cephalosporin (ceftriaxone)"*). The head before ` - `, `—`, `(`, `/` gives 934 heads, 295 with
  ≥ 5 drugs; an Arabic label can be taken from the tags for 211 of those:

| heads | heads_ge5 | heads_with_ar | heads_ge5_with_ar | drugs_covered_by_ar_label | drugs_total |
| --- | --- | --- | --- | --- | --- |
| 934 | 295 | 355 | 211 | 14185 | 16284 |

* **Companies** are written `manufacturer > marketing company` (5,163 rows), English only.
* **ATC** codes on 45% of drugs; names exist only where a tag carries the full code. 48 malformed codes.

## 9. Engagement counters — top 50 by `visit_count`

`search_count` is **0 for every drug**, so a "top by search_count" list is empty. `visit_count`
totals a few hundred visits on 157 drugs (development traffic), so neither counter is a demand
signal yet; keyword data (Search Console / Semrush) should drive priorities instead.

| rank | trade_name | arabic_name | current_price | visit_count | search_count |
| --- | --- | --- | --- | --- | --- |
| 1 | Acetalgan 1 gm/100 ml solution for IV infusion vial | اسيتالجان 1جم/100مل محلول وريدي فيال | 22.50 | 29 | 0 |
| 2 | Alerid 10 mg 30 Film-Coated Tablets | اليريد 10مجم 30 قرص | 93.00 | 27 | 0 |
| 3 | Advanopain 200 mcg sublingual tablets | ادفانوبين 200 مكجم 4 اقراص تحت اللسان | 69.00 | 15 | 0 |
| 4 | Alexolyte (ORS) Oral Solution 360 ml | اليكسولايت محلول جفاف | 65.00 | 8 | 0 |
| 5 | Congestal 20 tabs | كونجستال 20 قرص | 50.00 | 7 | 0 |
| 6 | Adrien Gagnon Digest 365 daily use 30 caps | دايجست 365 مستخدم يومي 30 كبسولة | 690.00 | 6 | 0 |
| 7 | Adwiflam 25 mg film-coated tablets | ادويفلام 25 مجم 20 قرص | 24.00 | 6 | 0 |
| 8 | Agera Acne Facial Cleanser 150 ml | اجيرا غسول للحبوب 150 مل | 259.00 | 6 | 0 |
| 9 | Alejon Oily Skin Acne Cream 50 gm | اليجون اكني كريم 50 جم | 140.00 | 6 | 0 |
| 10 | Alvital syrup 120 ml | الفيتال شراب 120مل | 14.75 | 6 | 0 |
| 11 | Coughsed paracetamol children 12 supp. | كافسيد باراسيتامول 12 قمع للاطفال | 58.00 | 6 | 0 |
| 12 | Alejon Hand and Nail Cream 75 gm | اليجون هاند اند نيل كريم 75 جم | 180.00 | 5 | 0 |
| 13 | Alphafen 100 mg/5 ml oral suspension 120 ml | الفافين 100مجم/5مل معلق 120 مل | 7.50 | 5 | 0 |
| 14 | Brufen 200 mg 30 tablets | بروفين 200مجم 30 قرص | 48.00 | 5 | 0 |
| 15 | Augmentin 1 g film-coated tablets (14 tablets) | اوجمنتين 1جم 14 قرص | 210.00 | 4 | 0 |
| 16 | Cymbatex 60 mg 30 caps. | سيمباتكس 60 مجم 30 كبسولة | 295.50 | 4 | 0 |
| 17 | Alejon acne cream 50 gm | اليجون اكني كريم 50 جم | 140.00 | 3 | 0 |
| 18 | Alejon collagen serum 50 ml | اليجون كولاجين سيروم 50 مل | 380.00 | 3 | 0 |
| 19 | Alejon Oily Cleanser 200 ml | اليجون اويلي كلينسر 200 مل | 270.00 | 3 | 0 |
| 20 | Andoxezine 150 mg 30 film-coated tablets | اندوكسيزين 150 مجم 30 قرص | 43.50 | 3 | 0 |
| 21 | Antinal 200 mg 24 capsules | انتينال 200مجم 24 كبسولة | 52.00 | 3 | 0 |
| 22 | Atcorelivo 10 oral powder in sachets | اتكوريليفو 10 اكياس | 45.00 | 3 | 0 |
| 23 | Cataflam 15mg/ml oral drops 15 ml | كتافلام 15 مجم/مل نقط بالفم 15 مل | 10.00 | 3 | 0 |
| 24 | Cipralex 10mg 28 f.c. tab | سيبرالكس 10مجم 28 قرص | 392.00 | 3 | 0 |
| 25 | ABC Omega 3-6-9 syrup 60 ml | ايه بي سي اوميجا 3-6-9 شراب 60 مل | 88.00 | 2 | 0 |
| 26 | Acenewrax 200 mg 10 sachets | اسينيوراكس 200مجم 10 اكياس | 45.00 | 2 | 0 |
| 27 | Adam 90 veg. caps. (NOW) | ادم 90 كبسولة | 2430.00 | 2 | 0 |
| 28 | Adwistadine 5 mg film-coated tablets | ادويستادين 5مجم 30 قرص | 178.50 | 2 | 0 |
| 29 | Aman plus 200ml intimate feminine wash | امان بلس غسول نسائي | 55.00 | 2 | 0 |
| 30 | Ambroxol 30 mg 20 tablets | امبروكسول 30مجم 20 قرص | 5.50 | 2 | 0 |
| 31 | Amikacin EIPICO 500 mg/2 mL IM/IV vial | اميكاسين ايبيكو 500مجم/2مل حقن فيال عضل/وريد | 34.00 | 2 | 0 |
| 32 | Amoxicillin 500 mg 12 capsules (October Pharma) | اموكسيسيللين 500 مجم 12 كبسولة | 8.10 | 2 | 0 |
| 33 | Amrizole-N 5 vaginal suppositories | امريزول-ان لبوس مهبلي 5 اقماع مهبلية | 30.00 | 2 | 0 |
| 34 | Amypapine 30 chewable tablets | اميبابين 30 قرص | 100.00 | 2 | 0 |
| 35 | Andagra 100 mg 12 film-coated tablets | انداجرا 100مجم 4 قرص | 63.00 | 2 | 0 |
| 36 | Anti-Cox II 15 mg 10 suppositories | انتي كوكس لبوس 15مجم 10 اقماع شرجية | 25.50 | 2 | 0 |
| 37 | Arthrohold 400 mg 30 capsules | ارثروهولد 400مجم 30 كبسولة | 450.00 | 2 | 0 |
| 38 | Artificial saliva oral spray 30 ml | ارتيفيشيال سالايفا لعاب فم صناعي بخاخ للفم 30 مل | 8.00 | 2 | 0 |
| 39 | Aspirin 500 mg 20 tablets | اسبرين 500 مجم 20 قرص | 21.00 | 2 | 0 |
| 40 | Aspram 1.5 M.I.U. 8 film-coated tablets | اسبرام 1.5 مليون وحدة دولية 8 اقراص | 5.50 | 2 | 0 |
| 41 | Atrakta Re-Force Hair Shampoo 250 ml | اتراكتا ريفورس شامبو للشعر 250 مل | 330.00 | 2 | 0 |
| 42 | Aug-Derma Brucare cream 30 gm | ايه يو جي-ديرما بروكير كريم 30 جرام | 190.00 | 2 | 0 |
| 43 | Avodart 0.5 mg 30 soft gelatin capsules | افودارت 0.5مجم 30 كبسولة | 313.00 | 2 | 0 |
| 44 | Azathioprine-evapharma 25 mg 30 f.c.tabs. | ازاثيوبرين -ايفافارما 25 مجم 30 قرص | 60.00 | 2 | 0 |
| 45 | Brufen 600 mg 30 tablets | بروفين 600مجم 30 قرص | 99.00 | 2 | 0 |
| 46 | Capixy hair tonic spray 250 ml | كابكسي تونك سبراي 250 مل | 420.00 | 2 | 0 |
| 47 | Catafast 50 mg 9 sachet | كتافاست 50 مجم 9 أكياس | 72.00 | 2 | 0 |
| 48 | Cataflam 75mg 5 supp. | كتافلام 75 مجم 5 أقماع | 13.25 | 2 | 0 |
| 49 | Cidophage retard 850mg 60 s.r. tabs | سيدوفاج ريتارد 850 مجم 60 قرص ممتد المفعول | 48.00 | 2 | 0 |
| 50 | Co- avazir eye susp. drops 10 ml | كو- افازير قطرة عين معلق 10 مل | 39.00 | 2 | 0 |

## Normalization functions and search indexes

**`public.normalize_search_text(text)`** (0001, IMMUTABLE): unifies alef forms (أ إ آ ٱ → ا),
ة → ه, ى → ي, ؤ → و, ئ → ي, Persian ک/ی, strips tashkeel/tatweel/superscript alef, converts
Arabic-Indic and extended digits to ASCII, `unaccent` + `lower` for Latin, collapses whitespace.
Backs the generated columns `drugs.trade_name_norm`, `arabic_name_norm`, `search_text` and
`drug_ingredients.name_norm`.

**`public.medicine_search_normalize(text)`** (0025, IMMUTABLE): `normalize_search_text`, then
splits digit↔Latin-letter boundaries (`125ml` → `125 ml`), replaces every other character
with a space and collapses spaces. Backs `drug_search_aliases.normalized_alias`, which
`search_drugs()` queries (token prefix via `to_tsquery`, ranked exact > prefix > ingredient).

Findings:

* **Encoding defect in 0025.** The migration file was saved double-encoded; the live
  function's character class is `[^[:alnum:]Ø¡-ÙŠ]` instead of `[^[:alnum:]ء-ي]`. Arabic still
  survives (it is matched by `[:alnum:]`), but the class also keeps the Latin-1 range
  `¡`–`Ù` instead of turning it into spaces. Low impact; fix in the app repo when convenient.
* **Arabic digit↔letter boundaries are not split**: `125مل` stays one token, so a search
  for `مل` or `125 مل` does not match it by token. The website uses the same function
  (`web.search_normalize`) so query and index agree; improving it is an app-side change.
* `egypt_skeleton`, `recognition_norm`, `recognition_stem` etc. are prescription-recognition
  normalisers, not used for catalogue search.

Indexes on the search columns (before part 1):

| table | index | definition |
| --- | --- | --- |
| drugs | drugs_search_text_trgm_idx | GIN (search_text gin_trgm_ops) |
| drugs | drugs_trade_name_norm_idx | btree (trade_name_norm text_pattern_ops) |
| drugs | drugs_arabic_name_norm_idx | btree (arabic_name_norm text_pattern_ops) |
| drugs | drugs_barcode_idx | btree (barcode) WHERE barcode IS NOT NULL |
| drugs | drugs_category_idx, drugs_visit_count_idx, drugs_updated_at_idx, drugs_record_key_key, drugs_pkey | btree |
| drug_ingredients | drug_ingredients_name_norm_idx | btree (name_norm) |
| drug_ingredients | drug_ingredients_trgm_idx | GIN (name_norm gin_trgm_ops) |
| drug_search_aliases | medicine_alias_prefix | btree (normalized_alias text_pattern_ops, drug_id) WHERE review_status = 'approved' |
| drug_search_aliases | medicine_alias_tokens | GIN (to_tsvector('simple', normalized_alias)) WHERE review_status = 'approved' |
| drug_search_aliases | medicine_alias_product | btree (drug_id) |
| recognition_product_index | name / stem / arabic stem trigram GINs, `ingredient_norms` GIN, `drug_ids` GIN | |
| approved_drug_name_aliases | approved_drug_name_aliases_trgm | GIN (alias_norm gin_trgm_ops) |

## Platform and security observations

* Postgres 17.6, region eu-central-1, **2 GB disk**, compute with 224 MB `shared_buffers` /
  60 connections. A single recursive query over the payload spilled enough temp files to
  fill the disk (`No space left on device`); every heavy audit query here therefore runs in
  hash-partitioned chunks. While the importer ran, cached scans were ~100× slower than
  normal: the importer calls `refresh_recognition_product_index()` after every batch.
* Supabase default grants give `anon`/`authenticated` all privileges (`arwdDxtm`) on most
  public tables (`drugs`, `prescriptions`, `user_profiles`, `price_watchlist`…); only RLS
  policies stand between the anon key and writes. That is the platform default, not a bug, but
  it means RLS must never be disabled on those tables.
* `PUBLIC` has `USAGE` on schemas `public` and `net` and `EXECUTE` on ~40 public functions;
  pg_net's queue and response tables are `ALL` to `PUBLIC` (granted by `supabase_admin`, so
  `postgres` cannot revoke). See DATA_PLAN §3 for what that means for the website role.
* Migration history: `0001`–`0028` and the new `0030`–`0034` are recorded in
  `supabase_migrations.schema_migrations`; **`0029_prescription_ai_profiles.sql` is in the
  repository but not in the recorded history** (unapplied, or applied by hand).
* Credentials exposed in this working session (not in any file): the personal access token
  pasted into the chat, and the project's legacy JWT secret, which the Management API's
  PostgREST-config endpoint returned in full when I queried it. Revoke the token after part 1;
  rotating the JWT secret invalidates the legacy anon/service keys, so plan it with the app.

---

## Appendix — every `drugs.payload` key path

Depth ≤ 4; `[]` marks array elements; *drugs with a value* counts drugs where the path is not
null / empty string / empty array / empty object. Generated by `db/checks/payload_paths.mjs`.

| path | type | drugs with a value | samples |
| --- | --- | ---: | --- |
| `arabic_name` | string | 15611 | "اوتوكالم  نقط اذن 10 مل" · "ري ايرو 30 قرص" |
| `barcode` | string | 6083 | "6223000010426" · "6229810520315" |
| `category` | string | 16284 | "Otic analgesic and antiseptic" · "Food supplement (iron/multivitamin)" |
| `clinical_information` | object | 16500 |  |
| `clinical_information.adverse_reactions` | array | 7108 |  |
| `clinical_information.adverse_reactions[].applicability_note` | string | 7039 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.adverse_reactions[].ar` | string | 6459 | "أكثر الآثار الجانبية شيوعاً (بمعدل يزيد 5% فأكثر عن الدواء الوهمي): أ… · "الأكثر شيوعًا (5% على الأقل وضعف الدواء الوهمي) في دراسات الأطفال: ال… |
| `clinical_information.adverse_reactions[].en` | string | 7108 | "Most common adverse reactions (incidence 5% or more higher than place… · "Most common (at least 5% and twice placebo) in pediatric studies: nau… |
| `clinical_information.adverse_reactions[].evidence_level` | string | 7062 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.adverse_reactions[].formulation_match_type` | string | 7064 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.adverse_reactions[].requires_manual_review` | boolean | 7108 | false |
| `clinical_information.adverse_reactions[].source_country` | string | 7092 | "US" · "EG" |
| `clinical_information.adverse_reactions[].source_ids` | array | 7108 |  |
| `clinical_information.adverse_reactions[].statement_id` | string | 7108 | "CS-022" · "CS-023" |
| `clinical_information.adverse_reactions[].verification_status` | string | 7064 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.contraindications` | array | 8511 |  |
| `clinical_information.contraindications[].applicability_note` | string | 8453 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.contraindications[].ar` | string | 7674 | "تاريخ من فرط الحساسية لإنترفيرون بيتا الطبيعي أو المؤتلف أو لأي مكون … · "فرط الحساسية للأتوموكسيتين أو المكونات الأخرى؛ الاستخدام مع مثبطات أك… |
| `clinical_information.contraindications[].en` | string | 8511 | "History of hypersensitivity to natural or recombinant interferon beta… · "Hypersensitivity to atomoxetine or other constituents; use with or wi… |
| `clinical_information.contraindications[].evidence_level` | string | 8475 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.contraindications[].formulation_match_type` | string | 8485 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.contraindications[].requires_manual_review` | boolean | 8511 | false |
| `clinical_information.contraindications[].source_country` | string | 8493 | "US" · "INTL" |
| `clinical_information.contraindications[].source_ids` | array | 8511 |  |
| `clinical_information.contraindications[].statement_id` | string | 8511 | "CS-010" · "CS-017" |
| `clinical_information.contraindications[].verification_status` | string | 8486 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.dosage` | object | 16500 |  |
| `clinical_information.dosage.administration` | array | 4093 |  |
| `clinical_information.dosage.administration[].applicability_note` | string | 4056 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.dosage.administration[].ar` | string | 3734 | "للحقن العضلي فقط؛ ويجب إعطاء الحقنة الأولى تحت إشراف أخصائي رعاية صحي… · "تبلع الكبسولات كاملة ولا تفتح. يجب التحري عن تاريخ شخصي أو عائلي للاض… |
| `clinical_information.dosage.administration[].en` | string | 4093 | "For intramuscular use only; the first injection should be given under… · "Take capsules whole; do not open the capsules. Screen for personal or… |
| `clinical_information.dosage.administration[].evidence_level` | string | 4067 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.dosage.administration[].formulation_match_type` | string | 4072 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.dosage.administration[].requires_manual_review` | boolean | 4093 | false · true |
| `clinical_information.dosage.administration[].source_country` | string | 4067 | "US" · "ES" |
| `clinical_information.dosage.administration[].source_ids` | array | 4093 |  |
| `clinical_information.dosage.administration[].statement_id` | string | 4093 | "CS-006" · "CS-007" |
| `clinical_information.dosage.administration[].verification_status` | string | 4074 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.dosage.adult` | array | 7072 |  |
| `clinical_information.dosage.adult[].applicability_note` | string | 7022 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.dosage.adult[].ar` | string | 6343 | "30 ميكروجرام بالحقن العضلي مرة أسبوعياً. ولتقليل الأعراض الشبيهة بالإ… · "البالغون (والأطفال بوزن 70 كجم فأكثر): البدء بـ 40 مجم يوميًا، وبعد 3… |
| `clinical_information.dosage.adult[].en` | string | 7072 | "30 micrograms injected intramuscularly once a week. To reduce flu-lik… · "Adults (and pediatric patients 70 kg or more): start 40 mg/day; after… |
| `clinical_information.dosage.adult[].evidence_level` | string | 7024 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.dosage.adult[].formulation_match_type` | string | 7046 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.dosage.adult[].requires_manual_review` | boolean | 7072 | false · true |
| `clinical_information.dosage.adult[].source_country` | string | 7032 | "US" · "EG" |
| `clinical_information.dosage.adult[].source_ids` | array | 7072 |  |
| `clinical_information.dosage.adult[].statement_id` | string | 7072 | "CS-001" · "CS-002" |
| `clinical_information.dosage.adult[].verification_status` | string | 7049 | "VERIFIED" |
| `clinical_information.dosage.duration` | array | 1114 |  |
| `clinical_information.dosage.duration[].applicability_note` | string | 1093 | "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… · "EU HMPC monograph covers defined ivy leaf extracts (stated DER and ex… |
| `clinical_information.dosage.duration[].ar` | string | 1019 | "يعاد تقييم فائدة العلاج طويل الأمد دوريًا عند الاستخدام لفترات ممتدة؛… · "إذا استمرت الأعراض أكثر من أسبوع أثناء الاستخدام يجب استشارة الطبيب أ… |
| `clinical_information.dosage.duration[].en` | string | 1114 | "Periodically re-evaluate the long-term usefulness when used for exten… · "If symptoms persist longer than one week during use, a doctor or phar… |
| `clinical_information.dosage.duration[].evidence_level` | string | 1095 | "EQUIVALENT_FORMULATION_INTL" · "INGREDIENT_LEVEL" |
| `clinical_information.dosage.duration[].formulation_match_type` | string | 1097 | "EQUIVALENT_FORMULATION" · "INGREDIENT_LEVEL" |
| `clinical_information.dosage.duration[].requires_manual_review` | boolean | 1114 | false · true |
| `clinical_information.dosage.duration[].source_country` | string | 1103 | "US" · "EU" |
| `clinical_information.dosage.duration[].source_ids` | array | 1114 |  |
| `clinical_information.dosage.duration[].statement_id` | string | 1114 | "CS-006" · "CS-001" |
| `clinical_information.dosage.duration[].verification_status` | string | 1099 | "VERIFIED" · "PARTIALLY_VERIFIED" |
| `clinical_information.dosage.food_instructions` | array | 1711 |  |
| `clinical_information.dosage.food_instructions[].applicability_note` | string | 1693 | "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… · "US KEPPRA label covers levetiracetam oral solution 100 mg/mL: same in… |
| `clinical_information.dosage.food_instructions[].ar` | string | 1501 | "يمكن تناوله مع الطعام أو بدونه." · "يؤخذ مع الطعام؛ فقد يقلل الطعام من الغثيان." |
| `clinical_information.dosage.food_instructions[].en` | string | 1711 | "May be taken with or without food." · "Can be taken with or without food." |
| `clinical_information.dosage.food_instructions[].evidence_level` | string | 1696 | "EQUIVALENT_FORMULATION_INTL" · "SAME_FORMULATION_INTL" |
| `clinical_information.dosage.food_instructions[].formulation_match_type` | string | 1700 | "EQUIVALENT_FORMULATION" · "SAME_FORMULATION" |
| `clinical_information.dosage.food_instructions[].requires_manual_review` | boolean | 1711 | false |
| `clinical_information.dosage.food_instructions[].source_country` | string | 1697 | "US" · "GB" |
| `clinical_information.dosage.food_instructions[].source_ids` | array | 1711 |  |
| `clinical_information.dosage.food_instructions[].statement_id` | string | 1711 | "CS-008" · "CS-007" |
| `clinical_information.dosage.food_instructions[].verification_status` | string | 1700 | "VERIFIED" |
| `clinical_information.dosage.frequency` | array | 1633 |  |
| `clinical_information.dosage.frequency[].applicability_note` | string | 1608 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.dosage.frequency[].ar` | string | 1444 | "مرة أسبوعياً." · "مرة واحدة يوميًا صباحًا، أو على جرعتين متساويتين صباحًا وبعد الظهر/أو… |
| `clinical_information.dosage.frequency[].en` | string | 1633 | "Once a week." · "Once daily in the morning, or as evenly divided doses twice daily in … |
| `clinical_information.dosage.frequency[].evidence_level` | string | 1614 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.dosage.frequency[].formulation_match_type` | string | 1614 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.dosage.frequency[].requires_manual_review` | boolean | 1633 | false · true |
| `clinical_information.dosage.frequency[].source_country` | string | 1617 | "US" · "CA" |
| `clinical_information.dosage.frequency[].source_ids` | array | 1633 |  |
| `clinical_information.dosage.frequency[].statement_id` | string | 1633 | "CS-005" · "CS-002" |
| `clinical_information.dosage.frequency[].verification_status` | string | 1614 | "VERIFIED" · "PARTIALLY_VERIFIED" |
| `clinical_information.dosage.geriatric` | array | 2421 |  |
| `clinical_information.dosage.geriatric[].applicability_note` | string | 2398 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.dosage.geriatric[].ar` | string | 2172 | "لم تشمل الدراسات السريرية عدداً كافياً من المرضى بعمر 65 عاماً فأكثر … · "لم يتم تقييم السلامة والفعالية والحرائك الدوائية لدى المرضى بعمر 65 س… |
| `clinical_information.dosage.geriatric[].en` | string | 2421 | "Clinical studies did not include sufficient numbers of patients aged … · "Safety, efficacy and pharmacokinetics have not been evaluated in pati… |
| `clinical_information.dosage.geriatric[].evidence_level` | string | 2407 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.dosage.geriatric[].formulation_match_type` | string | 2407 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.dosage.geriatric[].requires_manual_review` | boolean | 2421 | false · true |
| `clinical_information.dosage.geriatric[].source_country` | string | 2402 | "US" · "ES" |
| `clinical_information.dosage.geriatric[].source_ids` | array | 2421 |  |
| `clinical_information.dosage.geriatric[].statement_id` | string | 2421 | "CS-003" · "CS-005" |
| `clinical_information.dosage.geriatric[].verification_status` | string | 2407 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.dosage.hepatic_impairment` | array | 2470 |  |
| `clinical_information.dosage.hepatic_impairment[].applicability_note` | string | 2447 | "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… · "Irish SmPC (2006) for Trental 300 mg/15 ml concentrate for infusion (… |
| `clinical_information.dosage.hepatic_impairment[].ar` | string | 2185 | "القصور الكبدي المتوسط (تشايلد-بيو B): الجرعة الأولية والمستهدفة 50% م… · "موانع الاستعمال في القصور الكبدي الشديد؛ الحذر عند ضعف وظائف الكبد." |
| `clinical_information.dosage.hepatic_impairment[].en` | string | 2470 | "Moderate hepatic impairment (Child-Pugh B): initial and target dose 5… · "Dose reduction necessary in severely impaired liver function." |
| `clinical_information.dosage.hepatic_impairment[].evidence_level` | string | 2456 | "EQUIVALENT_FORMULATION_INTL" · "SAME_FORMULATION_INTL" |
| `clinical_information.dosage.hepatic_impairment[].formulation_match_type` | string | 2456 | "EQUIVALENT_FORMULATION" · "SAME_FORMULATION" |
| `clinical_information.dosage.hepatic_impairment[].requires_manual_review` | boolean | 2470 | false |
| `clinical_information.dosage.hepatic_impairment[].source_country` | string | 2454 | "US" · "IE" |
| `clinical_information.dosage.hepatic_impairment[].source_ids` | array | 2470 |  |
| `clinical_information.dosage.hepatic_impairment[].statement_id` | string | 2470 | "CS-010" · "CS-006" |
| `clinical_information.dosage.hepatic_impairment[].verification_status` | string | 2456 | "VERIFIED" |
| `clinical_information.dosage.maximum_daily_dose` | array | 2286 |  |
| `clinical_information.dosage.maximum_daily_dose[].applicability_note` | string | 2269 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.dosage.maximum_daily_dose[].ar` | string | 2006 | "30 ميكروجرام مرة أسبوعياً (لا يوصى بجرعة أعلى)." · "الحد الأقصى 100 مجم يوميًا للبالغين ومن يزنون 70 كجم فأكثر؛ وللأطفال … |
| `clinical_information.dosage.maximum_daily_dose[].en` | string | 2286 | "30 micrograms once weekly (no higher dose is recommended)." · "Maximum 100 mg/day for adults and patients 70 kg or more; for pediatr… |
| `clinical_information.dosage.maximum_daily_dose[].evidence_level` | string | 2268 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.dosage.maximum_daily_dose[].formulation_match_type` | string | 2275 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.dosage.maximum_daily_dose[].requires_manual_review` | boolean | 2286 | false |
| `clinical_information.dosage.maximum_daily_dose[].source_country` | string | 2269 | "US" · "GB" |
| `clinical_information.dosage.maximum_daily_dose[].source_ids` | array | 2286 |  |
| `clinical_information.dosage.maximum_daily_dose[].statement_id` | string | 2286 | "CS-004" · "CS-003" |
| `clinical_information.dosage.maximum_daily_dose[].verification_status` | string | 2275 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.dosage.missed_dose` | array | 751 |  |
| `clinical_information.dosage.missed_dose[].applicability_note` | string | 742 | "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… · "US prescribing information for memantine hydrochloride 5 mg/10 mg tab… |
| `clinical_information.dosage.missed_dose[].ar` | string | 671 | "تؤخذ الجرعة الفائتة في أقرب وقت ممكن، دون تجاوز الكمية اليومية الإجما… · "إذا فاتت جرعات عدة أيام قد يلزم استئناف العلاج بجرعة أقل وإعادة المعا… |
| `clinical_information.dosage.missed_dose[].en` | string | 751 | "Take a missed dose as soon as possible, but do not exceed the prescri… · "If several days of dosing are missed, it may be necessary to resume a… |
| `clinical_information.dosage.missed_dose[].evidence_level` | string | 747 | "EQUIVALENT_FORMULATION_INTL" · "SAME_FORMULATION_INTL" |
| `clinical_information.dosage.missed_dose[].formulation_match_type` | string | 747 | "EQUIVALENT_FORMULATION" · "SAME_FORMULATION" |
| `clinical_information.dosage.missed_dose[].requires_manual_review` | boolean | 751 | false |
| `clinical_information.dosage.missed_dose[].source_country` | string | 745 | "US" · "GB" |
| `clinical_information.dosage.missed_dose[].source_ids` | array | 751 |  |
| `clinical_information.dosage.missed_dose[].statement_id` | string | 751 | "CS-011" · "CS-006" |
| `clinical_information.dosage.missed_dose[].verification_status` | string | 747 | "VERIFIED" · "PARTIALLY_VERIFIED" |
| `clinical_information.dosage.official_egyptian_label` | array | 50 |  |
| `clinical_information.dosage.official_egyptian_label[].applicability_note` | string | 50 | "Egyptian package insert of this product (Egypt Otsuka; 250 ml and 500… · "Dose stated on the EVA Pharma product page (manufacturer); the dose s… |
| `clinical_information.dosage.official_egyptian_label[].ar` | string | 48 | "عبر وريد مركزي: الجرعة المعتادة للبالغين 400-800 مل يوميًا. عبر وريد … · "من قرص إلى 3 أقراص يوميًا." |
| `clinical_information.dosage.official_egyptian_label[].en` | string | 50 | "Central vein: usual adult dose 400-800 ml per day. Peripheral vein: u… · "1 to 3 tablets daily." |
| `clinical_information.dosage.official_egyptian_label[].evidence_level` | string | 50 | "EGYPTIAN_LABEL" · "MANUFACTURER_CLAIM" |
| `clinical_information.dosage.official_egyptian_label[].formulation_match_type` | string | 50 | "EXACT_PRODUCT" |
| `clinical_information.dosage.official_egyptian_label[].requires_manual_review` | boolean | 50 | false |
| `clinical_information.dosage.official_egyptian_label[].source_country` | string | 50 | "EG" |
| `clinical_information.dosage.official_egyptian_label[].source_ids` | array | 50 |  |
| `clinical_information.dosage.official_egyptian_label[].statement_id` | string | 50 | "CS-001" · "CS-003" |
| `clinical_information.dosage.official_egyptian_label[].verification_status` | string | 50 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.dosage.overdose` | array | 3746 |  |
| `clinical_information.dosage.overdose[].applicability_note` | string | 3720 | "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… · "UK Differin 0.1% w/w Gel (adapalene 1 mg/g, Galderma); same active in… |
| `clinical_information.dosage.overdose[].ar` | string | 3377 | "أشيع أعراض الجرعة الزائدة: أعراض هضمية ونعاس ودوخة ورعشة وسلوك غير طب… · "جرعة السلفونيل يوريا الزائدة قد تسبب هبوط السكر: الحالات الخفيفة جلوك… |
| `clinical_information.dosage.overdose[].en` | string | 3746 | "Commonest overdose symptoms: gastrointestinal symptoms, somnolence, d… · "For cutaneous use only; excessive application gives no faster or bett… |
| `clinical_information.dosage.overdose[].evidence_level` | string | 3722 | "EQUIVALENT_FORMULATION_INTL" · "SAME_FORMULATION_INTL" |
| `clinical_information.dosage.overdose[].formulation_match_type` | string | 3725 | "EQUIVALENT_FORMULATION" · "SAME_FORMULATION" |
| `clinical_information.dosage.overdose[].requires_manual_review` | boolean | 3746 | false · true |
| `clinical_information.dosage.overdose[].source_country` | string | 3722 | "US" · "GB" |
| `clinical_information.dosage.overdose[].source_ids` | array | 3746 |  |
| `clinical_information.dosage.overdose[].statement_id` | string | 3746 | "CS-012" · "CS-004" |
| `clinical_information.dosage.overdose[].verification_status` | string | 3727 | "VERIFIED" · "PARTIALLY_VERIFIED" |
| `clinical_information.dosage.pediatric` | array | 4247 |  |
| `clinical_information.dosage.pediatric[].applicability_note` | string | 4217 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.dosage.pediatric[].ar` | string | 3870 | "لم تثبت السلامة والفعالية لدى الأطفال." · "الأطفال من عمر 6 سنوات فأكثر بوزن أقل من 70 كجم: البدء بـ 0.5 مجم/كجم… |
| `clinical_information.dosage.pediatric[].en` | string | 4247 | "Safety and effectiveness in paediatric patients have not been establi… · "Pediatric patients 6 years and older weighing less than 70 kg: start … |
| `clinical_information.dosage.pediatric[].evidence_level` | string | 4219 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.dosage.pediatric[].formulation_match_type` | string | 4228 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.dosage.pediatric[].requires_manual_review` | boolean | 4247 | false |
| `clinical_information.dosage.pediatric[].source_country` | string | 4224 | "US" · "ES" |
| `clinical_information.dosage.pediatric[].source_ids` | array | 4247 |  |
| `clinical_information.dosage.pediatric[].statement_id` | string | 4247 | "CS-002" · "CS-003" |
| `clinical_information.dosage.pediatric[].verification_status` | string | 4228 | "VERIFIED" |
| `clinical_information.dosage.renal_impairment` | array | 3025 |  |
| `clinical_information.dosage.renal_impairment[].applicability_note` | string | 3004 | "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… · "Irish SmPC (2006) for Trental 300 mg/15 ml concentrate for infusion (… |
| `clinical_information.dosage.renal_impairment[].ar` | string | 2691 | "زاد الفشل الكلوي النهائي التعرض للأتوموكسيتين بنحو 65% ولكن دون فرق ع… · "قيّم معدل الترشيح الكبيبي قبل البدء ودورياً. ممنوع إذا كان أقل من 30 … |
| `clinical_information.dosage.renal_impairment[].en` | string | 3025 | "End-stage renal disease increased atomoxetine exposure about 65%, but… · "CrCl below 10 ml/min: reduce daily dose by about 30-50% to avoid accu… |
| `clinical_information.dosage.renal_impairment[].evidence_level` | string | 3012 | "EQUIVALENT_FORMULATION_INTL" · "SAME_FORMULATION_INTL" |
| `clinical_information.dosage.renal_impairment[].formulation_match_type` | string | 3012 | "EQUIVALENT_FORMULATION" · "SAME_FORMULATION" |
| `clinical_information.dosage.renal_impairment[].requires_manual_review` | boolean | 3025 | false |
| `clinical_information.dosage.renal_impairment[].source_country` | string | 3009 | "US" · "IE" |
| `clinical_information.dosage.renal_impairment[].source_ids` | array | 3025 |  |
| `clinical_information.dosage.renal_impairment[].statement_id` | string | 3025 | "CS-009" · "CS-005" |
| `clinical_information.dosage.renal_impairment[].verification_status` | string | 3012 | "VERIFIED" |
| `clinical_information.drug_interactions` | array | 7312 |  |
| `clinical_information.drug_interactions[].applicability_note` | string | 7236 | "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… · "Spanish SmPC (AEMPS/CIMA) for Somazina 500 mg and 1000 mg solución in… |
| `clinical_information.drug_interactions[].description_ar` | string | 6578 | "تزيد التعرض للأتوموكسيتين؛ تستخدم فترة معايرة أطول (4 أسابيع) إذا لم … · "يمنع الجمع أو خلال 14 يومًا: تفاعلات خطيرة وقاتلة أحيانًا (فرط الحرار… |
| `clinical_information.drug_interactions[].description_en` | string | 7309 | "Increase atomoxetine exposure; use a longer titration interval (4 wee… · "Contraindicated together or within 14 days: serious, sometimes fatal … |
| `clinical_information.drug_interactions[].evidence_level` | string | 7271 | "EQUIVALENT_FORMULATION_INTL" · "INGREDIENT_LEVEL" |
| `clinical_information.drug_interactions[].formulation_match_type` | string | 7274 | "EQUIVALENT_FORMULATION" · "INGREDIENT_LEVEL" |
| `clinical_information.drug_interactions[].interacting_substance` | string | 7309 | "Strong CYP2D6 inhibitors (e.g. paroxetine, fluoxetine)" · "Antihypertensives and pressor agents (e.g. dopamine, dobutamine)" |
| `clinical_information.drug_interactions[].requires_manual_review` | boolean | 7312 | false |
| `clinical_information.drug_interactions[].severity` | string | 1168 | "MAJOR" · "AVOID" |
| `clinical_information.drug_interactions[].source_country` | string | 7300 | "US" · "ES" |
| `clinical_information.drug_interactions[].source_ids` | array | 7312 |  |
| `clinical_information.drug_interactions[].statement_id` | string | 7312 | "CS-024" · "CS-026" |
| `clinical_information.drug_interactions[].verification_status` | string | 7274 | "VERIFIED" · "PARTIALLY_VERIFIED" |
| `clinical_information.monitoring` | array | 3538 |  |
| `clinical_information.monitoring[].applicability_note` | string | 3512 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.monitoring[].ar` | string | 3141 | "تعداد الدم الكامل والتفريقي والصفائح والكيمياء الحيوية بما فيها وظائف… · "قياس معدل القلب وضغط الدم عند البدء وبعد زيادة الجرعة ودوريًا؛ مراقبة… |
| `clinical_information.monitoring[].en` | string | 3538 | "Complete blood and differential white cell counts, platelet counts an… · "Measure heart rate and blood pressure at baseline, after dose increas… |
| `clinical_information.monitoring[].evidence_level` | string | 3518 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.monitoring[].formulation_match_type` | string | 3517 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.monitoring[].requires_manual_review` | boolean | 3538 | false · true |
| `clinical_information.monitoring[].source_country` | string | 3512 | "US" · "GB" |
| `clinical_information.monitoring[].source_ids` | array | 3518 |  |
| `clinical_information.monitoring[].statement_id` | string | 3538 | "CS-023" · "CS-028" |
| `clinical_information.monitoring[].verification_status` | string | 3518 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.pregnancy` | object | 16500 |  |
| `clinical_information.pregnancy.breastfeeding` | array | 6473 |  |
| `clinical_information.pregnancy.breastfeeding[].applicability_note` | string | 6421 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.pregnancy.breastfeeding[].ar` | string | 5827 | "تشير بيانات منشورة محدودة إلى وجود إنترفيرون بيتا-1أ في حليب الأم بمس… · "لا توجد بيانات عن وجوده في حليب الأم أو تأثيره على الرضيع أو إنتاج ال… |
| `clinical_information.pregnancy.breastfeeding[].en` | string | 6473 | "Limited published data indicate that interferon beta-1a is present in… · "No data on presence in human milk, effects on the breastfed child or … |
| `clinical_information.pregnancy.breastfeeding[].evidence_level` | string | 6438 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.pregnancy.breastfeeding[].formulation_match_type` | string | 6440 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.pregnancy.breastfeeding[].requires_manual_review` | boolean | 6473 | false |
| `clinical_information.pregnancy.breastfeeding[].source_country` | string | 6449 | "US" · "FR" |
| `clinical_information.pregnancy.breastfeeding[].source_ids` | array | 6473 |  |
| `clinical_information.pregnancy.breastfeeding[].statement_id` | string | 6473 | "CS-008" · "CS-015" |
| `clinical_information.pregnancy.breastfeeding[].verification_status` | string | 6440 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.pregnancy.current_labeling_framework` | string | 6942 | "FDA_PLLR" · "EU_SMPC" |
| `clinical_information.pregnancy.fetal_risks` | array | 489 |  |
| `clinical_information.pregnancy.fetal_risks[].applicability_note` | string | 474 | "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… · "UK SmPC for Lipitor 10 mg film-coated tablets (atorvastatin calcium t… |
| `clinical_information.pregnancy.fetal_risks[].ar` | string | 459 | "بيانات حيوانية: في دراسة من 3 على الأرانب انخفاض الأجنة الحية وزيادة … · "قد يخفض تناول الأم للأتورفاستاتين مستويات الميفالونات لدى الجنين، وهو… |
| `clinical_information.pregnancy.fetal_risks[].en` | string | 489 | "Animal data: in 1 of 3 rabbit studies, fewer live fetuses, more early… · "Maternal atorvastatin may reduce foetal levels of mevalonate, a precu… |
| `clinical_information.pregnancy.fetal_risks[].evidence_level` | string | 474 | "EQUIVALENT_FORMULATION_INTL" · "SAME_FORMULATION_INTL" |
| `clinical_information.pregnancy.fetal_risks[].formulation_match_type` | string | 474 | "EQUIVALENT_FORMULATION" · "SAME_FORMULATION" |
| `clinical_information.pregnancy.fetal_risks[].requires_manual_review` | boolean | 489 | false |
| `clinical_information.pregnancy.fetal_risks[].source_country` | string | 474 | "US" · "GB" |
| `clinical_information.pregnancy.fetal_risks[].source_ids` | array | 489 |  |
| `clinical_information.pregnancy.fetal_risks[].statement_id` | string | 489 | "CS-014" · "CS-015" |
| `clinical_information.pregnancy.fetal_risks[].verification_status` | string | 474 | "VERIFIED" · "PARTIALLY_VERIFIED" |
| `clinical_information.pregnancy.first_trimester` | array | 265 |  |
| `clinical_information.pregnancy.first_trimester[].applicability_note` | string | 254 | "Italian RCP of ARACYTIN 100 mg/5 ml (Pfizer; same brand, company and … · "French SmPC/notice of HYDROCORTISONE ROUSSEL 10 mg comprimé sécable (… |
| `clinical_information.pregnancy.first_trimester[].ar` | string | 231 | "أُبلغ عن تشوهات خلقية في الأطراف والأذنين بعد التعرض في الثلث الأول؛ … · "تشير بيانات وبائية إلى أن استخدام الجلوكوكورتيكويدات في الثلث الأول ق… |
| `clinical_information.pregnancy.first_trimester[].en` | string | 265 | "Congenital limb and ear anomalies have been reported after first-trim… · "Epidemiological data suggest glucocorticoid use in the first trimeste… |
| `clinical_information.pregnancy.first_trimester[].evidence_level` | string | 255 | "SAME_FORMULATION_INTL" · "EXACT_PRODUCT_INTL" |
| `clinical_information.pregnancy.first_trimester[].formulation_match_type` | string | 257 | "SAME_FORMULATION" · "EXACT_PRODUCT" |
| `clinical_information.pregnancy.first_trimester[].requires_manual_review` | boolean | 265 | false |
| `clinical_information.pregnancy.first_trimester[].source_country` | string | 257 | "IT" · "FR" |
| `clinical_information.pregnancy.first_trimester[].source_ids` | array | 265 |  |
| `clinical_information.pregnancy.first_trimester[].statement_id` | string | 265 | "CS-012" · "CS-007" |
| `clinical_information.pregnancy.first_trimester[].verification_status` | string | 257 | "VERIFIED" |
| `clinical_information.pregnancy.historical_category_source` | string | 508 | "S2" · "S3" |
| `clinical_information.pregnancy.historical_fda_category` | string | 520 | "C" · "B" |
| `clinical_information.pregnancy.regional_pregnancy_categories` | array | 651 |  |
| `clinical_information.pregnancy.regional_pregnancy_categories[].category` | string | 651 | "C" · "B" |
| `clinical_information.pregnancy.regional_pregnancy_categories[].notes` | string | 646 | "Stated in the US Trental label (pre-PLLR format); not a current label… · "Stated as \"Pregnancy Category C\" in the current US generic label (o… |
| `clinical_information.pregnancy.regional_pregnancy_categories[].source_ids` | array | 651 |  |
| `clinical_information.pregnancy.regional_pregnancy_categories[].system` | string | 651 | "FDA_HISTORICAL" · "AU_TGA" |
| `clinical_information.pregnancy.risk_summary` | array | 8090 |  |
| `clinical_information.pregnancy.risk_summary[].applicability_note` | string | 8016 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "US originator STRATTERA (atomoxetine) capsules label (Eli Lilly and C… |
| `clinical_information.pregnancy.risk_summary[].ar` | string | 7370 | "لم تحدد بيانات دراسة أترابية سكانية كبيرة ودراسات منشورة أخرى على مدى… · "البيانات المنشورة غير كافية لتحديد خطر مرتبط بالدواء للتشوهات الخلقية… |
| `clinical_information.pregnancy.risk_summary[].en` | string | 8090 | "Data from a large population-based cohort study and other published s… · "Published data are insufficient to establish a drug-associated risk o… |
| `clinical_information.pregnancy.risk_summary[].evidence_level` | string | 8050 | "EXACT_PRODUCT_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.pregnancy.risk_summary[].formulation_match_type` | string | 8051 | "EXACT_PRODUCT" · "EQUIVALENT_FORMULATION" |
| `clinical_information.pregnancy.risk_summary[].requires_manual_review` | boolean | 8090 | false |
| `clinical_information.pregnancy.risk_summary[].source_country` | string | 8052 | "US" · "INTL" |
| `clinical_information.pregnancy.risk_summary[].source_ids` | array | 8090 |  |
| `clinical_information.pregnancy.risk_summary[].statement_id` | string | 8090 | "CS-007" · "CS-013" |
| `clinical_information.pregnancy.risk_summary[].verification_status` | string | 8053 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.pregnancy.second_trimester` | array | 207 |  |
| `clinical_information.pregnancy.second_trimester[].applicability_note` | string | 204 | "UK SmPC Voltarol Ophtha Multidose 0.1% (diclofenac sodium 1 mg/ml, BA… · "Irish SmPC for Nebilet Plus 5 mg/25 mg film-coated tablets (Menarini)… |
| `clinical_information.pregnancy.second_trimester[].ar` | string | 173 | "لا يُستعمل إلا عند الضرورة القصوى، بأقل جرعة ولأقصر مدة." · "قد يضعف الهيدروكلوروثيازيد في الثلثين الثاني والثالث التروية الجنينية… |
| `clinical_information.pregnancy.second_trimester[].en` | string | 207 | "Do not use unless clearly necessary; lowest dose, shortest duration." · "Hydrochlorothiazide in the second and third trimesters may compromise… |
| `clinical_information.pregnancy.second_trimester[].evidence_level` | string | 204 | "SAME_FORMULATION_INTL" · "EQUIVALENT_FORMULATION_INTL" |
| `clinical_information.pregnancy.second_trimester[].formulation_match_type` | string | 204 | "SAME_FORMULATION" · "EQUIVALENT_FORMULATION" |
| `clinical_information.pregnancy.second_trimester[].requires_manual_review` | boolean | 207 | false |
| `clinical_information.pregnancy.second_trimester[].source_country` | string | 204 | "GB" · "IE" |
| `clinical_information.pregnancy.second_trimester[].source_ids` | array | 207 |  |
| `clinical_information.pregnancy.second_trimester[].statement_id` | string | 207 | "CS-008" · "CS-009" |
| `clinical_information.pregnancy.second_trimester[].verification_status` | string | 204 | "VERIFIED" |
| `clinical_information.pregnancy.third_trimester` | array | 776 |  |
| `clinical_information.pregnancy.third_trimester[].applicability_note` | string | 764 | "US INVEGA label (Janssen Pharmaceuticals; paliperidone extended-relea… · "US prescribing information for Nalbuphine Hydrochloride Injection (Ho… |
| `clinical_information.pregnancy.third_trimester[].ar` | string | 622 | "حديثو الولادة المعرضون في الثلث الأخير معرضون لأعراض خارج هرمية و/أو … · "أثناء المخاض والولادة: انتقال الدواء عبر المشيمة مرتفع وسريع ومتغير؛ … |
| `clinical_information.pregnancy.third_trimester[].en` | string | 776 | "Neonates exposed in the third trimester are at risk of extrapyramidal… · "Labor and delivery: placental transfer is high, rapid and variable; f… |
| `clinical_information.pregnancy.third_trimester[].evidence_level` | string | 767 | "EXACT_PRODUCT_INTL" · "SAME_FORMULATION_INTL" |
| `clinical_information.pregnancy.third_trimester[].formulation_match_type` | string | 767 | "EXACT_PRODUCT" · "SAME_FORMULATION" |
| `clinical_information.pregnancy.third_trimester[].requires_manual_review` | boolean | 776 | false |
| `clinical_information.pregnancy.third_trimester[].source_country` | string | 768 | "US" · "GB" |
| `clinical_information.pregnancy.third_trimester[].source_ids` | array | 776 |  |
| `clinical_information.pregnancy.third_trimester[].statement_id` | string | 776 | "CS-010" · "CS-012" |
| `clinical_information.pregnancy.third_trimester[].verification_status` | string | 767 | "VERIFIED" |
| `clinical_information.uses` | array | 9925 |  |
| `clinical_information.uses[].applicability_note` | string | 9858 | "Use statement from the Egyptian price directory record for this exact… · "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… |
| `clinical_information.uses[].approval_status` | string | 9890 | "MANUFACTURER_CLAIM" · "APPROVED_OTHER_REGULATOR" |
| `clinical_information.uses[].evidence_level` | string | 9858 | "MANUFACTURER_CLAIM" · "EXACT_PRODUCT_INTL" |
| `clinical_information.uses[].formulation_match_type` | string | 9901 | "EXACT_PRODUCT" · "INGREDIENT_LEVEL" |
| `clinical_information.uses[].indication_ar` | string | 9095 | "مسكن ومطهر للأذن (وصف الدليل)" · "علاج الأشكال الانتكاسية من التصلب المتعدد لدى البالغين، بما فيها المت… |
| `clinical_information.uses[].indication_en` | string | 9915 | "Ear analgesic and antiseptic (directory description)" · "Treatment of relapsing forms of multiple sclerosis, including clinica… |
| `clinical_information.uses[].population` | string | 7510 | "Adults" · "Adults and pediatric patients 6 years and older" |
| `clinical_information.uses[].requires_manual_review` | boolean | 9925 | false · true |
| `clinical_information.uses[].source_country` | string | 9883 | "EG" · "US" |
| `clinical_information.uses[].source_ids` | array | 9925 |  |
| `clinical_information.uses[].statement_id` | string | 9925 | "CS-001" · "CS-009" |
| `clinical_information.uses[].verification_status` | string | 9905 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `clinical_information.warnings` | array | 9971 |  |
| `clinical_information.warnings[].applicability_note` | string | 9874 | "US DailyMed label (SPL v23, published 2025-11-28) for AVONEX (interfe… · "Ingredient-level US linezolid vs Egyptian Debacozolin oral suspension… |
| `clinical_information.warnings[].ar` | string | 9089 | "انخفاض تعداد خلايا الدم الطرفية (بما فيه قلة الكريات الشاملة ونقص الص… · "إصابة الكبد بما فيها التهاب الكبد المناعي والفشل الكبدي: تُراقب وظائف… |
| `clinical_information.warnings[].en` | string | 9971 | "Depression, suicidal ideation and psychosis: monitor and consider dis… · "Hepatic injury, including autoimmune hepatitis and hepatic failure: m… |
| `clinical_information.warnings[].evidence_level` | string | 9914 | "EXACT_PRODUCT_INTL" · "INGREDIENT_LEVEL" |
| `clinical_information.warnings[].formulation_match_type` | string | 9915 | "EXACT_PRODUCT" · "INGREDIENT_LEVEL" |
| `clinical_information.warnings[].requires_manual_review` | boolean | 9971 | false |
| `clinical_information.warnings[].source_country` | string | 9949 | "US" · "INTL" |
| `clinical_information.warnings[].source_ids` | array | 9971 |  |
| `clinical_information.warnings[].statement_id` | string | 9971 | "CS-021" · "CS-011" |
| `clinical_information.warnings[].verification_status` | string | 9922 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `combinations` | array | 115 |  |
| `combinations[].active_ingredients` | array | 115 |  |
| `combinations[].formulation` | string | 115 | "Syrup" · "Film-coated tablets" |
| `combinations[].market` | string | 115 | "Egypt" · "United States" |
| `combinations[].product_name` | string | 115 | "Epicophylline Phenobarbitone syrup" · "Awadist Cold & Flu" |
| `combinations[].purpose_ar` | string | 111 | "موسع للشعب الهوائية مع جرعة منخفضة من مهدئ باربيتوري." · "مسكن وخافض للحرارة + مزيل للاحتقان + مضاد للهيستامين لأعراض البرد وال… |
| `combinations[].purpose_en` | string | 111 | "Bronchodilator combined with a low-dose barbiturate sedative." · "Analgesic/antipyretic + nasal decongestant + antihistamine for cold a… |
| `combinations[].source_ids` | array | 115 |  |
| `combinations[].strengths` | array | 97 |  |
| `company` | string | 16031 | "Pharco" · "Topix (Registry Pharma)" |
| `created_at` |  | 0 |  |
| `current_price` | number | 15843 | 18.0 · 149.0 |
| `dailymed` | object | 16500 |  |
| `dailymed.differences_from_egyptian_product` | array | 7220 |  |
| `dailymed.label_title` | string | 6656 | "AVONEX (interferon beta-1a) injection, prefilled syringe / autoinject… · "STRATTERA (ATOMOXETINE HYDROCHLORIDE) CAPSULE [ELI LILLY AND COMPANY]… |
| `dailymed.match_status` | string | 16452 | "NOT_FOUND" · "NOT_APPLICABLE" |
| `dailymed.match_type` | string | 6618 | "EXACT_PRODUCT" · "SAME_INGREDIENTS_SAME_STRENGTH" |
| `dailymed.matched_ingredients` | array | 6118 |  |
| `dailymed.original_url` | string | 6639 | "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d70a39cc-de1… · "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=309de576-c31… |
| `dailymed.published_date` | string | 6455 | "2025-11-28" · "2026-07-23" |
| `dailymed.sections` | object | 16500 |  |
| `dailymed.sections.adverse_reactions` | object | 16500 |  |
| `dailymed.sections.adverse_reactions.ar` | string | 864 | "أعراض شبيهة بالإنفلونزا (قشعريرة، حمى، ألم عضلي، وهن)." · "الأطفال: غثيان وقيء وتعب ونقص الشهية وألم البطن ونعاس. البالغون: إمسا… |
| `dailymed.sections.adverse_reactions.en` | string | 1060 | "Flu-like symptoms (chills, fever, myalgia, asthenia)." · "Pediatric: nausea, vomiting, fatigue, decreased appetite, abdominal p… |
| `dailymed.sections.contraindications` | object | 16500 |  |
| `dailymed.sections.contraindications.ar` | string | 1697 | "فرط الحساسية لإنترفيرون بيتا الطبيعي أو المؤتلف أو أي مكون." · "فرط الحساسية؛ استخدام مثبطات أكسيداز أحادي الأمين خلال 14 يومًا؛ الزر… |
| `dailymed.sections.contraindications.en` | string | 2783 | "Hypersensitivity to natural or recombinant interferon beta or any com… · "Hypersensitivity; MAOI use within 14 days; narrow angle glaucoma; phe… |
| `dailymed.sections.description` | object | 16500 |  |
| `dailymed.sections.description.ar` | string | 391 | "كبسولات هيدروكلوريد الأتوموكسيتين للاستعمال الفموي؛ يعبر عن التركيز ب… · "أقراص مغلفة بجرعة ثابتة من الإيزيتيميب والأتورفاستاتين (10/10، 10/20،… |
| `dailymed.sections.description.en` | string | 482 | "Atomoxetine hydrochloride capsules for oral use; strengths are expres… · "Fixed-dose film-coated tablets of ezetimibe and atorvastatin (10/10, … |
| `dailymed.sections.dosage` | object | 16500 |  |
| `dailymed.sections.dosage.ar` | string | 1746 | "30 ميكروجرام عضلياً مرة أسبوعياً؛ مع إمكانية البدء التدريجي من 7.5 مي… · "أقل من 70 كجم: 0.5 مجم/كجم يوميًا تزاد بعد 3 أيام على الأقل إلى 1.2 م… |
| `dailymed.sections.dosage.en` | string | 2765 | "30 micrograms IM once weekly; optional titration from 7.5 micrograms … · "Under 70 kg: 0.5 mg/kg/day titrated after at least 3 days to 1.2 mg/k… |
| `dailymed.sections.indications` | object | 16500 |  |
| `dailymed.sections.indications.ar` | string | 2347 | "الأشكال الانتكاسية من التصلب المتعدد لدى البالغين." · "اضطراب فرط الحركة وتشتت الانتباه لدى البالغين والأطفال من عمر 6 سنوات… |
| `dailymed.sections.indications.en` | string | 3768 | "Relapsing forms of multiple sclerosis in adults (CIS, RRMS, active SP… · "ADHD in adults and pediatric patients 6 years and older." |
| `dailymed.sections.interactions` | object | 16500 |  |
| `dailymed.sections.interactions.ar` | string | 706 | "مثبطات أكسيداز أحادي الأمين (ممنوع)؛ مثبطات CYP2D6 القوية (معايرة أبط… · "يتجنب السيكلوسبورين والتيبرانافير مع الريتونافير والتيلابريفير والجمف… |
| `dailymed.sections.interactions.en` | string | 831 | "MAOIs (contraindicated); strong CYP2D6 inhibitors (longer titration);… · "Avoid cyclosporine, tipranavir+ritonavir, telaprevir, gemfibrozil; do… |
| `dailymed.sections.lactation` | object | 16500 |  |
| `dailymed.sections.lactation.ar` | string | 1021 | "يوجد في حليب الأم بمستويات منخفضة؛ تُوازن الفوائد والمخاطر." · "لا توجد بيانات عن حليب الأم؛ يوجد في حليب الحيوانات؛ توازن فوائد الرض… |
| `dailymed.sections.lactation.en` | string | 1407 | "Present in human milk at low levels; weigh benefits and risks." · "No human milk data; present in animal milk; weigh benefits of breastf… |
| `dailymed.sections.pharmacology` | object | 16500 |  |
| `dailymed.sections.pharmacology.ar` | string | 484 | "إنترفيرون من النوع الأول؛ آليته في التصلب المتعدد غير معروفة." · "مثبط انتقائي لإعادة امتصاص النورإبينفرين؛ يُعتقد أن آليته تشمل التثبي… |
| `dailymed.sections.pharmacology.en` | string | 594 | "Type I interferon; mechanism in MS unknown." · "Selective norepinephrine reuptake inhibitor; mechanism in ADHD though… |
| `dailymed.sections.pregnancy` | object | 16500 |  |
| `dailymed.sections.pregnancy.ar` | string | 1082 | "لم يُحدد خطر للعيوب الخلقية الكبرى في بيانات أترابية كبيرة." · "البيانات البشرية غير كافية لتحديد خطر مرتبط بالدواء؛ تأثيرات نمائية س… |
| `dailymed.sections.pregnancy.en` | string | 1539 | "No drug-associated risk of major birth defects identified in large co… · "Human data insufficient to establish drug-associated risk; adverse de… |
| `dailymed.sections.warnings` | object | 16500 |  |
| `dailymed.sections.warnings.ar` | string | 1313 | "الاكتئاب/الانتحار/الذهان، إصابة الكبد، الحساسية المفرطة، تفاعلات موضع… · "تحذير مؤطر للأفكار والسلوكيات الانتحارية لدى الأطفال؛ إصابة كبدية شدي… |
| `dailymed.sections.warnings.en` | string | 1935 | "Depression/suicide/psychosis, hepatic injury, anaphylaxis, injection … · "Boxed warning for suicidal thoughts and behaviors in pediatric patien… |
| `dailymed.set_id` | string | 6655 | "d70a39cc-de15-4c12-a1ec-8063b69ea0e1" · "309de576-c318-404a-bc15-660c2b1876fb" |
| `dailymed.source_ids` | array | 7267 |  |
| `dailymed.spl_version` | number | 5532 | 23 · 69 |
| `data_quality` | object | 16500 |  |
| `data_quality.barcode_verified` | boolean | 16500 | true · false |
| `data_quality.candidate_values` | array | 3318 |  |
| `data_quality.candidate_values[].field_path` | string | 3318 | "current_price" · "image_url" |
| `data_quality.candidate_values[].reason_unverified` | string | 3318 | "Crowd-sourced price on egyptdwa.com with no reliable price date" · "Directory-hosted image not checked against the actual pack." |
| `data_quality.candidate_values[].source_ids` | array | 3108 |  |
| `data_quality.candidate_values[].value` | number | 3311 | "2.6" · "https://dwaprices.com/upload/1784749367.png" |
| `data_quality.candidate_values[].value.basis` | string | 7 | "PER_DOSE" · "PER_UNIT" |
| `data_quality.candidate_values[].value.currency` | string | 1 | "EGP" |
| `data_quality.candidate_values[].value.dextrose` | string | 2 | "27.5 g/L" |
| `data_quality.candidate_values[].value.folate_mcg` | number | 1 | 680 |
| `data_quality.candidate_values[].value.original_text` | string | 7 | "miconazole nitrate 20 mg; hydrocortisone 10 mg (per composition listi… · "400 mg amoxicillin per 5 ml" |
| `data_quality.candidate_values[].value.potassium citrate` | string | 2 | "2.162 g/L" |
| `data_quality.candidate_values[].value.price` | number | 1 | 130.0 |
| `data_quality.candidate_values[].value.price_per_strip_egp` | number | 1 | 50.0 |
| `data_quality.candidate_values[].value.retailer` | string | 1 | "El Ghazawy" |
| `data_quality.candidate_values[].value.sodium chloride` | string | 2 | "2.045 g/L" |
| `data_quality.candidate_values[].value.sodium citrate` | string | 2 | "0.980 g/L" |
| `data_quality.candidate_values[].value.unit` | string | 7 | "mg" |
| `data_quality.candidate_values[].value.value` | number | 7 | 400 · 57 |
| `data_quality.candidate_values[].value.vitamin_b12_mcg` | number | 1 | 5 |
| `data_quality.candidate_values[].value.vitamin_c_mg` | number | 1 | 500 · 600 |
| `data_quality.candidate_values[].value.vitamin_d_iu` | number | 1 | 400 |
| `data_quality.candidate_values[].value.vitamin_d3_iu` | number | 1 | 1000 |
| `data_quality.candidate_values[].value.zinc_mg` | number | 1 | 25 |
| `data_quality.candidate_values[].value.zinc_sulphate_mg` | number | 1 | 5 |
| `data_quality.conflicting_information` | array | 3707 |  |
| `data_quality.dailymed_match_verified` | boolean | 16500 | false · true |
| `data_quality.egyptian_leaflet_verified` | boolean | 16500 | false |
| `data_quality.exact_product_verified` | boolean | 16500 | true · false |
| `data_quality.image_verified` | boolean | 16500 | false |
| `data_quality.ingredient_verified` | boolean | 16500 | true · false |
| `data_quality.limitations` | array | 16496 |  |
| `data_quality.manual_review_required` | boolean | 16500 | false · true |
| `data_quality.missing_fields` | array | 16383 |  |
| `data_quality.original_sheet_name` | string | 16500 | "Otocalm ear drops 10 ml" · "Re iro 30 tablets" |
| `data_quality.price_verified` | boolean | 16500 | true · false |
| `data_quality.record_key` | string | 16500 | "row-012786" · "row-014735" |
| `data_quality.requires_pharmacist_review` | boolean | 16500 | true |
| `data_quality.research_status` | string | 16500 | "PARTIALLY_VERIFIED" · "VERIFIED" |
| `data_quality.schema_migration` | object | 100 |  |
| `data_quality.schema_migration.conversion_limitations` | array | 100 |  |
| `data_quality.schema_migration.from_version` | string | 100 | "3.0.0" |
| `data_quality.schema_migration.migrated_at` | string | 100 | "2026-09-27T02:18:37+00:00" |
| `data_quality.schema_migration.preserved_original_values` |  | 0 |  |
| `data_quality.schema_migration.status` | string | 100 | "MIGRATED_WITH_LIMITATIONS" |
| `data_quality.schema_migration.to_version` | string | 100 | "3.1.0" |
| `data_quality.schema_migration.transformed_fields` | array | 100 |  |
| `data_quality.source_sheet_row` | number | 16500 | 12787 · 14736 |
| `data_quality.strength_verified` | boolean | 16500 | false · true |
| `data_quality.superseded_values` | array | 6 |  |
| `data_quality.superseded_values[].date` | string | 6 | "2026-10-06" · "2026-10-14" |
| `data_quality.superseded_values[].field_path` | string | 6 | "arabic_name" · "company" |
| `data_quality.superseded_values[].previous_value` | number | 6 | "وبرون ديبوت 3.75مجم/2مل امبول حقن" · "اوراب فورت 40 مجم 20 قرص" |
| `data_quality.superseded_values[].reason` | string | 6 | "Directory spelling lacks the initial letter of the brand name; correc… · "Directory Arabic name says 40 mg, inconsistent with the 4 mg strength… |
| `description` | string | 16106 | "Ear drops containing phenazone and chlorobutanol, 10 ml bottle." · "Iron food supplement tablets with ferrous fumarate, lactoferrin, vita… |
| `dosage` | string | 3846 | "US Avonex label: 30 micrograms intramuscularly once a week; may be ti… · "Per the US STRATTERA capsules label (40 mg strength): under 70 kg sta… |
| `egyptian_package_insert` | object | 16500 |  |
| `egyptian_package_insert.arabic_content_type` | string | 16177 | "UNAVAILABLE" |
| `egyptian_package_insert.availability_status` | string | 16263 | "UNAVAILABLE" |
| `egyptian_package_insert.english_content_type` | string | 16177 | "UNAVAILABLE" |
| `egyptian_package_insert.manufacturer_document_url` | string | 40 | "https://www.egyptotsuka.com/Admin/Uploads/EN/202006090652241655.pdf" · "https://milga.evapharma.com/newsletter" |
| `egyptian_package_insert.official_arabic_pdf_url` | string | 10 | "https://www.badrpharma.net/wp-content/uploads/2022/11/Badotirizin-syr… · "http://eservices.edaegypt.gov.eg//dicomstorage//Attachments//15479336… |
| `egyptian_package_insert.official_english_pdf_url` | string | 36 | "https://www.egyptotsuka.com/Admin/Uploads/EN/202006090652241655.pdf" · "https://www.atcopharma.com.eg/wp-content/uploads/2023/12/Atcogliflozi… |
| `egyptian_package_insert.revision_date` | string | 2 | "2010-04-13" |
| `egyptian_package_insert.sections` | object | 16500 |  |
| `egyptian_package_insert.sections.composition` | object | 16500 |  |
| `egyptian_package_insert.sections.composition.ar` | string | 44 | "كل 100 مل يحتوي (لوحة البطاقة): إل-ليوسين 1.4 جم، إل-أيزوليوسين 0.8 ج… · "كل قرص: بنفوتيامين 300 مجم، فيتامين ب6 100 مجم، فيتامين ب12 250 ميكرو… |
| `egyptian_package_insert.sections.composition.en` | string | 51 | "Each 100 ml contains (label panel): L-leucine 1.4 g, L-isoleucine 0.8… · "Each tablet: benfotiamine 300 mg, vitamin B6 100 mg, vitamin B12 250 … |
| `egyptian_package_insert.sections.contraindications` | object | 16500 |  |
| `egyptian_package_insert.sections.contraindications.ar` | string | 44 | "الغيبوبة الكبدية أو خطر حدوثها؛ والاضطراب الكلوي الشديد أو آزوتيمية ا… · "يمنع استخدامه في حالة فرط الحساسية لأي من مكوناته." |
| `egyptian_package_insert.sections.contraindications.en` | string | 50 | "Hepatic coma or risk of hepatic coma; severe renal disorder or azotae… · "Contraindicated in hypersensitivity to any component." |
| `egyptian_package_insert.sections.dosage` | object | 16500 |  |
| `egyptian_package_insert.sections.dosage.ar` | string | 41 | "عبر وريد مركزي: الجرعة المعتادة للبالغين 400-800 مل يوميًا. عبر وريد … · "السكري من النوع الثاني: البدء بـ 10 مجم مرة يومياً؛ ويمكن زيادتها إلى… |
| `egyptian_package_insert.sections.dosage.en` | string | 48 | "Central vein: usual adult dose 400-800 ml per day. Peripheral vein: u… · "Type 2 diabetes: start 10 mg once daily; may increase to 25 mg once d… |
| `egyptian_package_insert.sections.indications` | object | 16500 |  |
| `egyptian_package_insert.sections.indications.ar` | string | 41 | "توفير الأحماض الأمينية في نقص بروتين الدم وسوء التغذية وقبل الجراحة و… · "البالغون المصابون بداء السكري من النوع الثاني غير المنضبط بشكل كافٍ ك… |
| `egyptian_package_insert.sections.indications.en` | string | 48 | "Provision of amino acids in hypoproteinaemia, malnutrition, and befor… · "Adults with insufficiently controlled type 2 diabetes mellitus as an … |
| `egyptian_package_insert.sections.interactions` | object | 16500 |  |
| `egyptian_package_insert.sections.interactions.ar` | string | 38 | "الثيوسيميكاربازون و5-فلورويوراسيل يضادان الثيامين؛ الأيزونيازيد والبن… · "مدرات البول (جفاف وانخفاض ضغط)؛ الإنسولين ومحفزات إفرازه (نقص سكر؛ تخ… |
| `egyptian_package_insert.sections.interactions.en` | string | 40 | "Thiosemicarbazone and 5-fluorouracil antagonise thiamine; isoniazid, … · "Diuretics (dehydration, hypotension); insulin and insulin secretagogu… |
| `egyptian_package_insert.sections.pregnancy` | object | 16500 |  |
| `egyptian_package_insert.sections.pregnancy.ar` | string | 38 | "الحمل والرضاعة: يجب استشارة الطبيب قبل الاستخدام." · "يُتجنب أثناء الحمل (لا توجد بيانات)؛ ولا يستخدم أثناء الرضاعة الطبيعي… |
| `egyptian_package_insert.sections.pregnancy.en` | string | 41 | "Pregnancy and breastfeeding: consult a doctor before use." · "Avoid during pregnancy (no data); should not be used during breastfee… |
| `egyptian_package_insert.sections.side_effects` | object | 16500 |  |
| `egyptian_package_insert.sections.side_effects.ar` | string | 41 | "آثار جانبية لدى 35 من 3973 مريضًا (0.88%) في بيانات إعادة التقييم الي… · "أعراض هضمية (غثيان، قيء، إسهال، ألم بطني)؛ وتفاعلات فرط حساسية نادرة … |
| `egyptian_package_insert.sections.side_effects.en` | string | 43 | "Adverse reactions in 35 of 3,973 patients (0.88%) in the Japanese re-… · "Gastrointestinal effects (nausea, vomiting, diarrhoea, abdominal pain… |
| `egyptian_package_insert.sections.storage` | object | 16500 |  |
| `egyptian_package_insert.sections.storage.ar` | string | 39 | "يُحفظ في درجة حرارة لا تتجاوز 30 درجة مئوية بعيدًا عن أشعة الشمس المب… · "يحفظ في درجة حرارة لا تزيد عن 30°م في مكان جاف؛ مدة الصلاحية سنتان؛ ع… |
| `egyptian_package_insert.sections.storage.en` | string | 44 | "Store at a temperature not exceeding 30 °C, away from direct sunlight… · "Store at or below 30°C in a dry place; shelf life 2 years; cartons of… |
| `egyptian_package_insert.sections.warnings` | object | 16500 |  |
| `egyptian_package_insert.sections.warnings.ar` | string | 42 | "يُعطى بحذر في الحماض الشديد وقصور القلب الاحتقاني (قد تزيد زيادة حجم … · "فقر الدم الخبيث يحتاج إلى جرعات كافية وفحوص دم منتظمة؛ والاستخدام الع… |
| `egyptian_package_insert.sections.warnings.en` | string | 46 | "Administer with care in severe acidosis and congestive cardiac failur… · "Pernicious anaemia requires adequate doses and regular blood tests; i… |
| `egyptian_package_insert.source_ids` | array | 51 |  |
| `id` |  | 0 |  |
| `image_url` | string | 68 | "https://cdn.shopify.com/s/files/1/0940/0211/8948/files/36_c2ec53d7-f9… · "https://dwaprices.com/upload/1785923516.png" |
| `indications` | string | 4218 | "US Avonex label (same brand and dose): relapsing forms of multiple sc… · "Attention-deficit/hyperactivity disorder (ADHD) in adults and childre… |
| `ingredient_upper_limits` | array | 995 |  |
| `ingredient_upper_limits[].age_group` | string | 975 | "19–50 years" · "19+ years" |
| `ingredient_upper_limits[].ingredient` | string | 995 | "Calcium (elemental)" · "Zinc" |
| `ingredient_upper_limits[].jurisdiction` | string | 995 | "US_NIH_ODS" · "United States (Food and Nutrition Board, via NIH ODS)" |
| `ingredient_upper_limits[].limit_type` | string | 995 | "TOLERABLE_UPPER_INTAKE_LEVEL" |
| `ingredient_upper_limits[].limit_value` | number | 995 | 2500.0 · 1000 |
| `ingredient_upper_limits[].notes` | string | 958 | "NIH ODS UL; NOT a recommended product dose. Ages ≥51 years UL is 2000… · "UL applies to folic acid from supplements and fortified foods; not a … |
| `ingredient_upper_limits[].population` | string | 995 | "Adults 19–50 years (including pregnancy and lactation); total intake … · "Adults 19+ years (incl. pregnancy and lactation)" |
| `ingredient_upper_limits[].sex_or_life_stage` | string | 647 | "Male and female; pregnancy and lactation included" · "Male and female" |
| `ingredient_upper_limits[].source_ids` | array | 995 |  |
| `ingredient_upper_limits[].unit` | string | 995 | "mg/day" · "mcg/day" |
| `ingredients` | array | 14937 |  |
| `ingredients[].atc_code` | string | 8218 | "S02DA03" · "L03AB07" |
| `ingredients[].cfu_basis` | string | 6 | "per capsule" · "spores per 5 ml mini bottle" |
| `ingredients[].cfu_per_serving` | number | 7 | 5000000000 · 4000000000 |
| `ingredients[].chemical_formula` | string | 8309 | "C11H12N2O" · "C4H7Cl3O" |
| `ingredients[].drugbank_id` | string | 5077 | "DB00060" · "DB09536" |
| `ingredients[].mechanism_ar` | string | 7060 | "إنترفيرون من النوع الأول؛ والآلية التي يؤثر بها في التصلب المتعدد غير… · "يعكس ويبعثر الأشعة فوق البنفسجية." |
| `ingredients[].mechanism_en` | string | 7692 | "Type I interferon; the mechanism by which it exerts its effects in mu… · "Reflects and scatters UV radiation." |
| `ingredients[].molecular_weight` | number | 8285 | 188.23 · 177.45 |
| `ingredients[].name_ar` | string | 13439 | "فينازون (أنتيبيرين)" · "كلوروبيوتانول" |
| `ingredients[].name_en` | string | 14937 | "Phenazone (antipyrine)" · "Chlorobutanol" |
| `ingredients[].pharmacological_class_ar` | string | 10092 | "مسكن من مجموعة البيرازولون" · "إنترفيرون (من النوع الأول، بيتا)" |
| `ingredients[].pharmacological_class_en` | string | 11087 | "Pyrazolone analgesic" · "Interferon (type I, beta)" |
| `ingredients[].pubchem_cid` | number | 8654 | 5977 · 2206 |
| `ingredients[].scientific_name` | string | 13198 | "Phenazone" · "Chlorobutanol" |
| `ingredients[].serving_description` | string | 286 | "per 10 ml" · "5 ml (1 teaspoon)" |
| `ingredients[].source_ids` | array | 14937 |  |
| `ingredients[].strain_designation` | string | 4 | "Lactobacillus rhamnosus" · "Bifidobacterium infantis" |
| `ingredients[].strength` | object | 10731 |  |
| `ingredients[].strength.basis` | string | 8773 | "PER_UNIT" · "PER_ML" |
| `ingredients[].strength.concentration_type` | string | 545 | "W_V" · "W_W" |
| `ingredients[].strength.denominator_unit` | string | 2025 | "ml" · "mL" |
| `ingredients[].strength.denominator_value` | number | 2025 | 1 · 2 |
| `ingredients[].strength.numerator_unit` | string | 2210 | "IU" · "mg" |
| `ingredients[].strength.numerator_value` | number | 2208 | 5 · 4 |
| `ingredients[].strength.original_text` | string | 10604 | "30mcg (6miu)" · "40 mg" |
| `ingredients[].strength.unit` | string | 9056 | "mcg" · "mg" |
| `ingredients[].strength.value` | number | 9031 | 30 · 40 |
| `ingredients[].strength.value_upper` | number | 1 | 10 |
| `ingredients[].therapeutic_class_ar` | string | 9169 | "مسكن للأذن" · "معدل للمناعة لعلاج التصلب المتعدد" |
| `ingredients[].therapeutic_class_en` | string | 9806 | "Otological analgesic" · "Immunomodulator for multiple sclerosis" |
| `international_package_inserts` | array | 2448 |  |
| `international_package_inserts[].authorization_number` | string | 1928 | "PL 10590/0015" · "PA0540/080/001" |
| `international_package_inserts[].country` | string | 2437 | "GB" · "FR" |
| `international_package_inserts[].differences_from_egyptian_product` | array | 2446 |  |
| `international_package_inserts[].document_id` | string | 2448 | "IPI-71eaadfa5c282e7f" · "IPI-0940162d1b45a512" |
| `international_package_inserts[].document_title` | string | 2448 | "Summary of Product Characteristics: Oxytocin 5 IU/ml concentrate for … · "Summary of Product Characteristics: Differin 0.1% w/w Gel (MHRA, eMC)… |
| `international_package_inserts[].document_type` | string | 2444 | "SMPC" · "PIL" |
| `international_package_inserts[].dosage_form` | string | 2445 | "concentrate for solution for infusion" · "Topical gel" |
| `international_package_inserts[].marketing_authorization_holder` | string | 2314 | "Panpharma UK Ltd" · "Galderma (U.K.) Limited" |
| `international_package_inserts[].match_type` | string | 2440 | "SAME_FORMULATION" · "INGREDIENT_LEVEL" |
| `international_package_inserts[].product_name` | string | 2448 | "Oxytocin 5 IU/ml Concentrate for Solution for Infusion" · "Differin 0.1% w/w Gel" |
| `international_package_inserts[].regulator` | string | 2364 | "MHRA" · "ANSM (Agence nationale de securite du medicament et des produits de s… |
| `international_package_inserts[].revision_date` | string | 1998 | "2025-04-02" · "2022-10-04" |
| `international_package_inserts[].revision_date_precision` | string | 1998 | "DAY" · "MONTH" |
| `international_package_inserts[].sections` | object | 943 |  |
| `international_package_inserts[].sections.composition` | object | 943 |  |
| `international_package_inserts[].sections.composition.ar` | string | 355 | "المتفطرة البقرية بي سي جي الحية المضعفة السلالة الدنماركية 1331؛ جرعة… · "فيوسيدات الصوديوم 20 مجم/جم؛ سواغات ذات تأثير معروف: بوتيل هيدروكسي ت… |
| `international_package_inserts[].sections.composition.en` | string | 492 | "Live attenuated M. bovis BCG Danish strain 1331; 0.1 mL dose (age 12 … · "Sodium fusidate 20 mg/g; excipients with known effect: butylhydroxyto… |
| `international_package_inserts[].sections.contraindications` | object | 943 |  |
| `international_package_inserts[].sections.contraindications.ar` | string | 410 | "تثبيط المناعة، الأورام الخبيثة، نقص المناعة، عدوى نقص المناعة البشرية… · "النساء الحوامل أو المشتبه في حملهن. تاريخ من فرط الحساسية لأي من مكون… |
| `international_package_inserts[].sections.contraindications.en` | string | 691 | "Immunosuppression, malignancy, immunodeficiency, HIV infection, anti-… · "Women known or suspected to be pregnant. History of hypersensitivity … |
| `international_package_inserts[].sections.dosage` | object | 943 |  |
| `international_package_inserts[].sections.dosage.ar` | string | 498 | "0.1 مل (البالغون والأطفال من 12 شهرًا) أو 0.05 مل (الرضع أقل من 12 شه… · "البالغون والأطفال: الآفات غير المغطاة - يُوضع برفق ثلاث أو أربع مرات … |
| `international_package_inserts[].sections.dosage.en` | string | 754 | "0.1 mL (adults and children 12 months and over) or 0.05 mL (infants u… · "Adults and children: uncovered lesions - apply gently three or four t… |
| `international_package_inserts[].sections.indications` | object | 943 |  |
| `international_package_inserts[].sections.indications.ar` | string | 558 | "التحصين الفعال ضد الدرن وفق التوصيات الوطنية." · "عدوى الجلد الأولية والثانوية التي تسببها السلالات الحساسة من المكورات… |
| `international_package_inserts[].sections.indications.en` | string | 864 | "Active immunisation against tuberculosis according to national recomm… · "Primary and secondary skin infections caused by sensitive strains of … |
| `international_package_inserts[].sections.interactions` | object | 943 |  |
| `international_package_inserts[].sections.interactions.ar` | string | 222 | "يمكن إعطاؤه مع لقاحات أخرى في ذراع مختلفة؛ وفاصل 4 أسابيع بين اللقاحا… · "لا توجد دراسات تداخل؛ وتعتبر التداخلات مع الأدوية الجهازية ضئيلة." |
| `international_package_inserts[].sections.interactions.en` | string | 335 | "Can be co-administered with other vaccines in a different arm; 4-week… · "No interaction studies; interactions with systemic medicines consider… |
| `international_package_inserts[].sections.pregnancy` | object | 943 |  |
| `international_package_inserts[].sections.pregnancy.ar` | string | 341 | "لا يوصى به أثناء الحمل أو الرضاعة إلا إذا فاقت الفائدة الخطر في المنا… · "يمكن استخدامه أثناء الحمل والرضاعة (تعرض جهازي ضئيل)؛ يُتجنب وضعه على… |
| `international_package_inserts[].sections.pregnancy.en` | string | 565 | "Not recommended in pregnancy or lactation unless benefit outweighs ri… · "Can be used in pregnancy and breast-feeding (negligible systemic expo… |
| `international_package_inserts[].sections.side_effects` | object | 943 |  |
| `international_package_inserts[].sections.side_effects.ar` | string | 234 | "آفة موضعية وندبة متوقعة؛ غير شائع تضخم العقد >1 سم وتقرح؛ نادر التهاب… · "الأكثر تكرارًا في الدراسات السريرية اليابانية: ارتفاع حمض اليوريك في … |
| `international_package_inserts[].sections.side_effects.en` | string | 345 | "Local lesion and scar expected; uncommon lymphadenopathy >1 cm, ulcer… · "Most frequent in Japanese clinical studies: blood uric acid increased… |
| `international_package_inserts[].sections.storage` | object | 943 |  |
| `international_package_inserts[].sections.storage.ar` | string | 185 | "يحفظ عند 2-8 درجات مئوية دون تجميد وبعيدًا عن الضوء؛ ويستخدم خلال 4 س… · "يُحفظ في الثلاجة (2-8 درجات مئوية)؛ وتُحفظ الأمبولات في العلبة الخارج… |
| `international_package_inserts[].sections.storage.en` | string | 276 | "Store at 2-8 C, do not freeze, protect from light; use within 4 hours… · "Store at 2-8 °C; do not freeze; protect from light." |
| `international_package_inserts[].sections.warnings` | object | 943 |  |
| `international_package_inserts[].sections.warnings.ar` | string | 269 | "إيجابيو التيوبركلين لا يحتاجون التطعيم؛ الحقن العميق يزيد خطر القرحة … · "وفاة جنينية مبكرة وتشوهات في الحيوانات: لا يُعطى للنساء الحوامل أو ال… |
| `international_package_inserts[].sections.warnings.en` | string | 412 | "Tuberculin-positive persons do not need vaccination; too-deep injecti… · "Warning (boxed in the Japanese label): early embryonic death and tera… |
| `international_package_inserts[].source_ids` | array | 2448 |  |
| `international_package_inserts[].strength` | string | 2444 | "5 IU/ml" · "0.1% w/w (1 mg/g)" |
| `international_package_inserts[].url` | string | 2448 | "https://www.medicines.org.uk/emc/product/9457/smpc" · "https://www.medicines.org.uk/emc/product/921/smpc" |
| `localized_content` | object | 16500 |  |
| `localized_content.description_ar` | string | 12444 | "نقط للأذن تحتوي على فينازون وكلوروبيوتانول، عبوة 10 مل." · "إنترفيرون بيتا-1أ 30 ميكروجرام (6 ملايين وحدة دولية) محلول للحقن العض… |
| `localized_content.description_en` | string | 14136 | "Ear drops containing phenazone and chlorobutanol, 10 ml bottle." · "Iron food supplement tablets with ferrous fumarate, lactoferrin, vita… |
| `localized_content.dosage_ar` | string | 3463 | "حسب النشرة الأمريكية: 30 ميكروجرام بالحقن العضلي مرة أسبوعياً؛ ويمكن … · "وفق النشرة الأمريكية لكبسولات ستراتيرا (تركيز 40 مجم): أقل من 70 كجم … |
| `localized_content.dosage_en` | string | 3852 | "US Avonex label: 30 micrograms intramuscularly once a week; may be ti… · "Per the US STRATTERA capsules label (40 mg strength): under 70 kg sta… |
| `localized_content.indications_ar` | string | 3795 | "حسب النشرة الأمريكية لأفونكس (نفس الاسم والجرعة): الأشكال الانتكاسية … · "اضطراب فرط الحركة وتشتت الانتباه لدى البالغين والأطفال من عمر 6 سنوات… |
| `localized_content.indications_en` | string | 4248 | "US Avonex label (same brand and dose): relapsing forms of multiple sc… · "Attention-deficit/hyperactivity disorder (ADHD) in adults and childre… |
| `old_price` | number | 7809 | 9.5 · 130.0 |
| `price_updated_date` | string | 13654 | "2024-12-25" · "2026-09-10" |
| `pricing_details` | object | 16500 |  |
| `pricing_details.currency` | string | 16500 | "EGP" |
| `pricing_details.current_price_source` | string | 15808 | "S1" |
| `pricing_details.previous_price_source` | string | 7669 | "S1" |
| `pricing_details.price_effective_date` | string | 13549 | "2024-12-25" · "2026-09-10" |
| `pricing_details.price_history` | array | 12626 |  |
| `pricing_details.price_history[].effective_date` | string | 10890 | "2024-12-25" · "2026-09-10" |
| `pricing_details.price_history[].price` | number | 12626 | 18.0 · 9.5 |
| `pricing_details.price_history[].source_ids` | array | 12626 |  |
| `pricing_details.price_verified_at` | string | 15714 | "2026-10-14" · "2026-10-03" |
| `product_details` | object | 16500 |  |
| `product_details.atc_codes` | array | 7456 |  |
| `product_details.country` | string | 16500 | "Egypt" |
| `product_details.dosage_form_ar` | string | 14446 | "نقط للأذن" · "محلول للحقن في محقن مسبق التعبئة" |
| `product_details.dosage_form_en` | string | 16239 | "Ear drops" · "Tablet" |
| `product_details.international_prescription_status` | array | 2938 |  |
| `product_details.international_prescription_status[].country` | string | 2938 | "US" · "GB" |
| `product_details.international_prescription_status[].source_ids` | array | 2938 |  |
| `product_details.international_prescription_status[].status` | string | 2938 | "Prescription only (Rx)" · "Prescription only (DailyMed SPL document type: Human Prescription Dru… |
| `product_details.manufacturer` | string | 13906 | "Pharco" · "Egyptian Co. for Cosmetics (E.C.C.) > Orchidia Pharmaceutical Industr… |
| `product_details.marketing_authorization_holder` | string | 3390 | "Sky Pharma" · "Multi-apex" |
| `product_details.packaging` | string | 16134 | "10 ml bottle" · "30 tablets (3 strips)" |
| `product_details.prescription_status` | string | 5754 | "NOT_APPLICABLE" · "OTC" |
| `product_details.registration_number` | string | 13 | "28006" · "3691/2022" |
| `product_details.route` | string | 16144 | "Otic" · "Oral" |
| `product_details.strength` | string | 9635 | "30 micrograms (6 million IU) per prefilled syringe" · "SPF 50+" |
| `same_ingredient_drugs` | array | 908 |  |
| `same_ingredient_drugs[].active_ingredients` | array | 904 |  |
| `same_ingredient_drugs[].arabic_name` | string | 788 | "اتومافوتكس 10مجم 30 كبسولة" · "اتوما فيوتكس 4مجم/مل شراب 100 مل" |
| `same_ingredient_drugs[].company` | string | 853 | "Future Pharmaceutical Industries (FPI)" · "Medizen for Pharmaceutical Industries > Alwady Pharmaceutical Co. (AL… |
| `same_ingredient_drugs[].current_price` | number | 854 | 108.0 · 119.0 |
| `same_ingredient_drugs[].dosage_form` | string | 896 | "Syrup (oral solution)" · "Capsules" |
| `same_ingredient_drugs[].match_type` | string | 908 | "EXACT_FORMULATION_MATCH" · "SAME_INGREDIENTS_DIFFERENT_STRENGTH" |
| `same_ingredient_drugs[].package_size` | string | 862 | "30 capsules" · "10 capsules" |
| `same_ingredient_drugs[].source_ids` | array | 908 |  |
| `same_ingredient_drugs[].strength` | string | 858 | "10 mg" · "18 mg" |
| `same_ingredient_drugs[].trade_name` | string | 908 | "strattera 40mg 28 caps" · "atomorelax 20mg/5ml syrup 100 ml" |
| `scientific_name` | string | 14058 | "Phenazone + Chlorobutanol" · "Interferon beta-1a" |
| `scientific_references` | array | 5606 |  |
| `scientific_references[].drugbank` | object | 5606 |  |
| `scientific_references[].drugbank.data_access_status` | string | 3993 | "ID_FROM_WIKIPEDIA_INFOBOX; DrugBank content not accessed (licensing)" · "ID_ONLY" |
| `scientific_references[].drugbank.description_ar` | string | 36 | "مثبط لإنزيمات البيتالاكتاماز." · "أمينوبنسلين واسع الطيف." |
| `scientific_references[].drugbank.description_en` | string | 49 | "Beta-lactamase inhibitor." · "Broad-spectrum aminopenicillin." |
| `scientific_references[].drugbank.id` | string | 2703 | "DB00060" · "DB09536" |
| `scientific_references[].drugbank.mechanism_ar` | string | 83 | "مثبط DPP-4 يطيل نشاط الإنكرتين." · "يقلل إنتاج الكبد للجلوكوز ويقلل امتصاصه المعوي ويحسن حساسية الإنسولين… |
| `scientific_references[].drugbank.mechanism_en` | string | 102 | "DPP-4 inhibitor prolonging incretin activity." · "Decreases hepatic glucose production, decreases intestinal glucose ab… |
| `scientific_references[].drugbank.url` | string | 2463 | "https://go.drugbank.com/drugs/DB00060" · "https://go.drugbank.com/drugs/DB00289" |
| `scientific_references[].ingredient_name` | string | 5606 | "Interferon beta-1a" · "Titanium dioxide" |
| `scientific_references[].pubchem` | object | 5606 |  |
| `scientific_references[].pubchem.cid` | number | 5150 | 26042 · 54841 |
| `scientific_references[].pubchem.url` | string | 5150 | "https://pubchem.ncbi.nlm.nih.gov/compound/26042" · "https://pubchem.ncbi.nlm.nih.gov/compound/54841" |
| `scientific_references[].source_ids` | array | 5565 |  |
| `scientific_references[].wikipedia` | object | 5606 |  |
| `scientific_references[].wikipedia.summary_ar` | string | 470 | "مرشح معدني للأشعة فوق البنفسجية يُستخدم في واقيات الشمس." · "الأتوموكسيتين (الاسم التجاري ستراتيرا) مثبط انتقائي لإعادة امتصاص الن… |
| `scientific_references[].wikipedia.summary_en` | string | 519 | "Mineral UV filter used in sunscreens." · "Atomoxetine (brand Strattera) is a selective norepinephrine reuptake … |
| `scientific_references[].wikipedia.url_ar` | string | 1952 | "https://ar.wikipedia.org/wiki/%D8%A3%D8%AA%D9%88%D9%85%D9%88%D9%83%D8… · "https://ar.wikipedia.org/wiki/%D8%B9%D8%B5%D9%8A%D8%A9_%D9%83%D8%A7%D… |
| `scientific_references[].wikipedia.url_en` | string | 2807 | "https://en.wikipedia.org/wiki/Interferon_beta-1a" · "https://en.wikipedia.org/wiki/Titanium_dioxide" |
| `scientific_references[].wikipedia.wikidata_id` | string | 2874 | "Q193521" · "Q417240" |
| `search_count` | number | 16500 | 0 |
| `sources` | array | 16404 |  |
| `sources[].accessed_date` | string | 16404 | "2026-10-14" · "2026-10-03" |
| `sources[].country` | string | 16394 | "INTL" · "EG" |
| `sources[].document_title` | string | 16404 | "WHO ATC/DDD Index entry S02DA03 phenazone" · "PubChem Compound CID 2206 (phenazone)" |
| `sources[].document_type` | string | 16284 | "DATABASE_ENTRY" · "USPI" |
| `sources[].market` | string | 16401 | "International" · "United States" |
| `sources[].publication_date` | string | 10126 | "2025-11-28" · "2025-03-09" |
| `sources[].publication_date_precision` | string | 10126 | "DAY" |
| `sources[].source_id` | string | 16404 | "S2" · "S1" |
| `sources[].source_name` | string | 16404 | "Dawa Prices (dwaprices.com)" · "PubChem" |
| `sources[].source_type` | string | 16404 | "REFERENCE_DATABASE" · "PRICE_DIRECTORY" |
| `sources[].url` | string | 16382 | "https://dwaprices.com/med.php?id=9454" · "https://atcddd.fhi.no/atc_ddd_index/?code=S02DA03&showdescription=no" |
| `sources[].verification_status` | string | 16404 | "VERIFIED" · "PARTIALLY_VERIFIED" |
| `tags` | array | 15114 |  |
| `tags[].classification_code` | string | 7006 | "S02DA03" · "L03AB07" |
| `tags[].name_ar` | string | 13454 | "مستحضرات الأذن - مسكنات ومخدرات (فينازون)" · "مسكن ومطهر للأذن" |
| `tags[].name_en` | string | 15114 | "Otologicals - analgesics and anesthetics (phenazone)" · "Otic analgesic and antiseptic" |
| `tags[].source_ids` | array | 15114 |  |
| `tags[].type` | string | 15114 | "THERAPEUTIC" · "PHARMACOLOGICAL" |
| `trade_name` | string | 16326 | "Otocalm" · "Re iro 30 tablets" |
| `unit_price` | number | 9472 | 4.97 · 3718.75 |
| `units_per_package` | number | 9731 | 30 · 4 |
| `updated_at` |  | 0 |  |
| `visit_count` | number | 16500 | 0 |
