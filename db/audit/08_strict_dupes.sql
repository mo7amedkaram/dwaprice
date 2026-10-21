-- stricter duplicate key: the normalized price-list line (original_sheet_name carries name+strength+pack)
with k as (
  select id, current_price, research_status, public.medicine_search_normalize(original_sheet_name) sk,
         public.medicine_search_normalize(coalesce(trade_name, original_sheet_name)) tk
  from public.drugs where deleted_at is null
), g as (select sk, count(*) n, count(distinct current_price) prices from k group by sk)
select (select count(*) from k) drugs,
       (select count(*) from g) distinct_sheet_lines,
       (select count(*) from g where n > 1) sheet_dupe_groups,
       (select sum(n - 1) from g where n > 1) sheet_dupe_extra_rows,
       (select count(*) from g where n > 1 and prices > 1) sheet_dupe_groups_with_conflicting_price,
       (select count(distinct tk) from k) distinct_trade_names,
       (select count(*) from (select tk from k group by tk having count(*) > 1) x) trade_name_groups_gt1;
