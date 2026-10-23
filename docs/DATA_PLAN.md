# Data plan — dwaprice.com (part 1)

Based on [DATA_AUDIT.md](DATA_AUDIT.md) (snapshot 2026-10-21 10:18 UTC, 16,500 drugs, import batch 165).

## 1. Summary

* The catalogue supports every page type dwaprices.com has, plus ingredient, company and
  category hubs it lacks. At the snapshot that is **~32,900 indexable URLs**: 13,228 drug price
  pages, 8,863 alternatives pages, ~6,900 uses/dosage pages, 1,980 ingredient, 1,033 company,
  208 category and 599 ATC hubs.
* The website reads only schema `web` through a dedicated read-only role. 61 of 66 boundary
  checks deny as intended; the other 5 are `PUBLIC` grants Postgres cannot take away from a SQL
  login (§3, a decision for you).
* Every per-request page query runs in **≤ 37 ms warm** (EXPLAIN ANALYZE as `web_reader`, §7).
* The biggest risks are not technical: **88% of current prices come from dwaprices.com**, all
  clinical text is AI-researched and flagged for pharmacist review, and 91 lines are marked
  *illegal import* (§8).

## 2. What part 1 built (all additive)

Migrations live with the app's history (same database, one migration log), in
`drug_home_app/supabase/migrations/`, applied through the Management API
migrations endpoint and recorded in `supabase_migrations.schema_migrations`:

| file | what it does |
| --- | --- |
| `0030_web_public_catalog.sql` | schema `web`, role `web_reader`, helper functions, derived tables, 13 views, grants, 3 partial indexes on public tables, pg_cron job `web-sync` (every 10 min) |
| `0031_web_sync_incremental.sql` | `web.sync()` computes per-drug values once per drug version (was ~60 s per run, now ~2.5 s when nothing changed) |
| `0032_web_latest_price_changes_index.sql` | latest-price-changes view reads one row per product + partial index for increases (ordered index scan) |
| `0033_web_sync_merge_redirects.sql` | punctuation-insensitive ingredient/category keys, ingredient-merge redirects, redirect-chain collapse |
| `0034_web_listing_status.sql` | `listing_status` from price-list markers; illegal-import and cancelled lines are noindex; product keys ignore availability markers |

Nothing existing was altered or dropped. The only objects created outside schema `web`:
the role `web_reader`, the cron job `web-sync`, and these partial indexes —
`public.drugs (price_updated_date)` for changed prices and for increases,
`public.price_change_events (effective_date)`, `public.approved_drug_name_aliases (drug_id)`.

### Objects in schema `web`

| object | kind | granted to web_reader | purpose |
| --- | --- | --- | --- |
| `drug_cards` | view | ✅ | one light row per live product (canonical drug row) + `indexable`, `noindex_reason`, `listing_status` — use for every list |
| `drug_pages` | view | ✅ | full drug page: every public field + filtered clinical sections, ingredients (ordered, with ingredient slugs), approved aliases, `recognition_canonical_drug_id`, price history |
| `drug_price_history` | view | ✅ | price points: payload history (`catalog`) + `price_change_events` (`event`) |
| `drug_alternatives` | view | ✅ | same ingredient set + route; `SAME_INGREDIENTS_SAME_STRENGTH` / `SAME_INGREDIENTS_DIFFERENT_STRENGTH`, price and unit-price deltas |
| `ingredients`, `companies`, `categories`, `atc_classes` | views | ✅ | hub summaries: slug, labels, product counts, indexable counts, price range, `indexable` |
| `hub_drugs` | view | ✅ | products of one hub (`entity_type` + `hub_slug`) |
| `latest_price_changes` | view | ✅ | latest change per product, `is_increase` |
| `dosing_rules_public` | view | ✅ | `clinical_dosing_rules` with `status = 'APPROVED'` only, incl. reviewer, credentials, review date, guideline version, sources |
| `search_index` | view | ✅ | approved aliases (names, Arabic names, ingredients, company, category, barcode) → product page |
| `slug_lookup` | view | ✅ | slug → current slug (200 / 301) |
| `popular_drugs`, `sitemap_drugs` *(0035, part 2)* | views | ✅ | visit/search counters for build-time generation; indexable products with lastmod + alternatives flag |
| `search_normalize(text)` | function | ✅ execute | query normalisation identical to the index side |
| `slugs` | table | ❌ | slugs with history (never reissued) |
| `products` | table | ❌ | product = normalized price-list line; canonical row, signatures, hub keys |
| `drug_products` | table | ❌ | every drug row → product (kept for rename redirects) |
| `drug_facts` | table | ❌ | per-drug-version extraction from `payload` so lists never read the payload |
| `ingredient_keys`, `labels`, `sync_state` | tables | ❌ | ingredient identity, hub labels (`source = 'manual'` is never overwritten), last sync result |
| `sync(int)`, `slugify`, `drug_slug_base`, `product_key`, `category_head`, `company_parts`, `strength_norm` | functions | ❌ | maintenance |

## 3. Security model

* **Role** `web_reader`: `LOGIN NOINHERIT NOBYPASSRLS`, connection limit 20,
  `default_transaction_read_only = on`, `statement_timeout = 5s`,
  `idle_in_transaction_session_timeout = 15s`, `search_path = web`, member of no role.
  Password set as a SCRAM-SHA-256 verifier computed locally (plaintext never sent to
  the server or written to its logs); rotate with `db/checks/set_web_reader_password.mjs`.
