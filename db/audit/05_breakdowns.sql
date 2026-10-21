select 'research_status' dim, research_status val, count(*) n from public.drugs where deleted_at is null group by 2
union all select 'price_verified', price_verified::text, count(*) from public.drugs where deleted_at is null group by 2
union all select 'manual_review_required', manual_review_required::text, count(*) from public.drugs where deleted_at is null group by 2
union all select 'image_verified', image_verified::text, count(*) from public.drugs where deleted_at is null group by 2
union all select 'prescription_status', coalesce(prescription_status,'∅'), count(*) from public.drugs where deleted_at is null group by 2
union all select 'research_status x price_verified', research_status||' / price_verified='||price_verified, count(*) from public.drugs where deleted_at is null group by 2
union all select 'research_status x has_price', research_status||' / has_price='||coalesce(current_price>0,false)::text, count(*) from public.drugs where deleted_at is null group by 2
order by 1, 3 desc;
