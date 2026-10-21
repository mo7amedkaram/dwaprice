-- one chunk (:K of 16) of the payload key-path walk; depth <= 4, arrays shown as key[]
with recursive walk(drug_id, path, depth, value) as (
  select d.id, e.key, 1, e.value
  from public.drugs d cross join lateral jsonb_each(d.payload) e
  where d.deleted_at is null and abs(hashtext(d.id::text)) % 16 = :K
  union all
  select w.drug_id,
         w.path || case when jsonb_typeof(w.value)='array' then '[].' else '.' end || c.key,
         w.depth + 1, c.value
  from walk w
  cross join lateral (
    select e.key, e.value from jsonb_each(case when jsonb_typeof(w.value)='object' then w.value else '{}'::jsonb end) e
    union all
    select e2.key, e2.value
    from jsonb_array_elements(case when jsonb_typeof(w.value)='array' then w.value else '[]'::jsonb end) a
    cross join lateral jsonb_each(case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end) e2
  ) c
  where w.depth < 4
)
select path,
       min(jsonb_typeof(value)) filter (where m) as type,
       count(distinct drug_id) filter (where m) as drugs_with_value,
       (array_agg(left(value::text, 110)) filter (where m and jsonb_typeof(value) not in ('object','array')))[1:2] as samples
from (select path, drug_id, value, value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb) m from walk) x
group by path;