* **Grants**: `USAGE` on schema `web`, `SELECT` on the web views (13 in part 1; 15 since part 2's
  `0035` added `popular_drugs` and `sitemap_drugs`), `EXECUTE` on `web.search_normalize`.
  No grant on any table, in `web` or `public`.
* **Views are owner-executed** (owned by `postgres`, not `security_invoker`): the view is the
  boundary. Never grant `web.*` to `anon`/`authenticated`, never add `web` to the Data API
  schemas, never set `security_invoker = true` on these views.
* **No private data path**: no `web` object references `patient_profiles`, `prescription_*`,
  `medication_*`, `medicine_cabinet_items`, `user_*`, `auth.*` or any `recognition_*` table
  except the public catalogue index. Views call no functions outside `pg_catalog` (a view's
  caller needs EXECUTE on every function it calls), so the role needs nothing in `public`.
* **Service-role key**: not used by anything built here; the website needs no Supabase key.
  The connection string is server-side only (never `NEXT_PUBLIC_*`).

### Boundary test (real login as web_reader through Supavisor, `db/checks/boundary.mjs`)

Result: **61 of 66 checks as intended**; the 5 others are the `PUBLIC` residuals below.

| expected | checks | result |
| --- | --- | --- |
| allowed | session identity/settings, web.drug_cards, web.drug_pages, web.drug_price_history, web.drug_alternatives, web.ingredients, web.companies, web.categories, web.atc_classes, web.hub_drugs, web.latest_price_changes, web.dosing_rules_public, web.search_index, web.slug_lookup, EXECUTE web.search_normalize | allowed |
| denied (private and internal tables) | `public.patient_profiles`, `public.prescriptions`, `public.prescription_items`, `public.prescription_scan_sessions`, `public.prescription_scan_images`, `public.prescription_extracted_medications`, `public.prescription_model_calls`, `public.medicine_cabinet_items`, `public.medication_reminders`, `public.medication_administration_logs`, `public.user_profiles`, `public.user_favorites`, `public.user_notifications`, `public.user_push_devices`, `public.notification_preferences`, `public.price_watchlist`, `public.recognition_learned_names`, `public.recognition_reviewers`, `public.professional_accounts`, `public.daily_dose_preferences`, `public.drugle_sessions`, `auth.users`, `auth.sessions`, `storage.objects`, `vault.decrypted_secrets`, `public.drugs`, `public.drug_ingredients`, `public.price_change_events`, `public.drug_search_aliases`, `public.recognition_product_index`, `public.clinical_dosing_rules`, `public.egypt_drug_catalog`, `web.slugs`, `web.products`, `web.drug_facts`, `web.labels`, `web.sync_state`, `pg_catalog.pg_authid` | permission denied |
| denied (privilege escalation / writes) | EXECUTE web.sync() → permission denied for function sync; INSERT into web view → cannot insert into view "slug_lookup"; CREATE TABLE in web → cannot execute CREATE TABLE in a read-only transaction; CREATE TABLE in public → cannot execute CREATE TABLE in a read-only transaction; SET ROLE postgres → permission denied to set role "postgres"; auth.uid() (impersonation path) → permission denied for schema auth; write via SECURITY DEFINER (read-only tx default) → cannot execute UPDATE in a read-only transaction; public.search_drugs (invoker) → permission denied for table drugs | denied |
| residual (`PUBLIC` grants) | write via SECURITY DEFINER after SET TRANSACTION READ WRITE → allowed; pg_net http_get after SET TRANSACTION READ WRITE → allowed; pg_net request queue (PUBLIC grant) → allowed ["0"]; pg_net response log (PUBLIC grant) → allowed ["360"]; public.drugs_changed_since (SECURITY DEFINER, ids only) → allowed ["5"] | see below |

### Residual risk you need to decide on

Postgres has no "deny". Two grants to `PUBLIC` that `postgres` cannot revoke (they were made
by `supabase_admin`) reach any SQL login, including `web_reader`:

1. **pg_net**: `net.http_request_queue` and `net._http_response` are `ALL` to `PUBLIC`, and
   `net.http_get/post/delete` are executable by `PUBLIC`. A session holding the web_reader
   password can read the response log and the request queue — where the app's notification
   nudge puts an `x-worker-secret` header for a few seconds every minute — and can queue
   outbound HTTP requests (after `SET TRANSACTION READ WRITE`).
2. **public functions executable by PUBLIC**: `increment_drug_visit` (counter tampering) and
   `drugs_changed_since` (public ids only).

Both need the web_reader password to leak from the website's server environment.
Options (your call; neither is applied):

* **A — PostgREST instead of a SQL login (recommended).** Make `web_reader` `NOLOGIN`, grant it to
  `authenticator`, add `web` to the Data API's exposed schemas, and let the website call
  `/rest/v1` with a server-side JWT whose `role` claim is `web_reader`. PostgREST only reaches
  objects in exposed schemas, so `net.*` and arbitrary SQL disappear; `/rpc` reaches the same
  public functions `anon` already can. Costs: a project-config change and a long-lived JWT
  signed with the project's JWT secret (legacy HS256, still active).
* **B — keep the SQL login** (built today; simplest for server-rendered pages): accept the
  residual risk, keep the password only in the hosting provider's server env, rotate it with the
  script, and ask Supabase support to revoke `PUBLIC` on the `net` objects.

## 4. URL slugs

