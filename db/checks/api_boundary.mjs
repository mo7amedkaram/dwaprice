// usage: API_DATABASE_URL=... node api_boundary.mjs
// Security boundary of role api_app (Drug Prices API): what it can and cannot do, as a real
// login through Supavisor. Writes run inside transactions that are rolled back.
import pg from 'pg';
const url = process.env.API_DATABASE_URL;
if (!url) throw new Error('API_DATABASE_URL is required');
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const out = [];
async function t(label, sql, expectOk, wrapTx = false) {
  try {
    if (wrapTx) await c.query('begin');
    const r = await c.query(sql);
    if (wrapTx) await c.query('rollback');
    const v = r.rows?.[0] ? JSON.stringify(Object.values(r.rows[0])).slice(0, 70) : '';
    out.push([expectOk ? 'PASS' : 'FAIL', label, 'allowed ' + v]);
  } catch (e) {
    if (wrapTx) await c.query('rollback').catch(() => {});
    out.push([expectOk ? 'FAIL' : 'PASS', label, 'denied: ' + e.message.slice(0, 80)]);
  }
}
await t('session identity/settings', "select current_user, current_setting('statement_timeout'), current_setting('search_path')", true);
for (const v of ['drug_cards', 'drug_pages', 'drug_price_history', 'drug_alternatives', 'ingredients', 'companies', 'search_index', 'slug_lookup', 'product_group_members'])
  await t(`SELECT web.${v}`, `select count(*) from (select * from web.${v} limit 3) x`, true);
await t('EXECUTE web.search_drugs', "select count(*) from web.search_drugs('panadol', 3)", true);
for (const tb of ['drug_state', 'events', 'dataset_versions', 'sample_drugs', 'plans', 'clients', 'api_keys', 'usage_daily', 'request_log', 'rate_buckets', 'canaries', 'exports', 'webhooks'])
  await t(`SELECT api.${tb}`, `select count(*) from api.${tb}`, true);
await t('INSERT api.request_log (rolled back)', "insert into api.request_log (method, path, status) values ('GET', '/x', 200) returning id", true, true);
await t('INSERT api.rate_buckets (rolled back)', "insert into api.rate_buckets (scope, window_start, count) values ('t', now(), 1) returning count", true, true);
await t('UPDATE api.plans (admin page; rolled back)', "update api.plans set updated_at = now() where id = 'starter' returning id", true, true);
await t('EXECUTE api.diff_events (pure)', "select count(*) from api.diff_events(31, 'listed', '{\"price\":{\"current\":50},\"status\":\"listed\"}'::jsonb)", true);
// must be denied
await t('UPDATE api.drug_state', "update api.drug_state set price = 0 where id = 'congestal-20-tabs'", false, true);
await t('INSERT api.events', "insert into api.events (type, drug_id) values ('added', 'x')", false, true);
await t('DELETE api.sample_drugs', 'delete from api.sample_drugs', false, true);
await t('INSERT api.plans (admin page, 0045; rolled back)', "insert into api.plans (id, name, name_ar, rpm) values ('x', 'x', 'x', 1) returning id", true, true);
await t('EXECUTE api.capture()', "select api.capture('incremental', 1)", false, true);
await t('EXECUTE api.build_records()', "select count(*) from api.build_records(array['congestal-20-tabs'])", false);
await t('EXECUTE api.retention()', 'select api.retention()', false, true);
await t('EXECUTE web.sync()', 'select web.sync()', false, true);
for (const tb of ['public.drugs', 'public.drug_search_aliases', 'public.patient_profiles', 'public.prescriptions', 'public.prescription_items', 'public.medication_reminders',
  'public.medication_administration_logs', 'public.medicine_cabinet_items', 'public.user_profiles', 'public.user_favorites', 'public.recognition_learned_names',
  'public.price_change_events', 'web.slugs', 'web.products', 'web.labels', 'auth.users', 'storage.objects', 'vault.decrypted_secrets', 'extensions.pg_stat_statements'])
  await t(`SELECT ${tb}`, `select 1 from ${tb} limit 1`, false);
await t('CREATE TABLE in api', 'create table api.x(i int)', false, true);
await t('SET ROLE postgres', 'set role postgres', false, true);
await t('extensions schema (pg_trgm)', "select extensions.similarity('a', 'b')", false);
await t('auth.uid()', 'select auth.uid()', false, true);
await t('retention keeps monthly quota buckets (definition)', "select position('scope like ''%:q'' and window_start < date_trunc(''month'', now()) - interval ''1 month''' in pg_get_functiondef('api.retention()'::regprocedure)) > 0 as quota_rule_present", true);
// data boundary: no forbidden field inside any stored record
const forbidden = ['visit_count', 'search_count', 'image_url', 'indexable', 'noindex_reason', 'research_status', 'payload', 'drug_id', 'product_key', 'uses', 'dosage', 'side_effects', 'contraindications', 'interactions', 'pregnancy', 'sources', 'aliases', 'description_ar', 'clinical_sections'];
await t('no forbidden field in any api.drug_state.record', `select count(*) as records_with_forbidden_keys from api.drug_state where record ?| array[${forbidden.map((f) => `'${f}'`).join(',')}]`, true);
await c.end();
for (const [s, l, m] of out) console.log(s.padEnd(4), '|', l.padEnd(56), '|', m);
console.log('\nSUMMARY', out.filter((o) => o[0] === 'PASS').length, 'pass /', out.length);
