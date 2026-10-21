-- price_updated_date by year, and how many rows carry an old -> current change
select coalesce(extract(year from price_updated_date)::text, '∅') as year, count(*) as drugs,
       count(*) filter (where old_price is not null and old_price <> current_price) as with_change
from public.drugs where deleted_at is null group by 1 order by 1;