Stored in `web.slugs (entity_type, entity_key, slug, base, is_current, redirect_entity_key,
created_at, retired_at)`, unique per `(entity_type, slug)` across current **and** retired rows,
one current slug per entity.

| entity | entity_key | slug base | example |
| --- | --- | --- | --- |
| drug (product) | normalized price-list line without availability markers | the line, transliterated; number + unit re-joined | `oplex-n-syrup-125ml`, `glucophage-1000mg-30-f-c-tab` |
| ingredient | `cid:<PubChem CID>` or `name:<loose name>` | most common English name without parentheses | `paracetamol`, `vitamin-d3` |
| company | normalized company part (manufacturer and marketer split on `>`) | most common spelling | `eva-pharma` |
| category | category head without punctuation | head text | `antibiotic`, `proton-pump-inhibitor` |
| ATC | code (levels 1–5) | lowercase code | `j01`, `j01cr02` |

Rules:

* Latin, lowercase, `[a-z0-9-]`, ≤ 80 characters cut at a word boundary; `+` → `plus`,
  `&` → `and`, `®™©` dropped, accents removed, Arabic dropped (all price-list lines are Latin).
* **Why the price-list line and not trade_name + strength + form**: `original_sheet_name`
  is filled for 100% of rows, already carries name + strength + form + **pack size**
  (`Euvax-B` has 4 vial sizes at 7.5 / 15 / 37 / 74 EGP — four pages, not one), comes from the
  source and is stable, while `trade_name` is rewritten by research and sometimes lacks the
  strength or pack.
* **Collisions** are deterministic: entities are processed in key order, the first keeps the
  base and later ones get `-2`, `-3`…
* **History**: a slug is never deleted or reissued. A renamed product (its rows move to a new
  line) retires the old slug with `redirect_entity_key` → 301 to the new product; an ingredient
  merged into another (new PubChem evidence) does the same; chains are collapsed. A manual label
  (`web.labels.source = 'manual'`) can give a hub a new slug; the old one 301s.
* Availability markers `(n/a)`, `(n/a yet)`, `(cancelled)` are not part of the key, so a product
  keeps its URL when its status changes; `(illegal import)` lines stay separate products.
* Maintained by `web.sync()` (pg_cron every 10 minutes): new products appear on the site
  within 10 minutes of an import; run `select web.sync();` to publish at once.

URL map (as built in parts 3–4; types prefix the slug, so the same slug may exist in two types):

| page | path | H1 (Arabic first) |
| --- | --- | --- |
| home | `/` | أسعار الأدوية في مصر محدثة يومياً |
| drug price | `/dawa/{slug}` | سعر {name} {strength} {year} |
| alternatives (the only "بديل" page) | `/dawa/{slug}/badael` | بدائل {name} {strength} |
| uses (only when content passes the threshold) | `/dawa/{slug}/dawaei-estemal` | دواعي استعمال {name} |
| ingredient | `/active-ingredient/{slug}` (index: `/active-ingredient`) | الأدوية التي تحتوي على {name_ar} |
| company | `/sharika/{slug}` (index: `/sharika`) | أدوية ومنتجات شركة {name_en} |
| category | `/category/{slug}` (index: `/category`) | {category name_ar}: الأدوية وأسعارها |
| ATC | `/atc/{code}-{name-slug}`, code only when unnamed (index: `/atc`) | {name_ar} ({code}) |
| drugs A–Z | `/adwiya` and `/adwiya/{letter}` ({letter} = `a`..`z` or `0-9`, by the English trade name) | أدوية تبدأ بحرف {A..Z} / أدوية يبدأ اسمها برقم |
| latest price changes | `/last-prices` (`?direction=increase` or `decrease` = noindex filter) | أحدث أسعار الأدوية في مصر |
| static | `/about`, `/guide`, `/contact`, `/disclaimer`, `/privacy`, `/terms` | — |
| search | `/search?q=` | noindex,follow |

## 5. Page types and the data behind them

> **Part 3 decisions supersede the counts below where they differ — see §11.**

| competitor page | our page | data | decision |
| --- | --- | --- | --- |
| `med.php` (drug) | `/dawa/{slug}` | `web.drug_pages` | **build** — 13,228 indexable |
| `similars.php` (alternatives) | `/dawa/{slug}/badael` | `web.drug_alternatives` | **build** — one page only when ≥ 1 alternative exists: 8,863 indexable (5,698 of them have a same-strength alternative) |
| `aorder.php` (buy + alternatives) | — | — | **do not build.** It competes with `similars.php` for "بديل X" and destabilises both. Put the order/availability intent as a section of the alternatives page; if the old URL pattern ever matters, 301 it to the alternatives page |
| `indications.php` (uses) | `/dawa/{slug}/dawaei-estemal` | `uses`, `dosage`, `side_effects`, `contraindications`, `interactions`, `pregnancy`, `warnings` | **build only above a content threshold**: uses + ≥ 2 other clinical sections → 6,943 indexable products. Below it, uses stay a section of the drug page (no thin subpage) |
| `ause.php` (category) | `/category/{slug}` | `web.categories` + `web.drug_cards` | **build** — 987 hubs, 208 indexable (Arabic label + ≥ 5 indexable products) |
| `lastprices.php` | `/last-prices` | `web.latest_price_changes` | **build** — 5,862 products with a dated change, 5,834 increases; one indexable page, increases as a filter (noindex) |
| home + search | `/`, `/search` | `web.search_index` | **build** — search results noindex |
| — (new) | `/active-ingredient/{slug}` | `web.ingredients` | **build** — 3,771 hubs, 1,980 indexable (Arabic name + ≥ 2 indexable products). Targets "بدائل {ingredient}" / "أدوية {ingredient}" |
| — (new) | `/sharika/{slug}` | `web.companies` | **build** — 3,270 hubs, 1,033 indexable (≥ 3 indexable products) |
| — (new) | `/atc/{code}-{slug}` | `web.atc_classes` | **built in part 4** — level 1 named after WHO (manual labels, 0040), level 5 by the catalogue tags; levels 2–4 unnamed → noindex. 603 indexable (14 + 589) |
| about, contact, privacy, terms, disclaimer, guide | static | `web.site_stats` (about) | **built in part 4** |

