-- category "head" = text before the first ( - — – / ; Arabic label = most common tag name_ar whose name_en equals the head
with d as (
  select id, lower(btrim(regexp_replace(category, '\s*(\(|-|—|–|/|,).*$', ''))) head, payload->'tags' tags
  from public.drugs where deleted_at is null and category is not null
), heads as (select head, count(*) n from d group by head),
lab as (
  select d.head, t->>'name_ar' name_ar, count(*) c
  from d cross join lateral jsonb_array_elements(d.tags) t
  where lower(btrim(t->>'name_en')) = d.head and nullif(btrim(t->>'name_ar'), '') is not null
  group by 1, 2
), best as (select distinct on (head) head, name_ar from lab order by head, c desc, name_ar)
select count(*) heads, count(*) filter (where n >= 5) heads_ge5,
       count(b.name_ar) heads_with_ar, count(b.name_ar) filter (where n >= 5) heads_ge5_with_ar,
       sum(n) filter (where b.name_ar is not null) drugs_covered_by_ar_label, sum(n) drugs_total
from heads h left join best b using (head);
