-- Clinical statement quality and price provenance, one hash chunk (:K of :N) at a time.
-- Every row is an additive count, so chunks are summed per (metric, key).
with d as (select * from public.drugs where deleted_at is null and abs(hashtext(id::text)) % :N = :K),
st as (
  select d.id, s.key as section, e
  from d cross join lateral jsonb_each(case when jsonb_typeof(d.payload->'clinical_information') = 'object' then d.payload->'clinical_information' else '{}' end) s
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]' end) e
  union all
  select d.id, 'dosage.' || s.key, e
  from d cross join lateral jsonb_each(case when jsonb_typeof(d.payload#>'{clinical_information,dosage}') = 'object' then d.payload#>'{clinical_information,dosage}' else '{}' end) s
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]' end) e
)
select 'statements' as metric, 'total' as key, count(*) as n from st
union all select 'statements', 'requires_manual_review=true', count(*) filter (where (e->>'requires_manual_review')::boolean) from st
union all select 'statements by verification_status', coalesce(e->>'verification_status', '∅'), count(*) from st group by 2
union all select 'statements by evidence_level', coalesce(e->>'evidence_level', '∅'), count(*) from st group by 2
union all select 'drugs with >=1 section statement', section, count(distinct id) from st group by 2
union all select 'drugs', 'data_quality.requires_pharmacist_review=true', count(*) filter (where (payload#>>'{data_quality,requires_pharmacist_review}')::boolean) from d
union all select 'drugs', 'cite dwaprices.com in sources', count(*) filter (where payload->'sources' @? '$[*] ? (@.url like_regex "dwaprices\.com")') from d
union all select 'drugs', 'current price source is dwaprices.com', count(*) filter (where exists (select 1 from jsonb_array_elements(payload->'sources') s where s->>'source_id' = payload#>>'{pricing_details,current_price_source}' and s->>'url' ~ 'dwaprices\.com')) from d
union all select 'current price source domain', coalesce(substring(s->>'url' from '://(?:www\.)?([^/]+)'), '∅'), count(*)
  from d cross join lateral jsonb_array_elements(d.payload->'sources') s
  where s->>'source_id' = d.payload#>>'{pricing_details,current_price_source}' group by 2;