## 6. Sections per page type

Coverage is measured on `web.drug_pages` for the **13,228 indexable products**, i.e. after the
view removed statements awaiting manual review or marked `UNVERIFIED` (`17_page_sections_chunk.sql`).

**Drug price page** (`/dawa/{slug}`) — price-first; H1 `سعر {name_ar}`:

| section | source | indexable products with it |
| --- | --- | ---: |
| price card: current, old, change %, unit price, last update, listing status | `drug_cards` | 13,228 (old → current change: 5,704) |
| price history chart | `price_history` | 3,287 with ≥ 2 points |
| product facts: English name, price-list name, strength, form (ar/en), pack, company (manufacturer / marketer), Rx status, barcode | `drug_pages` | form 100% · Rx status 4,768 · barcode 5,135 |
| active ingredients (linked to ingredient hubs) + mechanism (ar) | `ingredients`, `ingredient_details` | 12,175 · mechanism 5,736 |
| short description (ar) | `description_ar` | 9,988 (2,832 flagged `description_needs_review` — hide until cleaned) |
| uses summary (first 2–3) + link to the uses page | `uses` | 8,218 |
| alternatives preview (5 cheapest) + link | `drug_alternatives` | 8,863 |
| also known as | `aliases` | 1,409 |
| sources and "last reviewed" | `sources`, `source_revision_date` | all (show labels; see §8 on dwaprices links) |
| image | `image_url` (verified only) | **35** — design must not depend on images |

**Alternatives page** (`/dawa/{slug}/badael`) — H1 `بدائل {name_ar}`: table ordered by match
type then price (same ingredients + same strength first, cheapest highlighted), unit-price
comparison, form badge (`same_form`), availability (`alt_listing_status`), plus "different strength"
group; disclaimer that equivalence is informational. 8,863 pages.

**Uses page** (`/dawa/{slug}/dawaei-estemal`) — H1 `دواعي استعمال {name_ar}`: uses 8,218 · dosage
(adult 5,689, children 3,370, kidney/liver 2,779) · side effects 5,722 · contraindications 6,941 ·
interactions 5,854 · pregnancy & breastfeeding 6,880 · warnings 8,097 · monitoring 2,811 · each
statement with its evidence note (`applicability_note`, e.g. "US label of the same brand") and
sources; US label link 5,503; international leaflets 1,953. FAQPage JSON-LD only from these real
statements. **Storage (30) and the Egyptian leaflet (36) are too rare to be sections.**

**Ingredient / company / category / ATC hubs**: header with name (ar/en), product count and price
range (`web.ingredients` …), product list (`web.drug_cards` by key, sorted by name or price,
paginated 48/page), related hubs (ingredient → categories), and for ingredients the mechanism /
class text.

**Latest prices** (`/prices`): `web.latest_price_changes` ordered by date, old → new, change %;
increase/decrease filter.

## 7. Indexing rule and page counts

A **drug product** (one normalized price-list line; duplicate rows folded, canonical row =
price verified → not UNRESOLVED → has Arabic name → newest price date → VERIFIED → record_key) is
**indexable** when, in this order of reasons:

| check | noindex reason | products |
| --- | --- | ---: |
| not an `(illegal import)` line | `ILLEGAL_IMPORT` | 91 |
| not a `(cancelled)` line | `CANCELLED` | 29 |
| research status VERIFIED or PARTIALLY_VERIFIED | `RESEARCH_UNRESOLVED` | 167 |
| price verified | `PRICE_UNVERIFIED` | 871 |
| current price > 0 | `NO_PRICE` | 0 (after the checks above) |
| Arabic name present (Arabic H1) | `NO_ARABIC_NAME` | 340 |
| **indexable** | | **13,228 of 14,726** |

Products marked `(n/a)` / `(n/a yet)` stay indexable with an availability badge: alternatives
searches peak exactly when a drug is unavailable. Non-indexable products still render
(reachable from search) with `noindex`.

| page_type | total | indexable |
| --- | --- | --- |
| drug products (live) | 14726 | 13228 |
| drug: noindex NO_ARABIC_NAME | 340 | 0 |
| drug: noindex ILLEGAL_IMPORT | 91 | 0 |
| drug: noindex PRICE_UNVERIFIED | 871 | 0 |
| drug: noindex RESEARCH_UNRESOLVED | 167 | 0 |
| drug: noindex CANCELLED | 29 | 0 |
| drug alternatives pages (>=1 alternative) | 9675 | 8863 |
| drug with SAME_STRENGTH alternative | 6204 | 5698 |
| drug pages with uses/indications | 8890 | 8218 |
| ingredient hubs | 3771 | 1980 |
| company hubs | 3270 | 1033 |
| category hubs | 987 | 208 |
| atc hubs (all levels) | 1996 | 599 |
| atc hubs with a label | 1131 | 599 |
| latest price changes rows | 5862 | 5834 |
| products folding >1 source row | 1573 | 1774 |

