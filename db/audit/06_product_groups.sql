-- recognition_product_index: product_key = md5(norm(trade_name|sheet name) | norm(strength) | norm(dosage_form_en))
select count(*) as groups,
       count(*) filter (where cardinality(drug_ids) > 1) as groups_gt1,
       sum(cardinality(drug_ids)) filter (where cardinality(drug_ids) > 1) as drugs_in_gt1_groups,
       sum(cardinality(drug_ids) - 1) as non_canonical_rows,
       max(cardinality(drug_ids)) as max_group_size,
       count(distinct presentation_key) as presentation_keys,
       (select count(*) from public.drugs d where d.deleted_at is null
          and not exists (select 1 from public.recognition_product_index p where d.id = any(p.drug_ids))) as live_drugs_not_indexed,
       min(refreshed_at) as oldest_refresh, max(refreshed_at) as newest_refresh
from public.recognition_product_index;
