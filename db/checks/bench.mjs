// usage: WEB_DATABASE_URL=... node bench.mjs <label> [bench_params.json]
// EXPLAIN ANALYZE suite for every page query, run as web_reader through Supavisor.
// Each query runs 3 times; the reported time is the best of runs 2-3 (warm), server-side.
import pg from 'pg';
import {readFileSync, writeFileSync} from 'node:fs';
const url = process.env.WEB_DATABASE_URL;
if (!url) throw new Error('WEB_DATABASE_URL is required (see set_web_reader_password.mjs)');
// sample entities: output of ../audit/15_bench_params.sql saved as JSON (largest hubs = worst cases)
const P = JSON.parse(readFileSync(process.argv[3] || new URL('./bench_params.json', import.meta.url), 'utf8'));
const c = new pg.Client({connectionString: url, ssl: {rejectUnauthorized: false}});
await c.connect();
// Hub lists are read in two steps, as the site does: the hub row (needed for the
// page header anyway) gives the key, then the list is queried with the key as a
// literal so the planner can use the (category_key, sort_name) order index.
const key = async (view, col, slug) => (await c.query(`select ${col} as k from web.${view} where slug = $1`, [slug])).rows[0]?.k;
const K = {
  ingredient: await key('ingredients', 'ingredient_key', P.ingredient_big),
  company: await key('companies', 'company_key', P.company_big),
  category: await key('categories', 'category_key', P.category_big),
  atc: await key('atc_classes', 'atc_code', P.atc_l5),
};
const Q = [
  ['drug page (full, by slug)',            `select * from web.drug_pages where slug = $1`, [P.drug_popular]],
  ['drug card (by slug)',                  `select * from web.drug_cards where slug = $1`, [P.drug_popular]],
  ['slug resolution / 301 lookup',         `select * from web.slug_lookup where entity_type = 'drug' and slug = $1`, [P.drug_popular]],
  ['alternatives (largest group)',         `select * from web.drug_alternatives where slug = $1 order by match_type desc, current_price nulls last limit 60`, [P.drug_most_alts]],
  ['price history',                        `select * from web.drug_price_history where slug = $1 order by effective_date nulls first`, [P.drug_with_history]],
  ['ingredient hub summary (largest)',     `select * from web.ingredients where slug = $1`, [P.ingredient_big]],
  ['ingredient hub list page 1',           `select * from web.drug_cards where ingredient_keys @> array[$1::text] order by sort_name limit 48`, [K.ingredient]],
  ['company hub summary (largest)',        `select * from web.companies where slug = $1`, [P.company_big]],
  ['company hub list page 1',              `select * from web.drug_cards where company_keys @> array[$1::text] order by sort_name limit 48`, [K.company]],
  ['category hub summary (largest)',       `select * from web.categories where slug = $1`, [P.category_big]],
  ['category hub list page 1',             `select * from web.drug_cards where category_key = $1 order by sort_name limit 48`, [K.category]],
  ['ATC L2 summary (largest)',             `select * from web.atc_classes where slug = $1`, [P.atc_l2_big]],
  ['ATC L5 list page 1',                   `select * from web.drug_cards where atc_prefixes @> array[$1::text] order by sort_name limit 48`, [K.atc]],
  ['latest price changes (top 50)',        `select * from web.latest_price_changes order by effective_date desc nulls last limit 50`, []],
  ['latest increases (top 50)',            `select * from web.latest_price_changes where is_increase order by effective_date desc nulls last limit 50`, []],
  ['search: Arabic prefix',                `select slug, name_ar, name_en, current_price, min(case when alias_type in ('canonical_name','arabic_name') then 0 else 1 end) as r from web.search_index where normalized_alias like web.search_normalize($1) || '%' group by 1,2,3,4 order by r, name_en limit 20`, ['بنادول']],
  ['search: Latin prefix',                 `select slug, name_ar, name_en, current_price, min(case when alias_type in ('canonical_name','arabic_name') then 0 else 1 end) as r from web.search_index where normalized_alias like web.search_normalize($1) || '%' group by 1,2,3,4 order by r, name_en limit 20`, ['augmentin 1']],
  ['search: tokens (any order)',           `select slug, name_ar, name_en, current_price from web.search_index where to_tsvector('simple', normalized_alias) @@ to_tsquery('simple', 'شراب:* & كحه:*') group by 1,2,3,4 limit 20`, []],
  ['dosing rules for ingredient',          `select * from web.dosing_rules_public where ingredient_key = $1`, ['paracetamol']],
  // build-time (sitemaps / hub indexes) — not per-request page queries
  ['[build] top drugs for static generation', `select slug from web.popular_drugs where indexable order by visit_count desc, search_count desc, slug limit 200`, []],
  ['[build] sitemap: drugs with lastmod',  `select slug, lastmod, has_alternatives from web.sitemap_drugs`, []],
  ['[build] sitemap: all indexable drugs', `select slug, price_updated_date from web.drug_cards where indexable`, []],
  ['[build] all ingredient hubs',          `select slug, name_ar, product_count, indexable from web.ingredients`, []],
  ['[build] all category hubs',            `select slug, name_ar, product_count, indexable from web.categories`, []],
];
const rows = [], plans = {};
for (const [label, sql, params] of Q) {
  const times = [];
  let plan;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await c.query(`explain (analyze, buffers, format json) ${sql}`, params);
      plan = r.rows[0]['QUERY PLAN'][0];
      times.push(plan['Execution Time']);
    } catch (e) { times.push(NaN); plan = {error: e.message}; break; }
  }
  const warm = Math.min(...times.slice(1).filter(Number.isFinite));
  const text = JSON.stringify(plan);
  rows.push({label, cold_ms: +times[0]?.toFixed(1), warm_ms: Number.isFinite(warm) ? +warm.toFixed(1) : null,
             seq_scans: [...new Set([...text.matchAll(/"Node Type":"Seq Scan","[^}]*?"Relation Name":"([^"]+)"/g)].map(m => m[1]))].join(','),
             error: plan.error || ''});
  plans[label] = plan;
}
await c.end();
writeFileSync(new URL(`./bench_${process.argv[2] || 'run'}.json`, import.meta.url), JSON.stringify({at: new Date().toISOString(), params: P, rows, plans}, null, 1));
for (const r of rows) console.log(String(r.warm_ms).padStart(8), 'ms warm |', String(r.cold_ms).padStart(8), 'cold |', r.label.padEnd(38), '|', r.seq_scans, r.error);