Hubs: ingredient = Arabic name + ≥ 2 indexable products; company = ≥ 3; category = Arabic
label + ≥ 5; ATC = Arabic label + ≥ 3. Thresholds live in the views and can be tuned.

### Query performance (EXPLAIN ANALYZE, as `web_reader` through Supavisor)

Warm = best of runs 2–3 after the import finished; cold = first run. Worst-case entities:
most visited drug, largest alternatives group, largest ingredient (vitamin C), company
(Eva Pharma), category (cosmetic, 2,907 products), ATC J01.

| query | warm ms | cold ms (1st run) | seq scans | < 50 ms |
| --- | ---: | ---: | --- | :---: |
| drug page (full, by slug) | 6.1 | 144.3 | price_change_events | ✅ |
| drug card (by slug) | 0.1 | 0.1 | — | ✅ |
| slug resolution / 301 lookup | 0.1 | 0.1 | — | ✅ |
| alternatives (largest group) | 2 | 7.1 | — | ✅ |
| price history | 0.3 | 1.9 | price_change_events | ✅ |
| ingredient hub summary (largest) | 14 | 14.1 | — | ✅ |
| ingredient hub list page 1 | 21.3 | 136.5 | — | ✅ |
| company hub summary (largest) | 4.5 | 7.4 | — | ✅ |
| company hub list page 1 | 6.3 | 13.3 | — | ✅ |
| category hub summary (largest) | 36.6 | 37.4 | — | ✅ |
| category hub list page 1 | 1 | 1.1 | — | ✅ |
| ATC L2 summary (largest) | 11.1 | 34.5 | — | ✅ |
| ATC L5 list page 1 | 2 | 2 | — | ✅ |
| latest price changes (top 50) | 0.9 | 3.3 | price_change_events | ✅ |
| latest increases (top 50) | 0.8 | 1.6 | price_change_events | ✅ |
| search: Arabic prefix | 0.3 | 7.6 | — | ✅ |
| search: Latin prefix | 0.4 | 5.5 | — | ✅ |
| search: tokens (any order) | 0.5 | 5.7 | — | ✅ |
| dosing rules for ingredient | 0 | 0.1 | — | ✅ |
| [build] top drugs for static generation | 183.1 | 427.6 | drugs | ✅ |
| [build] sitemap: drugs with lastmod | 227.5 | 225.3 | drugs | ✅ |
| [build] sitemap: all indexable drugs | 142.5 | 141.5 | drugs | ✅ |
| [build] all ingredient hubs | 415.8 | 511.8 | — | ✅ |
| [build] all category hubs | 153.7 | 185.4 | — | ✅ |

Every per-request page query is ≤ 37 ms warm. Cold first hits reach ~140–270 ms (empty buffer
cache on this small compute); with ISR a page queries the database about once a day.
Hub lists must query `web.drug_cards` with the hub key as a literal (resolve the hub row first):
through the `hub_drugs` join the planner cannot use the `(category_key, sort_name)` index
(55 ms vs 1 ms for "cosmetic"). Build-time queries (sitemaps, hub indexes) take 0.14–0.45 s.

`web.sync()`: ~2.5 s when nothing changed (idle DB), 10–60 s for a full rebuild; cron every 10 min.

## 8. Risks

1. **Price source = the competitor.** 14,489 current prices (88%) come from dwaprices.com. We
   cannot be fresher than they are, and a systematic copy of their database is a legal and
   reputational exposure (database rights / terms of use). Needed: an independent source (EDA
   price list, pharmacy partners, manufacturer lists). Do not link to dwaprices from 13k pages:
   show source *types* and dates, not their URLs.
2. **YMYL clinical content.** All 16,500 records have `requires_pharmacist_review = true`; most
   statements come from foreign labels of the same/equivalent formulation, not Egyptian leaflets.
   Publish with clear provenance per statement, a "reviewed by" field once a pharmacist reviews,
   and a medical disclaimer; never show `requires_manual_review` statements (the views already drop
   2,036 of them). Dosing calculators must wait for APPROVED `clinical_dosing_rules` (0 today).
3. **Research text leaks**: 1,612 English / 139 Arabic descriptions, 1,024 packaging texts and
   1,705 clinical texts mention "Dawa Prices" / "the directory". Views expose
   `description_needs_review` / `packaging_needs_review`; fix at the source (importer scrub) or
   with an override table before launch.
4. **Illegal-import and cancelled lines** (91 / 29 products): noindex; decide whether to show them
   at all (legal advice), and never with a buy/order call to action.
5. **Thin pages**: 2,894 indexable products have no clinical section and no alternative
   (mostly cosmetics and supplements). They still answer "price of X" but need unique copy
   (category, pack, unit price, price history) or should be noindexed if Search Console shows
   them as "crawled — not indexed".
6. **Duplicates**: handled — 1,573 products fold 1,774 duplicate rows; `recognition_product_index`
   is **not** used for indexing because it merges pack sizes with different prices and lags the
   catalogue (1,000 rows behind at the snapshot). It is still exposed as
   `recognition_canonical_drug_id`.
7. **Missing / stale prices**: 660 rows without a price; 871 products noindex for unverified
   price; 5,708 prices dated 2022 and 2,846 undated — show the date prominently and prefer
   "آخر تحديث" honesty over hiding it.
