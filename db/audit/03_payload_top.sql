-- top-level payload keys: presence and "has a meaningful value" (not null / "" / [] / {})
with d as (select payload from public.drugs where deleted_at is null), n as (select count(*)::numeric n from d)
select k.key, jsonb_typeof(min(v.value::text)::jsonb) as sample_type,
       count(*) as present,
       count(*) filter (where v.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb)) as with_value,
       round(100*count(*) filter (where v.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb))/max(n.n),1) as pct
from d cross join n cross join lateral jsonb_each(d.payload) v cross join lateral (select v.key) k
group by k.key order by with_value desc;
