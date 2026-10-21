-- sample: payload price history next to the row's old/current price
select d.trade_name, d.old_price, d.current_price, d.price_updated_date,
       d.payload#>'{pricing_details,price_history}' as payload_price_history
from public.drugs d
where d.deleted_at is null and jsonb_array_length(coalesce(d.payload#>'{pricing_details,price_history}', '[]')) >= 3
order by d.visit_count desc, d.record_key limit 3;
