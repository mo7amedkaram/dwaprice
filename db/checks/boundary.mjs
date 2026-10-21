// usage: WEB_DATABASE_URL=... node boundary.mjs
// Security boundary test: logs in as web_reader through Supavisor and checks
// what the role can and cannot do. Every write attempt runs in a transaction
// that is rolled back.
import pg from 'pg';
const url = process.env.WEB_DATABASE_URL;
if (!url) throw new Error('WEB_DATABASE_URL is required (see set_web_reader_password.mjs)');
const c = new pg.Client({connectionString: url, ssl: {rejectUnauthorized: false}});
await c.connect();
const out = [];
async function t(label, sql, expectOk, wrapTx = false) {
  try {
    if (wrapTx) await c.query('begin');
    const r = await c.query(sql);
    if (wrapTx) await c.query('rollback');
    const v = r.rows?.[0] ? JSON.stringify(Object.values(r.rows[0])).slice(0, 80) : '';
    out.push([expectOk ? 'PASS' : 'FAIL', label, 'allowed ' + v]);
  } catch (e) {
    if (wrapTx) await c.query('rollback').catch(() => {});
    out.push([expectOk ? 'FAIL' : 'PASS', label, 'denied: ' + e.message.slice(0, 90)]);
  }
}
await t('session identity/settings', "select current_user, current_setting('default_transaction_read_only'), current_setting('statement_timeout'), current_setting('search_path')", true);
for (const v of ['drug_cards','drug_pages','drug_price_history','drug_alternatives','ingredients','companies','categories','atc_classes','hub_drugs','latest_price_changes','dosing_rules_public','search_index','slug_lookup',
  'popular_drugs','sitemap_drugs','drug_group_members','product_group_members','site_stats'])
  await t(`SELECT web.${v}`, `select count(*) from (select * from web.${v} limit 5) x`, true);
await t('EXECUTE web.search_normalize', "select web.search_normalize('بنادول اكسترا 24 قرص')", true);
// part 4: the site's search function (SECURITY DEFINER, fixed public columns, literal-quoted dynamic SQL)
await t('EXECUTE web.search_drugs (misspelled Arabic)', "select slug from web.search_drugs('كونجستل', 3)", true);
await t('web.search_drugs: quote/injection attempt returns rows, runs nothing', "select count(*) from web.search_drugs($$x'); drop table web.slugs; --$$, 10)", true);
await t('web.search_drugs: limit capped at 50', "select case when count(*) <= 50 then 'capped' else 'NOT CAPPED' end from web.search_drugs('ا', 100000)", true);
await t('web.search_drugs: returns public catalogue columns only', "select pg_get_function_result('web.search_drugs(text,integer,integer)'::regprocedure)", true);
await t('EXECUTE web.search_skeleton (PUBLIC, pure string function)', "select web.search_skeleton('اموكسيسيلين')", true);
await t('extensions schema (pg_trgm) not usable directly', "select extensions.similarity('a', 'b')", false);
await t('pg_stat_statements (query texts of other roles)', 'select count(*) from extensions.pg_stat_statements', false);
const denied = ['public.patient_profiles','public.prescriptions','public.prescription_items','public.prescription_scan_sessions','public.prescription_scan_images',
  'public.prescription_extracted_medications','public.prescription_model_calls','public.medicine_cabinet_items','public.medication_reminders',
  'public.medication_administration_logs','public.user_profiles','public.user_favorites','public.user_notifications','public.user_push_devices',
  'public.notification_preferences','public.price_watchlist','public.recognition_learned_names','public.recognition_reviewers','public.professional_accounts',
  'public.daily_dose_preferences','public.drugle_sessions','auth.users','auth.sessions','storage.objects','vault.decrypted_secrets',
  'public.drugs','public.drug_ingredients','public.price_change_events','public.drug_search_aliases','public.recognition_product_index',
  'public.clinical_dosing_rules','public.egypt_drug_catalog','web.slugs','web.products','web.drug_facts','web.labels','web.sync_state','pg_catalog.pg_authid'];
for (const tb of denied) await t(`SELECT ${tb}`, `select 1 from ${tb} limit 1`, false);
await t('EXECUTE web.sync()', 'select web.sync()', false, true);
await t('INSERT into web view', "insert into web.slug_lookup(entity_type) values ('x')", false, true);
await t('CREATE TABLE in web', 'create table web.x(i int)', false, true);
await t('CREATE TABLE in public', 'create table public.x(i int)', false, true);
await t('SET ROLE postgres', 'set role postgres', false, true);
await t('auth.uid() (impersonation path)', 'select auth.uid()', false, true);
await t('write via SECURITY DEFINER (read-only tx default)', "select public.increment_drug_visit('00000000-0000-0000-0000-000000000000')", false, true);
await t('write via SECURITY DEFINER after SET TRANSACTION READ WRITE', "set transaction read write; select public.increment_drug_visit('00000000-0000-0000-0000-000000000000')", false, true);
await t('pg_net http_get after SET TRANSACTION READ WRITE', "set transaction read write; select net.http_get('https://example.com')", false, true);
// pg_net tables are granted ALL to PUBLIC by supabase_admin (postgres cannot revoke):
// any SQL login can read queued requests (incl. x-worker-secret headers) and responses.
await t('pg_net request queue (PUBLIC grant)', 'select count(*) from net.http_request_queue', false);
await t('pg_net response log (PUBLIC grant)', 'select count(*) from net._http_response', false);
await t('public.drugs_changed_since (SECURITY DEFINER, ids only)', "select count(*) from public.drugs_changed_since(now() - interval '1 day', 5)", false);
await t('public.search_drugs (invoker)', "select count(*) from public.search_drugs('panadol', 5, 0)", false);
await c.end();
for (const [s, l, m] of out) console.log(s.padEnd(4), '|', l.padEnd(62), '|', m);
console.log('\nSUMMARY', out.filter(o => o[0] === 'PASS').length, 'pass /', out.length);
