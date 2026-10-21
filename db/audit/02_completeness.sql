-- % non-null (and non-blank for text, non-empty for arrays) on live drugs
with d as (select * from public.drugs where deleted_at is null), t as (select count(*)::numeric n from d)
select f.field, f.filled, round(100*f.filled/t.n,1) as pct
from t, lateral (values
 ('trade_name',            (select count(*) from d where nullif(btrim(trade_name),'') is not null)),
 ('arabic_name',           (select count(*) from d where nullif(btrim(arabic_name),'') is not null)),
 ('original_sheet_name',   (select count(*) from d where nullif(btrim(original_sheet_name),'') is not null)),
 ('scientific_name',       (select count(*) from d where nullif(btrim(scientific_name),'') is not null)),
 ('company',               (select count(*) from d where nullif(btrim(company),'') is not null)),
 ('strength',              (select count(*) from d where nullif(btrim(strength),'') is not null)),
 ('dosage_form_en',        (select count(*) from d where nullif(btrim(dosage_form_en),'') is not null)),
 ('dosage_form_ar',        (select count(*) from d where nullif(btrim(dosage_form_ar),'') is not null)),
 ('route',                 (select count(*) from d where nullif(btrim(route),'') is not null)),
 ('current_price',         (select count(*) from d where current_price is not null)),
 ('current_price > 0',     (select count(*) from d where current_price > 0)),
 ('old_price',             (select count(*) from d where old_price is not null)),
 ('old_price <> current',  (select count(*) from d where old_price is not null and old_price <> current_price)),
 ('unit_price',            (select count(*) from d where unit_price is not null)),
 ('units_per_package',     (select count(*) from d where units_per_package is not null)),
 ('price_updated_date',    (select count(*) from d where price_updated_date is not null)),
 ('category',              (select count(*) from d where nullif(btrim(category),'') is not null)),
 ('description',           (select count(*) from d where nullif(btrim(description),'') is not null)),
 ('image_url',             (select count(*) from d where nullif(btrim(image_url),'') is not null)),
 ('image_verified = true', (select count(*) from d where image_verified)),
 ('image_url AND verified',(select count(*) from d where image_verified and nullif(btrim(image_url),'') is not null)),
 ('prescription_status',   (select count(*) from d where nullif(btrim(prescription_status),'') is not null)),
 ('atc_codes (non-empty)', (select count(*) from d where cardinality(atc_codes) > 0)),
 ('ingredient_names (non-empty)', (select count(*) from d where cardinality(ingredient_names) > 0)),
 ('has drug_ingredients row', (select count(*) from d where exists (select 1 from public.drug_ingredients i where i.drug_id=d.id))),
 ('barcode',               (select count(*) from d where nullif(btrim(barcode),'') is not null)),
 ('tag_names (non-empty)', (select count(*) from d where cardinality(tag_names) > 0)),
 ('source_revision_date',  (select count(*) from d where source_revision_date is not null)),
 ('visit_count > 0',       (select count(*) from d where visit_count > 0)),
 ('search_count > 0',      (select count(*) from d where search_count > 0))
) f(field, filled)
order by f.field;
