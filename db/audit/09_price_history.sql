-- price history: price_change_events is empty, so measure the alternatives:
-- (a) payload.pricing_details.price_history[], (b) old_price -> current_price on the row
with h as (
  select d.id, (e->>'price')::numeric price, nullif(e->>'effective_date','')::date eff
  from public.drugs d cross join lateral jsonb_array_elements(coalesce(d.payload#>'{pricing_details,price_history}','[]')) e
  where d.deleted_at is null
), per as (select id, count(*) entries, count(distinct price) distinct_prices, min(eff) first_eff, max(eff) last_eff from h group by id)
select (select count(*) from public.price_change_events where kind='PRICE_CHANGED') pce_price_changed_rows,
       (select count(distinct drug_id) from public.price_change_events where kind='PRICE_CHANGED') pce_drugs,
       (select count(*) from per) drugs_with_history,
       (select count(*) from per where entries >= 2) drugs_with_2plus_entries,
       (select count(*) from per where distinct_prices >= 2) drugs_with_real_change_in_history,
       (select max(entries) from per) max_entries,
       (select min(first_eff) from per) history_min_date,
       (select max(last_eff) from per) history_max_date,
       (select count(*) from public.drugs where deleted_at is null and old_price is not null and old_price <> current_price) drugs_old_ne_current,
       (select count(*) from public.drugs where deleted_at is null and old_price < current_price) increases,
       (select count(*) from public.drugs where deleted_at is null and old_price > current_price) decreases,
       (select min(price_updated_date) from public.drugs where deleted_at is null) min_price_date,
       (select max(price_updated_date) from public.drugs where deleted_at is null) max_price_date,
       (select count(*) from public.drugs where deleted_at is null and price_updated_date > current_date) future_price_dates;