8. **English-only data**: company names (no Arabic at all), 579 of 934 category heads and most ATC levels
   lack Arabic labels → `web.labels` (source `manual`) is where to add them; hubs without Arabic
   names stay noindex.
9. **No images** (35 verified) → layouts and JSON-LD must work without them.
10. **Platform**: 2 GB disk and small compute. Heavy ad-hoc queries over the payload must be chunked;
    the importer's per-batch `refresh_recognition_product_index()` saturates CPU during imports.
    The views depend on `public.drugs` and related columns — an app migration that drops/retypes
    them must recreate the web views (documented in 0030).
11. **Credentials** exposed in this session (pasted access token; legacy JWT secret returned by the
    PostgREST-config endpoint) — revoke / plan rotation (DATA_AUDIT, platform section).
12. **Search normalisation**: Arabic digit↔letter boundaries are not split (`125مل`); the 0025
    character class is double-encoded. App-side fixes; the site uses the same function on both sides.
13. **Company field contamination**: 176 company labels contain research notes (e.g. *"Sedico (as listed
    by Dawa Prices and dw2.org)"*), 17 of them on indexable company hubs — clean at the source or
    override with `web.labels` (`source = 'manual'`) before launch.
14. **Same-strength recall**: `SAME_INGREDIENTS_SAME_STRENGTH` needs structured strengths on both
    sides; when one product only has free text (e.g. *"1.2 g (amoxicillin + clavulanic acid, total per
    vial)"*), a true same-strength alternative lands in the "different strength" group. It never shows
    a wrong same-strength match, but it under-reports them; improving `web.strength_norm` (parse the
    free text) is a later task.

## 9. Operating the layer

* `select web.sync();` — refresh now (idempotent; cron does it every 10 minutes).
  `select result from web.sync_state;` — last run, with per-step milliseconds.
* Rotate the website password: `SUPABASE_ACCESS_TOKEN=… node db/checks/set_web_reader_password.mjs <env file>`.
* Re-run the audit: `db/audit/*.sql` with `db/checks/run_sql.mjs`; the `*_chunk.sql` files with
  `run_chunked.mjs`; `payload_paths.mjs` for the key inventory.
* Re-run security and speed checks: `WEB_DATABASE_URL=… node db/checks/boundary.mjs`,
  `node db/checks/bench.mjs <label> bench_params.json`.
* Labels: insert `web.labels (entity_type, entity_key, name_en, name_ar, source = 'manual')`
  to fix a hub name (e.g. Arabic company names); sync never overwrites manual labels.

## 10. Exact SQL created or run (besides read-only audit queries)

| what | where |
| --- | --- |
| migrations applied and recorded (`supabase_migrations.schema_migrations`) | `drug_home_app/supabase/migrations/0030_web_public_catalog.sql`, `0031_web_sync_incremental.sql`, `0032_web_latest_price_changes_index.sql`, `0033_web_sync_merge_redirects.sql`, `0034_web_listing_status.sql` (part 2: `0035_web_site_support_views.sql`; part 3: `0036`, `0037`; part 4: `0038_web_search_fuzzy.sql`, `0039_web_search_function.sql`, `0040_web_listing_support.sql`, `0041_web_site_stats_single_pass.sql` — §12) |
| password | `alter role web_reader password '<SCRAM-SHA-256 verifier>'` — computed locally by `db/checks/set_web_reader_password.mjs` |
| first fill | `select web.sync(4000);` × 5 (chunked first run), then `select web.sync();` |
| one-off pre-launch rebuilds (no URL published yet) | `truncate web.slugs restart identity; truncate web.products, web.drug_products, web.ingredient_keys; delete from web.labels where source = 'auto'; select web.sync(20000);` — run twice (after 0033 and at the final snapshot) so build-order artifacts of the first chunked fill hold no slug. **Never run after launch.** |
| compile checks | each migration was first run inside a transaction ending in `raise exception` (fully rolled back) |
| audit queries | `db/audit/*.sql` (read-only) |
| security / speed checks | `db/checks/boundary.mjs`, `db/checks/bench.mjs` (writes only inside rolled-back transactions) |

## 11. Part 3 — drug templates: decisions and counts

Migrations: `0036_web_drug_templates.sql` (clinical-section facts, company/ATC links, group views) and
`0037_web_exclude_directory_statements.sql` (statements citing price directories are dropped).

| rule | detail | effect |
| --- | --- | --- |
| URLs | `/dawa/{slug}`, `/dawa/{slug}/badael`, `/dawa/{slug}/dawaei-estemal` | `/drug/*` never went live, so no redirects are needed |
| duplicates | non-canonical members of a `recognition_product_index` group (same name + strength + form, usually other pack sizes) get `rel=canonical` to the group's page **and noindex**. Canonical = the rpi canonical if indexable, else the indexable member with most visits, then slug; never a non-indexable page | 134 groups with ≥ 2 products; **122 indexable pages become noindex**; they stay live and are linked from the canonical ("عبوات أخرى") |
| dosing | **only** APPROVED `web.dosing_rules_public`, with reviewer, credentials, review date and sources | 0 approved rules exist → no dosing section on any page; the payload dosage statements of **6,361 indexable products are hidden** |
| directory-sourced statements | statements whose text cites the Egyptian price directories ("حسب أدلة الأسعار…") are dropped (≈ 9% of indications; 61% of "manufacturer claim" ones) | some drugs lose their indications section and with it their uses page |
| uses page | exists only with indications + ≥ 2 of side effects / contraindications / interactions / pregnancy / warnings (`hasUsesPage`, unit-tested; same rule in the sitemap) | **6,719** indexable products (indications after the directory filter: 7,953); otherwise the URL is a 404 |
| change badge | from `price_change_events` when an event exists, else the catalogue `old_price → current_price` | `price_change_events` has **0 rows**, so every badge today is catalogue-based |
| FAQPage | only from real Q&A | the data has no Q&A pairs → **not emitted** |
| {year} | year of `pricing_details.price_verified_at`, else the price date, else the current year | "سعر X 2026" only for prices verified in 2026 |

