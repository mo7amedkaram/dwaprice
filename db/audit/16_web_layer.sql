-- pages the web layer produces (after web.sync)
select 'drug products (live)' as page_type, count(*) as total, count(*) filter (where indexable) as indexable from web.drug_cards
union all select 'drug: noindex ' || noindex_reason, count(*), 0 from web.drug_cards where not indexable group by noindex_reason
union all select 'drug alternatives pages (>=1 alternative)', count(*), count(*) filter (where indexable)
  from web.drug_cards c where c.set_key is not null and exists (select 1 from web.products p where p.set_key = c.set_key and p.is_live and p.product_key <> c.product_key)
union all select 'drug with SAME_STRENGTH alternative', count(*), count(*) filter (where indexable)
  from web.drug_cards c where c.exact_key is not null and exists (select 1 from web.products p where p.exact_key = c.exact_key and p.is_live and p.product_key <> c.product_key)
union all select 'drug pages with uses/indications', count(*), count(*) filter (where c.indexable)
  from web.drug_cards c join public.drugs d on d.id = c.drug_id where jsonb_array_length(coalesce(d.payload#>'{clinical_information,uses}','[]')) > 0
union all select 'ingredient hubs', count(*), count(*) filter (where indexable) from web.ingredients
union all select 'company hubs', count(*), count(*) filter (where indexable) from web.companies
union all select 'category hubs', count(*), count(*) filter (where indexable) from web.categories
union all select 'atc hubs (all levels)', count(*), count(*) filter (where indexable) from web.atc_classes
union all select 'atc hubs with a label', count(*) filter (where name_en is not null), count(*) filter (where indexable) from web.atc_classes
union all select 'latest price changes rows', count(*), count(*) filter (where is_increase) from web.latest_price_changes
union all select 'products folding >1 source row', count(*), sum(cardinality(drug_ids) - 1) from web.products where is_live and cardinality(drug_ids) > 1;
