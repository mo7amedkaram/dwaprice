-- competitor / internal-research wording leaking into display fields
with d as (select * from public.drugs where deleted_at is null), re as (select '(dawa ?prices|dwaprices|dwa ?prices|per (the )?directory|egyptian (drug )?(price )?directory|دواء ?برايس)'::text r)
select 'product_details.packaging' field, count(*) filter (where payload#>>'{product_details,packaging}' ~* r) n from d, re
union all select 'description', count(*) filter (where description ~* r) from d, re
union all select 'localized_content.description_ar', count(*) filter (where payload#>>'{localized_content,description_ar}' ~* r) from d, re
union all select 'localized_content.description_en', count(*) filter (where payload#>>'{localized_content,description_en}' ~* r) from d, re
union all select 'dosage_form_en', count(*) filter (where dosage_form_en ~* r) from d, re
union all select 'strength', count(*) filter (where strength ~* r) from d, re
union all select 'clinical_information (any text)', count(*) filter (where (payload->'clinical_information')::text ~* r) from d, re
union all select 'data_quality.limitations', count(*) filter (where (payload#>'{data_quality,limitations}')::text ~* r) from d, re;
