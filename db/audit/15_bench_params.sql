-- sample entities for the EXPLAIN ANALYZE suite: popular / large ones (worst cases)
select json_build_object(
  'drug_popular', (select s.slug from public.drugs d join web.drug_products dp on dp.drug_id = d.id join web.slugs s on s.entity_type='drug' and s.entity_key = dp.product_key and s.is_current where d.deleted_at is null order by d.visit_count desc limit 1),
  'drug_most_alts', (select c.slug from web.drug_cards c join (select set_key, count(*) n from web.products where is_live and set_key is not null group by 1 order by 2 desc limit 1) b using (set_key) limit 1),
  'drug_with_history', (select c.slug from web.drug_cards c join public.drugs d on d.id = c.drug_id where jsonb_array_length(coalesce(d.payload#>'{pricing_details,price_history}','[]')) >= 3 limit 1),
  'ingredient_big', (select s.slug from web.slugs s join web.products p on p.ingredient_keys @> array[s.entity_key] and p.is_live where s.entity_type='ingredient' and s.is_current group by s.slug order by count(*) desc limit 1),
  'company_big', (select s.slug from web.slugs s join web.products p on p.company_keys @> array[s.entity_key] and p.is_live where s.entity_type='company' and s.is_current group by s.slug order by count(*) desc limit 1),
  'category_big', (select s.slug from web.slugs s join web.products p on p.category_key = s.entity_key and p.is_live where s.entity_type='category' and s.is_current group by s.slug order by count(*) desc limit 1),
  'atc_l2_big', (select s.slug from web.slugs s join web.products p on p.atc_prefixes @> array[s.entity_key] and p.is_live where s.entity_type='atc' and s.is_current and length(s.entity_key)=3 group by s.slug order by count(*) desc limit 1),
  'atc_l5', (select s.slug from web.slugs s join web.products p on p.atc_prefixes @> array[s.entity_key] and p.is_live where s.entity_type='atc' and s.is_current and length(s.entity_key)=7 group by s.slug order by count(*) desc limit 1)
) as params;
