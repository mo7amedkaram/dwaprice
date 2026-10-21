-- what differs inside a duplicate group? (sample of the largest groups)
select p.display_name, p.strength_text, p.form_text, cardinality(p.drug_ids) n,
       array_agg(distinct d.current_price) prices, array_agg(distinct d.company) companies,
       array_agg(distinct d.research_status) statuses, array_agg(distinct d.original_sheet_name) sheet_names
from public.recognition_product_index p join public.drugs d on d.id = any(p.drug_ids)
where cardinality(p.drug_ids) > 1
group by p.product_key, p.display_name, p.strength_text, p.form_text, p.drug_ids
order by n desc, p.display_name limit 12;
