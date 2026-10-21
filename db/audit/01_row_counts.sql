select 'drugs (deleted_at is null)' as entity, count(*) as n from public.drugs where deleted_at is null
union all select 'drugs (all)', count(*) from public.drugs
union all select 'drug_ingredients', count(*) from public.drug_ingredients
union all select 'drug_ingredients (live drugs)', count(*) from public.drug_ingredients di join public.drugs d on d.id=di.drug_id and d.deleted_at is null
union all select 'price_change_events', count(*) from public.price_change_events
union all select 'price_change_events PRICE_CHANGED', count(*) from public.price_change_events where kind='PRICE_CHANGED'
union all select 'price_change_events PRICE_VERIFIED', count(*) from public.price_change_events where kind='PRICE_VERIFIED'
union all select 'drug_search_aliases (all)', count(*) from public.drug_search_aliases
union all select 'drug_search_aliases (approved)', count(*) from public.drug_search_aliases where review_status='approved'
union all select 'approved_drug_name_aliases (all)', count(*) from public.approved_drug_name_aliases
union all select 'approved_drug_name_aliases (APPROVED)', count(*) from public.approved_drug_name_aliases where status='APPROVED'
union all select 'clinical_dosing_rules (all)', count(*) from public.clinical_dosing_rules
union all select 'clinical_dosing_rules (APPROVED)', count(*) from public.clinical_dosing_rules where status='APPROVED'
union all select 'recognition_product_index', count(*) from public.recognition_product_index
union all select 'dataset_batches', count(*) from public.dataset_batches
union all select 'egypt_drug_catalog', count(*) from public.egypt_drug_catalog;