Known approximation: hub `indexable_count` (ingredients, companies, categories) still counts the 122 group-noindex pack variants.

### Sub-pages the payload could support (proposed, not built)

| candidate | URL | indexable products with the section | assessment |
| --- | --- | ---: | --- |
| pregnancy & breastfeeding | `/dawa/{slug}/lel-hamel` | 6,795 | strongest candidate: "{name} للحامل" is a frequent query and the statements carry sources; needs a threshold (≥ 2 statements) |
| side effects | `/dawa/{slug}/athar-janebeya` | 5,722 | overlaps the uses page; split only if Search Console shows separate demand |
| interactions | `/dawa/{slug}/tadakhol` | 5,854 | niche queries; keep inside the uses page |
| contraindications | — | 6,941 | short lists; keep inside the uses page |
| storage | — | 30 | too rare |


## 12. Part 4 — home, search and listings: decisions, migrations, counts

### Migrations (all applied and recorded; additive)

| migration | what | touches the app's tables? |
| --- | --- | --- |
| `0038_web_search_fuzzy.sql` | partial GIN trigram index on `drug_search_aliases.normalized_alias` (approved names + ingredients, 7 MB); a trigram index on `approved_drug_name_aliases` | **adds 2 indexes** to app tables (no column or data change) |
| `0039_web_search_function.sql` | `web.search_skeleton(text)` (pure, `EXECUTE` to PUBLIC), partial expression index `web.search_skeleton(normalized_alias) text_pattern_ops` on `drug_search_aliases`, `web.search_drugs(q, limit, offset)` (SECURITY DEFINER, `EXECUTE` to `web_reader` only); **drops** the 0038 index on `approved_drug_name_aliases` (website-owned, unused) | adds 1 index; drops only the website's own index |
| `0040_web_listing_support.sql` | 14 manual labels for the WHO ATC level-1 groups (`web.labels`), `web.atc_classes` no longer indexes placeholder names ("ATC B05BA03", 13 codes), `web.site_stats` | no |
| `0041_web_site_stats_single_pass.sql` | `web.site_stats` in one pass over `drug_cards` (4.5 s → 0.2 s) | no |

Importer cost: every write to `drug_search_aliases` now maintains two more partial indexes (a GIN
trigram entry and a regexp-computed btree key): microseconds per row; a full 157k-row reload
takes a few seconds longer. `web.search_skeleton` must stay executable by the importer's role
(hence PUBLIC): the index evaluates it on every insert/update. It is a pure string function.

### Security boundary after part 4 (`docs/part4/boundary.txt`)

**73 of 78 checks pass**; the 5 failures are the same `PUBLIC` grants as in §3 (pg_net tables,
`increment_drug_visit` after `SET TRANSACTION READ WRITE`, `drugs_changed_since`), still your
decision (Option A or B). `web_reader` can now execute exactly two functions besides SELECT on the
`web` views, both deliberate exceptions to "SELECT on web views only":

