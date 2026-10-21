select now() as snapshot_at, (select max(batch_number) from public.dataset_batches) as last_batch,
       (select count(*) from public.dataset_batches) as batches_recorded,
       (select count(*) from public.drugs where deleted_at is null) as live_drugs,
       pg_size_pretty(pg_database_size(current_database())) as db_size;
