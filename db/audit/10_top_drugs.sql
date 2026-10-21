-- top 50 by visit_count (search_count is 0 for every row, so that ranking is empty)
select row_number() over (order by visit_count desc, trade_name) as rank, trade_name, arabic_name, current_price, visit_count, search_count
from public.drugs where deleted_at is null and visit_count > 0
order by visit_count desc, trade_name limit 50;