* `web.search_normalize(text)` (part 1): the normaliser, so the site matches the index side;
* `web.search_drugs(text, int, int)` (part 4): typo tolerance needs `pg_trgm`, which lives in
  schema `extensions`; granting `USAGE` on that schema would also expose `pg_stat_statements`
  (other roles' query texts). The function runs as its owner, reads only `web.search_index`,
  `web.drug_cards` and `drugs.visit_count`, returns 7 public catalogue columns, quotes the query
  as a literal (`format('%L')`), caps the limit at 50 and the offset at 1,000. Verified: an
  injection string returns 0 rows; `extensions.*` and `pg_stat_statements` stay denied.

(`web.search_skeleton` is PUBLIC-executable, pure, and reads nothing.)

### Search (`web.search_drugs`, `/api/search`, `/search`)

Tiers, best first: **0** whole name = query · **1** name starts with it · **2** another alias
starts with it (ingredient, company, class, **barcode**) · **3** every word starts a word, any
order · **4** same consonant skeleton (non-initial ا/و/ي and a/e/i/o/u dropped, doubled letters
collapsed: بروفن → بروفين, نكسيوم → نيكسيوم, اموكسسلين → اموكسيسيلين) · **5** trigram word
similarity ≥ 0.45 (اوجمنتن → اوجمنتين). Tiers 4–5 run only when 0–3 found fewer products than
requested. ا/أ/إ/آ, ى/ي, ة/ه and diacritics are unified on both sides by
`medicine_search_normalize`. Ties: indexable first, then visits. Two-letter queries match name
prefixes only.

What is searched: Arabic names (15,611 aliases), English names (22,662), ingredients (80,726),
catalogue terms including barcodes (38,398). **Approved spelling variants and transliterations:
`approved_drug_name_aliases` has 0 approved rows.** `web.search_index` already includes them, so
they become searchable (exact, prefix and word tiers) as soon as the app approves some.

Speed, top 10, `EXPLAIN ANALYZE` as `web_reader`, warm: **13–62 ms** for every test query
(misspellings, 2-letter queries, barcode, multi-word). The round trip from the development machine
is 105–215 ms because the database is in eu-central-1 and this machine is ~90 ms away: **deploy
the Next app in the same region (Vercel `fra1`) to stay under 100 ms end to end.** The API answers
with `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600` and a
`Server-Timing: db;dur=…` header; repeated queries are CDN hits.

Known misses: brands absent from the catalogue (Zyrtec, Ventolin), and multi-word generic queries
such as "شراب كحه" (the catalogue writes "للكحة"; tier 5 then returns other syrups).

### Listings

| decision | detail |
| --- | --- |
| what a list shows | indexable products **minus the 122 pack variants** whose group canonicalises elsewhere (same set as the sitemaps): e.g. two "باراسيتامول-ادكو 1 جم 20 قرص" rows became one. Counts in titles and descriptions are the listed rows |
| sort | Arabic name, folded (آأإٱ → ا) and compared by code point: the database collation (en_US) put إيجنير before ابسيموكس |
| ingredient page | every listed product, single-ingredient first, grouped by form + strength (combinations by form), cheapest per group flagged when ≥ 2 are priced; 60 rows per page, groups continue across pages ("تابع"); PubChem (from the `cid:` key) and DrugBank (from the product payload) links |
| company / category / ATC | 48 per page; filters `form`, `rx` (`rx`/`otc`), `min`, `max`, `sort` as GET parameters: any filter → `noindex,follow` + canonical to the clean URL; empty or default parameters → 307 to the clean URL |
| ATC | `/atc/{code}-{name}`; a wrong or missing name suffix 308s to the canonical one; breadcrumb = the code's ancestors |
| drugs A–Z (`/adwiya`) | 27 buckets by the first letter of the **English** trade name: `a`..`z` plus `0-9` (names starting with a digit). All 27 buttons and pages exist; a bucket with no drugs (currently `w`,`x`,`y`,`z`) renders an empty state but is **noindex** and left out of `letters-1.xml` (23 URLs today); the largest is `s` (≈ 2,027 → 21 pages of 100). Grouping is lossless over the indexable set (Σ = 16,509, the sitemap's filter); the letter **pages** apply the same `LISTED` filter as every other list, so their per-letter counts exclude the non-canonical pack-variant duplicates. 0 drugs need the slug fallback; the `0-9` bucket holds 1. `/adwiya` and every letter page link **every** page number, so each listed drug is ≤ 3 clicks from home. Sorting everywhere is by the English trade name (`sort_name`, case-insensitive en_US); Arabic names are shown but not sorted on. Old Arabic-letter URLs 301 to `/adwiya` (no 1:1 Arabic→English initial) |
| last prices | 50 per page; `?direction=increase` or `decrease` is noindex; only dated changes up to today (27 undated rows skipped). 5,834 of 5,862 changes are increases |
| "most searched" | `search_count` is **0 for every drug** (the app does not record searches yet), so the home section is ranked by `visit_count` and titled "الأكثر زيارة"; it switches to "الأكثر بحثًا" automatically once search counts exist. Only 147 drugs have visits (max 29) |
| pagination | `?page=N`; page 1 has no parameter (`?page=1` → 307); pages ≥ 2 noindex,follow with a self canonical and their own title and description (" — صفحة N"); an invalid or out-of-range page → 404 |
| robots.txt | `Disallow: /search?` removed: search and filtered URLs are `noindex,follow` and must stay crawlable for that tag to be read |
| query cost | every list loader is in `unstable_cache` (a day; last prices and home an hour). Cold, as `web_reader`: largest category page 1 154 ms, company 9 ms, ATC J 15 ms, all vitamin C products 24 ms, A–Z page 95 ms, letter counts 229 ms, last prices 409 ms, ingredient index 1.06 s |

### Proposal: monthly price-change pages `/last-prices/2026-10`

Demand: "اسعار الادوية الجديدة شهر …" is a recurring query each time a price list is published.
Proposed page: H1 «أسعار الأدوية الجديدة لشهر أكتوبر 2026», the month's changes (largest increase
first), totals (count, median %), previous/next month links, linked from `/last-prices`
("حسب الشهر"); indexable when the month has ≥ 20 changes; sitemap `lastmod` = the last change.

Data today (`web.latest_price_changes`, all products, by `effective_date`): 2026-10: 18 ·
09: 142 · 08: 93 · 07: 124 · 06: 147 · 05: 159 · 04: 234 · 03: 260 · 02: 241 · 01: 94 ·
2025-12: 72 · 11: 90 · 10: 63 · … · 27 undated; increases are over 99% of every month.

**Not built, on purpose:** the view holds only each drug's *latest* change (`old_price →
current_price`). A drug that changed in March and again in September leaves the March page, so
past months would shrink after publication: not an archive. Prerequisite: a durable change log,
either the app's `price_change_events` (0 rows today) or an additive `web.price_change_log`
appended by `web.sync` whenever `current_price` differs from the last logged price. Build the
monthly pages once one full month has been logged.

### Sitemaps after part 4

Types: static (13: home, 5 index pages, last prices, 6 static pages), drugs, alternatives, uses,
ingredients, companies, categories, **atc (603)**, **letters (22)**. Crawl results:
`docs/part4/crawl-report.md`.
