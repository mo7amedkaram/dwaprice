with d as (select * from public.drugs where deleted_at is null)
select 'category (distinct)' k, count(distinct category)::text v from d
union all select 'category with >=5 drugs', count(*)::text from (select category from d group by 1 having count(*)>=5) x
union all select 'company (distinct raw)', count(distinct company)::text from d
union all select 'company containing " > "', count(*) filter (where company like '% > %')::text from d
union all select 'company first part (distinct)', count(distinct btrim(split_part(company,' > ',1)))::text from d
union all select 'company last part (distinct)', count(distinct btrim(reverse(split_part(reverse(company),' > ',1))))::text from d
union all select 'ingredient name_norm (distinct)', count(distinct name_norm)::text from public.drug_ingredients
union all select 'ingredient with >=2 drugs', count(*)::text from (select name_norm from public.drug_ingredients group by 1 having count(distinct drug_id)>=2) x
union all select 'ingredient pubchem_cid (distinct)', count(distinct pubchem_cid)::text from public.drug_ingredients
union all select 'ingredient name_norm per pubchem_cid >1', count(*)::text from (select pubchem_cid from public.drug_ingredients where pubchem_cid is not null group by 1 having count(distinct name_norm)>1) x
union all select 'atc code (distinct, level5)', count(distinct c)::text from d, unnest(atc_codes) c
union all select 'atc level3 (distinct)', count(distinct left(c,4))::text from d, unnest(atc_codes) c
union all select 'atc level4 (distinct)', count(distinct left(c,5))::text from d, unnest(atc_codes) c
union all select 'atc malformed', count(*)::text from d, unnest(atc_codes) c where c !~ '^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$'
union all select 'tag THERAPEUTIC name_en (distinct)', count(distinct t->>'name_en')::text from d, jsonb_array_elements(d.payload->'tags') t where t->>'type'='THERAPEUTIC'
union all select 'tag PHARMACOLOGICAL name_en (distinct)', count(distinct t->>'name_en')::text from d, jsonb_array_elements(d.payload->'tags') t where t->>'type'='PHARMACOLOGICAL'
union all select 'tag types', string_agg(distinct t->>'type', ',') from d, jsonb_array_elements(d.payload->'tags') t
union all select 'dosage_form_en (distinct)', count(distinct dosage_form_en)::text from d
union all select 'route (distinct)', count(distinct route)::text from d;
