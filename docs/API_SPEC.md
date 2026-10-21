# Drug Prices API — specification (phase 1, for approval)

Egyptian drug prices as a paid, versioned, documented JSON API, read from the public `web`
views only. Companion file: [`openapi.yaml`](../openapi.yaml) (OpenAPI 3.1, the source of
`/api/docs` in phase 3). Nothing in this phase is deployed; phase 2 builds it.

**Decisions that need your approval are marked ⚑ and collected in §15.**

## 1. What we beat, and how

| competitor weakness (verified) | this API |
| --- | --- |
| open, searchable sample: the catalogue can be pulled for free | the sample is a **fixed set of ~50 drugs** in its own table; search and filters work only inside it; every sample response says `"sample": true`; per-IP limits; real data only with a key |
| sales by WhatsApp only; no keys, no dashboard, no public pricing | signup by request form → key issued from the admin page; keys rotate and revoke; usage dashboard; plans and prices published (from the DB) |
| prices as strings, old price sometimes `""` | **numbers are numbers; unknown is `null`, never `""`** |
| `Date_updated` always null | `price.effective_date` (date on the price list), `price.updated_at` (when we recorded the current price; never null when a price exists), `verified` + `verified_at`, record-level `updated_at` |
| inconsistent company names | `company: {id, name}` from the normalised company table (3,270 companies, one id each); manufacturer and marketer separated |
| category stored in "description" | `category: {id, en, ar}` as its own object |
| inconsistent field casing | snake_case everywhere, one schema, validated by the OpenAPI file in CI |
| pagination example contradicts the data | cursor pagination, same shape on every list, documented with real examples |
| no versioning, errors, rate limits, change feed | `/v1`, one error shape, `X-RateLimit-*` headers, **`/price-changes` delta feed** and webhooks |

## 2. Conventions

| | |
| --- | --- |
| base URL ⚑ | `https://api.dwaprice.com/v1` (canonical). `https://dwaprice.com/api/v1` serves the same handlers (one Next.js app; the proxy rewrites the `api.` host). A separate host keeps API caching, CORS and rate-limit rules apart from the website and lets the API move to its own deployment later |
| auth | `Authorization: Bearer <key>`; keys look like `dp_live_` + 40 base32 characters |
| format | JSON, UTF-8, `Content-Type: application/json; charset=utf-8`; gzip/br when accepted |
| names | snake_case, stable; new fields may be **added** in `/v1` (clients must ignore unknown fields); nothing is renamed or removed before `/v2` |
| numbers | prices, quantities and percentages are JSON numbers (`50`, `2.5`), never strings |
| dates | ISO 8601: dates `YYYY-MM-DD` (price-list dates have day precision), timestamps `YYYY-MM-DDTHH:MM:SSZ` (UTC) |
| unknown | `null`. Empty lists are `[]`. No `""`, no `"N/A"`, no `0` as "unknown" |
| text | Arabic as stored (no normalisation of hamza/yaa in output); English trade names without price-list availability markers such as "(n/a)" |
| ids ⚑ | `id` = the product's URL slug (`congestal-20-tabs`): stable, never reused, readable, the same identity as the website. When a product is renamed in the source list it gets a new id and the old one answers **301** to it (same mechanism as the website's redirects, `web.slug_lookup`). No opaque second id system to maintain |
| envelope | single: `{"data": {...}}`; list: `{"data": [...], "page": {...}}`; every response: `"meta": {"dataset_version", "generated_at"}` and, on the sample, `"sample": true` |
| caching | `ETag` on every GET (`If-None-Match` → 304). Authenticated: `Cache-Control: private, max-age=60`. Sample: `public, s-maxage=300, stale-while-revalidate=3600` (CDN) |
| CORS | `Access-Control-Allow-Origin: *` on the sample only; authenticated endpoints are for servers (keys must not ship in browser or mobile code; the terms say so) |
| time zone | all timestamps UTC; price-list dates are calendar dates (Egypt) |
| limits | query strings ≤ 2 KB; `q` 2–80 characters; `limit` 1–100 |

## 3. Authentication

* Every non-sample request needs `Authorization: Bearer dp_live_…`. Missing or malformed → `401 unauthorized`. Unknown, revoked or expired key → `401 unauthorized` (the same answer: we do not reveal which). Key valid but the plan, scope or IP does not allow the endpoint → `403 forbidden`.
* Keys: 32 random bytes from the OS CSPRNG, base32 → `dp_live_<40 chars>`. Stored: `key_prefix` (first 12 characters, for lookup) and `key_hash` = SHA-256 of the full key. The full key is shown **once** at creation. Comparison is constant-time on the hash.
* Scopes (per key): `drugs:read`, `changes:read`, `export`, `webhooks`. Default on a new key: what the plan allows.
* Rotation: "rotate" creates a new key and gives the old one a 24-hour grace period (`expires_at`), so deployments can switch without downtime. Revocation is immediate (the server-side key cache lives ≤ 60 s).
* Enterprise IP allowlist: CIDR list per client; requests from other addresses get `403 forbidden` (`code: ip_not_allowed`).

## 4. Rate limits

Per key: a **per-minute** limit (sliding window) and a **monthly quota** (calendar month, UTC), both from the plan. Sample: per IP.

Every response carries:

```
X-RateLimit-Limit: 300          # requests per minute for this key (or IP)
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1761052860   # Unix seconds when the minute window resets
X-Quota-Limit: 500000           # monthly quota (authenticated only)
X-Quota-Remaining: 498113
X-Quota-Reset: 1761955200       # first second of next month, UTC
```

Over the minute limit → `429 rate_limited` with `Retry-After` (seconds). Over the monthly quota →
`429 quota_exceeded` with `Retry-After` until the month resets (Enterprise: soft limit, we alert
instead of blocking, by agreement). A 304 or a 4xx still counts as a request; a 5xx does not.

Storage: Upstash Redis when `UPSTASH_REDIS_REST_URL` is set (atomic `INCR` + `EXPIRE` per
key/minute and per key/month); otherwise Postgres (`api.rate_buckets`, one `upsert … returning`
per request, bucket rows older than a day deleted by cron).

## 5. Pagination

Every list takes `limit` (1–100, default 20) and `cursor`, and returns:

```json
"page": { "limit": 20, "has_more": true, "next_cursor": "eyJzIjoiY29uZ2VzdGFsLTIwLXRhYnMifQ" }
```

* `next_cursor` is an opaque string (clients never parse it); pass it back as `cursor` to get the
  next page. `null` when there is no next page. Cursors stay valid for 24 hours and across data
  updates (keyset on the sort key, not an offset), except search results (`q`), where the cursor
  encodes the position in a ranked result list capped at 1,000 results.
* Changing any filter invalidates the cursor (`400 invalid_cursor`).
* No total counts on lists (they cost a full scan); `/meta` has the dataset counts.

## 6. Resources

### 6.1 Drug

One record per product **and pack** (a 20-tablet and a 30-tablet pack are two records). Source
columns are from the `web` views; nothing else is read.

| field | type | description | example | source |
| --- | --- | --- | --- | --- |
| `id` | string | stable public id (URL slug) | `"congestal-20-tabs"` | `drug_cards.slug` |
| `trade_name_en` | string | English trade name as on the price list, availability markers removed | `"Congestal 20 tabs"` | `drug_cards.name_en` |
| `trade_name_ar` | string \| null | Arabic trade name | `"كونجستال 20 قرص"` | `drug_cards.name_ar` |
| `scientific_name` | string \| null | generic/scientific name as listed (combinations joined with "+") | `"Chlorpheniramine+paracetamol(acetaminophen)+pseudoephedrine"` | `drug_pages.scientific_name` |
| `ingredients` | Ingredient[] | active ingredients in list order | see below | `drug_pages.ingredients` |
| `ingredients[].id` | string \| null | ingredient id (for `/ingredients`, `?ingredient=`) | `"paracetamol"` | `ingredients[].slug` |
| `ingredients[].name_en` | string \| null | | `"Paracetamol (acetaminophen)"` | |
| `ingredients[].name_ar` | string \| null | | `"باراسيتامول"` | |
| `ingredients[].strength` | string \| null | strength of this ingredient in the product | `"650 mg"` | |
| `ingredients[].atc_code` | string \| null | ATC code of the ingredient | `"N02BE01"` | |
| `strength` | string \| null | product strength as listed | `"650/4/60 mg"` | `drug_cards.strength` |
| `dosage_form` | object | `{class, en, ar}`: `class` is a controlled value (`tablet`, `capsule`, `injection`, `syrup`, `suspension`, `drops`, `sachet`, `cream`, `ointment`, `gel`, `lotion`, `solution`, `spray`, `powder`, `inhaler`, `suppository`, `other`); `en`/`ar` the text as listed (1,714 distinct English spellings in the source, hence the class) | `{"class": "tablet", "en": "Tablet", "ar": "قرص"}` | `form_class`, `dosage_form_en`, `dosage_form_ar` |
| `route` | string \| null | controlled value: `oral`, `topical`, `injection`, `ophthalmic`, `vaginal`, `rectal`, `nasal`, `inhalation`, `otic`, `other` (the source text has 40+ spellings; `route_text` keeps it) | `"oral"` | `drug_cards.route_class` |
| `route_text` | string \| null | route as listed | `"Oral"` | `drug_pages.route` |
| `units_per_package` | integer \| null | tablets, capsules, sachets… per pack | `20` | `drug_cards.units_per_package` |
| `packaging` | string \| null | pack description as listed | `"20 tablets (2 blisters of 10)"` | `drug_pages.packaging` |
| `price.current` | number \| null | current public price | `50` | `current_price` |
| `price.previous` | number \| null | price before the last change | `31` | `old_price` |
| `price.unit_price` | number \| null | price per unit (`current / units_per_package`, as listed) | `2.5` | `unit_price` |
| `price.currency` | string | always `"EGP"` | `"EGP"` | constant |
| `price.effective_date` | date \| null | date of the current price on the price list | `"2024-06-06"` | `price_updated_date` |
| `price.updated_at` | timestamp \| null | when **we** recorded the current price (the sync key for POS systems). The phase 2 baseline stamps every priced product with the baseline time; `null` only when `price.current` is `null` | `"2026-11-01T00:00:00Z"` | `api.drug_state.last_price_changed_at` |
| `price.verified` | boolean | the price was checked against a published source | `true` | `price_verified` |
| `price.verified_at` | date \| null | when it was last checked | `"2026-10-03"` | `drug_pages.price_verified_at` |
| `barcode` | string \| null | EAN/GTIN as listed (73 barcodes are shared by more than one pack in the source; see `/drugs/by-barcode`) | `"6221051011317"` | `drug_pages.barcode` |
| `company` | object \| null | `{id, name}`: the marketing company when known, else the manufacturer | `{"id": "sigma", "name": "Sigma"}` | `company_links` (role marketer → manufacturer → company) |
| `manufacturer` | object \| null | `{id, name}` when a separate manufacturer is listed ("Manufacturer > Marketer" in the source) | `null` | `company_links` |
| `category` | object \| null | `{id, en, ar}` therapeutic category from the price list (987 categories) | `{"id": "cold", "en": "Cold/cough combination (…)", "ar": null}` | `category_slug`, `category`, `category_name_ar` |
| `atc_codes` | string[] | product-level ATC codes (ingredient-level codes are on `ingredients[]`) | `[]` | `drug_pages.atc_codes` |
| `prescription_status` | string \| null | `prescription`, `otc`, `not_applicable` (cosmetics, devices, supplements) or `null` (not stated) | `"otc"` | `prescription_status` |
| `status` ⚑ | string | the price list's own marker on the line: `listed` (no marker; **not** a stock indication), `not_available`, `not_yet_available`, `cancelled`, `illegal_import` | `"listed"` | `listing_status` |
| `price_list_name` | string | the exact line name on the source price list (for matching your own SKU table) | `"Congestal 20 tabs"` | `drug_cards.price_list_name` |
| `created_at` | timestamp | when the record first appeared in the API dataset | `"2026-11-01T00:00:00Z"` | `api.drug_state.first_seen_at` |
| `updated_at` | timestamp | last change of **any** field above (drives `updated_since`) | `"2026-10-21T12:20:09Z"` | `api.drug_state.last_changed_at` |
| `links.web_url` | string | the public page | `"https://dwaprice.com/dawa/congestal-20-tabs"` | derived |

**Not in the API** (by rule or decision): images (until rights are confirmed), clinical text
(indications, side effects, interactions, pregnancy — AI-researched, under pharmacist review, and
not licensed for redistribution), dosing, visit and search counters, the research payload and its
status flags, website-only flags (`indexable`, `noindex_reason`), user or patient data of any kind.

Scope ⚑: **all 14,726 current products** are in the dataset (the website hides 1,498 of them from
search engines for SEO reasons only). 557 have no price (`price.current: null`); 300 carry an
availability marker on the price list: 135 `not_available`, 45 `not_yet_available`, 29 `cancelled`
and 91 `illegal_import`. A POS needs to know all of them; the sample contains none of these edge cases.

### 6.2 Alternative

A Drug plus:

| field | type | description |
| --- | --- | --- |
| `match` | string | `same_strength` (same ingredients and strength) or `other_strength` (same ingredients, different strength) |
| `same_form` | boolean | same dosage-form class as the requested drug |
| `price_diff` | number \| null | `alternative.price.current − drug.price.current` |
| `unit_price_diff_pct` | number \| null | unit-price difference in percent (negative = cheaper per unit) |

### 6.3 PricePoint (`/drugs/{id}/price-history`)

| field | type | description |
| --- | --- | --- |
| `price` | number | |
| `effective_date` | date \| null | date on the price list; older catalogue history has no dates (ordered as recorded, oldest first) |
| `recorded_at` | timestamp \| null | when the API change log recorded it (`null` before the log started) |
| `source` | string | `catalog` (price list history) or `change_log` (observed by the API) |

11,073 products have history today; consecutive identical prices are collapsed.

### 6.4 PriceChangeEvent (`/price-changes`)

| field | type | description |
| --- | --- | --- |
| `id` | integer | monotonically increasing; the ordering key |
| `type` | string | `price_changed`, `added`, `status_changed`, `removed`, `renamed` |
| `detected_at` | timestamp | when the change entered the dataset (the value to sync on) |
| `drug_id` | string | |
| `data` | object | per type: `price_changed` → `{old, new, effective_date, change_pct}`; `added` → `{price}`; `status_changed` → `{old, new}`; `removed` → `{last_price, last_status}`; `renamed` → `{new_id}` |
| `drug` | Drug \| null | the current record (`null` for `removed`), so one call is enough to update a cache |

### 6.5 Company, Ingredient, Meta

* Company: `{id, name, product_count}` (`name` is Latin only: the source has no Arabic company names).
* Ingredient: `{id, name_en, name_ar, product_count}`.
* Meta: dataset version, update times and counts (§7.9).

## 7. Endpoints (`/v1`)

All lists: `limit`, `cursor` (§5). All authenticated endpoints need scope `drugs:read` unless stated.

### 7.1 `GET /drugs`

| parameter | type | matches |
| --- | --- | --- |
| `q` | string (2–80) | Arabic and English trade names, approved aliases and spelling variants, ingredients, barcode; typo-tolerant (the website's `web.search_drugs`: exact → prefix → words → vowel-insensitive → trigram); results are ranked, max 1,000 |
| `company` | string | company id |
| `ingredient` | string | ingredient id (products containing it) |
| `atc` | string | ATC code **prefix** (`J01` matches `J01CR02`), product-level or ingredient-level |
| `dosage_form` | string | dosage-form class |
| `route` | string | route class |
| `prescription_status` | string | `prescription`, `otc`, `not_applicable` |
| `status` | string | default: all; e.g. `listed` |
| `has_barcode` | boolean | |
| `updated_since` | timestamp | records whose `updated_at` > the value (full-record changes; for prices only use `/price-changes`) |
| `sort` | string | `name` (default), `price`, `-price`, `updated_at`, `-updated_at`; with `q`: relevance (fixed) |

Example `GET /v1/drugs?ingredient=paracetamol&dosage_form=tablet&sort=price&limit=2` → `200`

```json
{
  "data": [
    {
      "id": "paracetamol-500mg-20-tab-pharco",
      "trade_name_en": "Paracetamol 500 mg tablets B.P. 80 (Pharco)",
      "trade_name_ar": "باراسيتامول 500مجم 20 قرص -فاركو",
      "scientific_name": "Paracetamol",
      "ingredients": [{ "id": "paracetamol", "name_en": "Paracetamol", "name_ar": "باراسيتامول", "strength": "500 mg", "atc_code": "N02BE01" }],
      "strength": "500 mg",
      "dosage_form": { "class": "tablet", "en": "Tablets", "ar": "أقراص" },
      "route": "oral",
      "route_text": "Oral",
      "units_per_package": 20,
      "packaging": "20 tablets",
      "price": { "current": 1.5, "previous": null, "unit_price": 0.08, "currency": "EGP", "effective_date": "2023-01-15", "updated_at": "2026-11-01T00:00:00Z", "verified": true, "verified_at": "2026-09-28" },
      "barcode": null,
      "company": { "id": "pharco-pharmaceuticals", "name": "Pharco Pharmaceuticals" },
      "manufacturer": null,
      "category": { "id": "analgesic", "en": "Analgesic", "ar": "مسكن" },
      "atc_codes": ["N02BE01"],
      "prescription_status": "otc",
      "status": "listed",
      "price_list_name": "Paracetamol 500 mg 20 tab. (Pharco)",
      "created_at": "2026-11-01T00:00:00Z",
      "updated_at": "2026-11-01T00:00:00Z",
      "links": { "web_url": "https://dwaprice.com/dawa/paracetamol-500mg-20-tab-pharco" }
    },
    { "id": "febrimol-500mg-20-tab", "trade_name_en": "Febrimol 500 mg 20 tab.", "...": "..." }
  ],
  "page": { "limit": 2, "has_more": true, "next_cursor": "eyJwIjozLjUsImlkIjoiZmVicmltb2wtNTAwbWctMjAtdGFiIn0" },
  "meta": { "dataset_version": "2026-10-21.184", "generated_at": "2026-10-21T13:02:11Z" }
}
```

(Field values are from the current data; `created_at`/`updated_at`/`price.updated_at` start with
the phase 2 baseline.)

### 7.2 `GET /drugs/{id}`

`200` with `{"data": Drug}`. A retired id → `301` with `Location: /v1/drugs/{new_id}` (and the
same error body shape with `code: "moved"` for clients that do not follow redirects). Unknown →
`404 not_found`.

### 7.3 `GET /drugs/by-barcode/{barcode}`

Barcode = digits only (8–14). Returns **a list** (`{"data": [Drug]}`): 73 barcodes in the source
are shared by more than one pack (e.g. two pack sizes of one product). Ordered: `listed` first,
then newest price date. Empty list, not 404, when nothing matches.

### 7.4 `GET /drugs/{id}/alternatives`

Products with the **same active ingredients and the same strength** (`match: same_strength`),
sorted by `price.current` ascending (no price last). `?strength=any` adds `other_strength`
matches after the same-strength ones. Other packs of the same product are included and flagged
with `same_product: true`. `limit` default 50.

### 7.5 `GET /drugs/{id}/price-history`

`{"data": [PricePoint], "drug_id": "…"}`, oldest first; the current price is the last point.

### 7.6 `GET /price-changes` — the delta feed (scope `changes:read`)

| parameter | type | |
| --- | --- | --- |
| `since` | timestamp (required unless `cursor`) | events with `detected_at` **≥** `since` (inclusive: every event of one capture run carries the run's timestamp, so resuming from `latest_detected_at` re-delivers the tail of that run; skip ids you already applied) |
| `type` | string | comma list of event types; default all |
| `limit` | 1–100 | |

Response: `{"data": [PriceChangeEvent], "page": {...}, "latest_detected_at": "…"}` ordered by
`id` ascending. The cursor carries the original `since`, so following pages need only `cursor`.
Recommended loop:

1. First sync: load the catalogue with `GET /drugs` (all pages) and store `meta.generated_at`.
2. Every N minutes: `GET /price-changes?since=<stored>`; page through with `cursor`; apply each
   event to your table (`drug` carries the full current record); store `latest_detected_at`.
3. Keep `id` of the last applied event to skip duplicates (delivery is at-least-once).

Guarantees: events are append-only and never reordered; `detected_at` is non-decreasing with `id`;
a change is visible in `/drugs` and in the feed in the same dataset version. Window: the plan's
`feed_window_days` (§10); `since` older than the window → `400 since_too_old` (do a full resync).

How changes are captured (schema `api`, additive): `api.capture()` runs by pg_cron 2 minutes after
every `web.sync` (every 10 minutes). It is **incremental**: only products whose source `updated_at`
moved since the last capture are re-hashed (the exposed columns of `web.drug_cards` plus the few
`web.drug_pages` fields the API uses, not the whole page payload) and compared with
`api.drug_state` (one row per product: public hash, price, status, timestamps); differences are
appended to `api.events`. The first run is the **baseline** (no events; every `created_at` and
`price.updated_at` = baseline time). Renames come from `web.slug_lookup` (retired slug → current
slug). Phase 2 also maintains two derived columns in `api.drug_state` that the `web` views do not
index: ingredient-level ATC codes (for `?atc=`) and the search text, since `web.search_drugs`
returns 7 columns with a 50-row cap and a 1,000 offset cap (the API needs full records per page).

### 7.7 `GET /companies`

`q` (prefix, case-insensitive), `limit`, `cursor`. Sorted by name. 3,270 companies.

### 7.8 `GET /ingredients`

`q` (Arabic or English prefix), `limit`, `cursor`. Sorted by `name_en`. 3,771 ingredients.

### 7.9 `GET /meta`

```json
{
  "data": {
    "dataset_version": "2026-10-21.184",
    "updated_at": "2026-10-21T12:20:09Z",
    "last_price_change_at": "2026-10-21T09:20:41Z",
    "last_price_list_date": "2026-10-14",
    "counts": { "drugs": 14726, "priced": 14169, "verified": 13597, "with_barcode": 5302, "companies": 3270, "ingredients": 3771, "categories": 987 },
    "api_version": "1.0.0",
    "docs_url": "https://dwaprice.com/api/docs"
  }
}
```

`dataset_version` = `<date>.<capture number>`; it changes only when something changed.

### 7.10 Sample endpoints (no key) — `/v1/sample/...`

`/sample/drugs`, `/sample/drugs/{id}`, `/sample/drugs/by-barcode/{barcode}`,
`/sample/drugs/{id}/alternatives`, `/sample/drugs/{id}/price-history`, `/sample/price-changes`,
`/sample/companies`, `/sample/ingredients`, `/sample/meta`. Same parameters and shapes as the real
endpoints, plus top-level `"sample": true` and the `X-Sample: true` header, so integration code is
identical except for the base path and the key. See §11.

### 7.11 Enterprise endpoints

* `POST /exports` `{"format": "csv" | "json"}` → `202` `{"data": {"id", "status": "queued"}}`;
  `GET /exports/{id}` → `{"status": "ready", "url": "<signed, valid 1 h>", "expires_at", "rows", "dataset_version"}`.
  One export per dataset version is generated and reused; `csv` is UTF-8 with BOM (opens in Excel) and
  flattens nested objects (`price_current`, `company_name`…). Scope `export`.
* `POST /webhooks` `{"url", "events": ["price_changed", …], "secret"?}` → the endpoint receives
  `POST` batches `{"events": [PriceChangeEvent…]}` within 10 minutes of a capture, signed with
  `X-Dwaprice-Signature: sha256=<HMAC of body>` and `X-Dwaprice-Delivery` (id for idempotency).
  Non-2xx → retries with exponential back-off for 24 hours, then the webhook is paused and the admin
  is alerted. `GET /webhooks`, `DELETE /webhooks/{id}`, `POST /webhooks/{id}/test`. Scope `webhooks`.
* IP allowlist: managed by the admin page, no endpoint.

## 8. Errors

One shape for every non-2xx response:

```json
{ "error": { "code": "validation_error", "message": "limit must be between 1 and 100", "details": [{ "param": "limit", "issue": "out_of_range" }] } }
```

| HTTP | `code` | when |
| --- | --- | --- |
| 400 | `validation_error` | bad parameter value or combination (`details[]` names each one) |
| 400 | `invalid_cursor` | cursor expired, malformed, or from different filters |
| 400 | `since_too_old` | `since` is outside the plan's feed window |
| 401 | `unauthorized` | missing, malformed, unknown, revoked or expired key |
| 403 | `forbidden` | key valid but the plan or scope does not include the endpoint (`details.plan`, `details.required_scope`) |
| 403 | `ip_not_allowed` | Enterprise allowlist |
| 404 | `not_found` | unknown id or path |
| 301 | `moved` | retired id; `Location` + `details.new_id` |
| 429 | `rate_limited` | per-minute limit; `Retry-After` |
| 429 | `quota_exceeded` | monthly quota; `Retry-After` |
| 500 | `internal_error` | our fault; `details.request_id` for support |
| 503 | `unavailable` | maintenance or database unreachable; `Retry-After` |

`message` is English, for developers; it never contains the key or any internal name.

## 9. Versioning

* The path carries the major version (`/v1`). Breaking changes (renaming or removing a field,
  changing a type or a meaning, removing an endpoint, tightening a limit) ship only in `/v2`, with
  `/v1` kept for at least 12 months after `/v2` is announced; `/v1` responses then carry
  `Deprecation` and `Sunset` headers.
* Additive changes (new fields, new optional parameters, new endpoints, new enum values on
  `status`/`type`) happen in `/v1` and are listed in the changelog (`/api/docs#changelog`).
  **Clients must ignore unknown fields and unknown enum values.**
* `meta.api_version` is the semantic version of the `/v1` surface (`1.x.y`).

## 10. Plans ⚑ (stored in `api.plans`; numbers are proposals)

| | Sample | Starter | Business | Enterprise |
| --- | --- | --- | --- | --- |
| who | evaluation, demos | one app or shop | POS/ERP vendors, apps with users | chains, insurers, TPAs, resellers of integrations |
| data | 50 curated drugs | full catalogue | full catalogue | full catalogue |
| requests / minute | 30 per IP | 60 | 300 | 1,000 (custom) |
| requests / month | 300 per IP per day | 50,000 | 500,000 | custom (from 5,000,000) |
| keys | — | 2 | 5 | unlimited |
| `/price-changes` window | 7 days | 7 days | 90 days | 365 days |
| price history | ✓ | ✓ | ✓ | ✓ |
| alternatives, barcode | ✓ | ✓ | ✓ | ✓ |
| bulk export (CSV/JSON, signed URL) | — | — | — | ✓ |
| webhooks | — | — | — | ✓ |
| IP allowlist | — | — | — | ✓ |
| support | docs | email, 2 business days | email, 1 business day | named contact, 4 h, 99.9 % monthly uptime |
| price (EGP / month) | free | *placeholder: 1,500* | *placeholder: 6,000* | *from 20,000, by contract* |

Prices are placeholders for you to set; the landing page reads them from `api.plans`. Billing is
manual at first: the admin records invoice/payment reference and `paid_until`; a client whose
`paid_until` passes by 7 days is suspended (keys answer `403 forbidden`, `details.reason:
"subscription_expired"`).

## 11. The sample (must not leak the catalogue)

* `api.sample_drugs(id, position)`: **50 products chosen once**, by rule: indexable, verified price,
  `listed` status, Arabic name, barcode, at least one priced same-strength alternative, dated price
  history, at most two per category, across the common forms (tablets, syrups, injections,
  creams, drops…). Stored as a table so it never drifts with the catalogue; changed only by hand.
* Every sample endpoint reads from views that `JOIN api.sample_drugs` (`api.sample_drug_cards`,
  `api.sample_alternatives`, …): a sample response **cannot** contain another product by
  construction, including alternatives (only alternatives that are themselves in the set),
  `by-barcode`, `price-changes` and search (`q` is matched inside the 50 names and ingredients).
* Marked: top-level `"sample": true`, header `X-Sample: true`, and `links.web_url` as usual.
* Limits: 30 requests/minute and 300/day per IP (`429`), CDN-cached 5 minutes, CORS open so the
  sample explorer (`/api/sample`) and any browser demo can call it.
* Phase 2 proof: a test asserts that no sample response can contain an id outside `api.sample_drugs`
  for every endpoint, including searches for names of non-sample drugs ("بانادول" returns `[]` if
  Panadol is not in the set).

## 12. Abuse protection and traceability

* **Scraping detection** (`api.usage_daily` + a 15-minute job): per key, alert the admin (email)
  when any of: > 2,000 distinct `/drugs/{id}` ids in a day, more than 80 % of the catalogue paged
  through `/drugs` in a day on Starter, sequential id walking (ids in alphabetical order with no
  filters), or > 50 distinct IPs on one key in an hour. Alerts do not block; the admin suspends.
* **Canary records** ⚑: each Enterprise client gets 3 synthetic products (plausible names,
  `status: "not_available"`, `price.current: null`, no barcode) that appear **only in that client's
  bulk exports** (the realistic leak vector), never in any API response: a client that reloads
  through `GET /drugs` must get a consistent catalogue, and a canary that 404s by id would reveal
  itself. A leaked export is traced by its canaries. The license terms disclose that exports
  contain integrity records.
* **Request log** (`api.request_log`): 10 % sample of requests (100 % of 4xx/5xx), 30-day
  retention by cron; stores key id (not the key), path, params with `q` truncated, status,
  duration, IP truncated to /24 after 7 days, user agent. Never the `Authorization` header.

## 13. Data boundary and roles

* The API process reads **only** `web.*` views and executes `web.search_drugs` /
  `web.search_normalize` — the same surface as the website — through a new role **`api_app`**:
  `SELECT` on the `web` views, `EXECUTE` on those two functions, and all privileges on schema `api`
  (keys, usage, events, sample tables) and nothing else. It cannot see `public.*`, `auth.*`,
  patient, prescription, recognition or user tables (verified by extending `db/checks/boundary.mjs`
  in phase 2). `web_reader` stays as it is for the website.
* No Supabase keys (anon or service role) anywhere in the API; the admin and developer pages use
  the website's server-side session, not Supabase Auth of the mobile app ⚑ (login method for
  `/developer` and the admin page: proposal = email magic link stored in `api.clients`, independent
  of the app's `auth.users`).
* All tables in schema `api`; migrations additive; no change to any app table.

### Tables (`api` schema, phase 2)

| table | columns (summary) |
| --- | --- |
| `plans` | `id`, `name`, `name_ar`, `rpm`, `monthly_quota`, `max_keys`, `feed_window_days`, `features jsonb` (export, webhooks, ip_allowlist), `price_egp_monthly`, `is_public`, `sort` |
| `clients` | `id`, `company`, `contact_name`, `email`, `phone`, `plan_id`, `status` (`active`, `suspended`, `closed`), `ip_allowlist cidr[]`, `paid_until`, `billing_reference`, `notes`, `created_at` |
| `api_keys` | `id`, `client_id`, `key_prefix`, `key_hash`, `scopes text[]`, `status` (`active`, `revoked`), `name`, `created_at`, `last_used_at`, `expires_at`, `rotated_from` |
| `access_requests` | `id`, `name`, `company`, `email`, `phone`, `use_case`, `expected_volume`, `plan_id`, `status` (`new`, `approved`, `rejected`), `client_id`, `created_at`, `reviewed_at`, `reviewer_note` |
| `usage_daily` | `key_id`, `day`, `endpoint`, `requests`, `errors_4xx`, `errors_5xx`, `distinct_ids` (approx), primary key `(key_id, day, endpoint)` |
| `request_log` | `id`, `at`, `key_id`, `client_id`, `method`, `path`, `params` (sanitised), `status`, `duration_ms`, `ip_prefix`, `user_agent`, `request_id` |
| `rate_buckets` | `scope` (`key:…`/`ip:…`), `window_start`, `count` (Postgres fallback) |
| `drug_state` | `id`, `public_hash`, `price`, `previous_price`, `effective_date`, `status`, `first_seen_at`, `last_changed_at`, `last_price_changed_at`, `superseded_by` |
| `events` | `id bigserial`, `detected_at`, `type`, `drug_id`, `data jsonb` |
| `dataset_versions` | `id`, `version`, `captured_at`, `events`, `counts jsonb` |
| `sample_drugs` | `id`, `position`, `note` |
| `canaries` | `client_id`, `record jsonb` |
| `webhooks`, `webhook_deliveries` | Enterprise |
| `exports` | `id`, `client_id`, `format`, `dataset_version`, `status`, `storage_path`, `rows`, `created_at` |

## 14. Caching

* Sample: CDN (`s-maxage=300`), purged by the `prices` revalidation tag the website already uses
  (and by `api.capture()` through `POST /api/revalidate`).
* Authenticated reads: server cache keyed by endpoint + params + dataset version, 60 s, so a
  burst of identical requests costs one query; `ETag` = hash of the body; `private` to the CDN.
* The delta feed is never cached beyond the dataset version (a new version invalidates everything).

## 15. Decisions for approval ⚑

1. **Base URL**: `https://api.dwaprice.com/v1` (recommended) or `https://dwaprice.com/api/v1` only.
2. **Public id = slug** (readable, stable, 301 on rename) rather than an opaque id.
3. **Scope**: all 14,726 current products, with `status` for unavailable/cancelled/**illegal
   import** lines (91) — or exclude illegal-import lines from the API altogether?
4. **Plan limits and placeholder prices** (§10), the 7/90/365-day feed windows, and manual billing
   with a 7-day grace period.
5. **Canary records** in Enterprise bulk exports only (§12) — fine with you, and disclosed in the terms?
6. **Login for `/developer` and the admin page**: email magic link in `api.clients`, independent
   of the app's `auth.users`.
7. The 50-drug **sample selection rule** (§11); the list itself is produced in phase 2 for your review.
8. `price.updated_at` is **our detection time** (sync key) and `price.effective_date` the list date;
   clinical text, images and counters stay out of v1.
9. **Provenance in the terms**: `docs/DATA_AUDIT.md` records that ~88 % of current prices were
   collected from a third-party price directory. The API terms will forbid resale of *our* dataset
   and the `verified` flag means "checked against a published source": tell me how you want the
   data-accuracy section to describe where prices come from, before phase 3 writes `/api/terms`.

After your answers: phase 2 (schema `api`, keys, limits, sample, delta capture, tests).

## 16. Phase 2 — what was built (access control and the safe sample)

Everything in §1–§15 is implemented and tested against the shared database; the public pages,
dashboard and admin page are phase 3. Proofs: `docs/api/phase2/` (tests, sample-isolation
probes, a captured response per endpoint, the `api_app` boundary check).

### Migrations (applied and recorded; additive)

| migration | what |
| --- | --- |
| `0042_api_schema.sql` | schema `api`; role **`api_app`** (SELECT on the web views, EXECUTE on `web.search_drugs`/`search_normalize`, read/write on the access tables, read-only on the dataset tables, `statement_timeout` 10 s); tables `plans` (4 plans seeded), `clients`, `api_keys`, `access_requests`, `usage_daily`, `usage_drug_ids`, `usage_ips`, `request_log`, `rate_buckets`, `alerts`, `drug_state`, `events`, `dataset_versions`, `capture_log`, `sample_drugs`, `canaries`, `exports`, `webhooks`, `webhook_deliveries`; functions `public_status`, `trade_name`, `atc_prefixes`, `diff_events` (pure, unit-tested), `build_records` (the public record from the web views), **`capture()`** (owner-only) and `retention()`; pg_cron `api-capture` (every 10 min, 2 min after `web.sync`), `api-capture-full` (03:50), `api-retention` (04:10) |
| `0043_api_capture_empty_set.sql` | `capture()` with no candidates built the whole catalogue (NULL array = all): fixed; an idle run is 4–5 s |
| `0044_api_sample_drugs.sql` | the 50 sample products (§11 rule; 23 tablets, 3 capsules, 5 syrups/suspensions, 4 drops, 5 injections, 7 topicals, 3 others; brands such as Augmentin, Glucophage, Lipitor, Plavix, Concor, Lantus, Fucidin, Betadine, Duphalac, Otrivin) |
| `0045_api_plans_grants.sql` | INSERT/DELETE on `api.plans` for `api_app` (admin page, tests) |
| `0046_api_retention_quota_buckets.sql` | `retention()` kept rate buckets for 2 days only, which also removed the monthly quota buckets on the 3rd of each month (quota reset); quota buckets now live until the following month |

Baseline: 14,726 products captured as dataset version `2026-10-21.1`, 0 events, every priced
product stamped with the baseline time in `price.updated_at` and `created_at` (§6.1).

### Code (`src/lib/api/*`, routes under `src/app/api/v1/*`)

| module | role |
| --- | --- |
| `handler.ts` | the pipeline of every endpoint: client address → auth or per-IP sample limits → rate limit → handler → JSON envelope with `meta` (+ `sample: true`) → ETag/304 → cache headers (sample `public, s-maxage=300`; authenticated `private, max-age=60`) → CORS on the sample → usage accounting after the response (`after()`). In-memory response cache (60 s) keyed by dataset version |
| `auth.ts` | Bearer key → SHA-256 → cached lookup (60 s) → key active and unexpired, client active, `paid_until` + 7-day grace, IP allowlist, scope, plan feature |
| `ratelimit.ts` | fixed windows (minute, day, month) in Upstash Redis when configured, else `api.rate_buckets` (one upsert per request); fail-open on store errors |
| `keys.ts`, `cursor.ts`, `params.ts`, `records.ts`, `net.ts` | pure: key generation/hashing, signed opaque cursors (24 h, bound to the filter fingerprint), parameter validation (every invalid parameter reported), record shaping in the documented field order, forbidden-field scanner, CSV flattening, CIDR matching |
| `drugs.ts` | all catalogue queries over `api.drug_state`; keyset pagination for lists, ranked search through `web.search_drugs` (real) or a normalised/skeleton substring match inside the 50 sample records; alternatives, price history (catalogue + change log), delta feed, companies, ingredients |
| `exports.ts`, `canaries.ts` | signed one-hour download links (no object storage: HMAC-signed URL served by the app), CSV with BOM / JSON streamed in 1,000-row batches, 3 canaries per Enterprise client inserted into the stream only |
| `webhooks.ts` | CRUD, `POST …/test`, batch deliveries signed `X-Dwaprice-Signature: sha256=…`, retries with back-off, pause after 24 h + alert |
| `jobs.ts` + `/internal/jobs` | every 15 min (`x-jobs-secret: $API_SECRET` or Vercel Cron `CRON_SECRET`): scraping detection (> 2,000 distinct ids/day, ≥ 80 % of the catalogue paged unfiltered/day on non-Enterprise plans, > 50 networks/hour per key → `api.alerts` + email through Resend when configured), webhook deliveries, cache invalidation on a new dataset version (`revalidateTag('prices')` + response cache) |
| `scripts/api-admin.mjs` | plans, clients (create/suspend/plan/paid/allowlist), keys (create: printed once; rotate: 24 h overlap; revoke), usage, alerts — until the admin page of phase 3 |
| `src/proxy.ts` | `api.<host>/v1/*` → the same handlers |

Environment: `API_DATABASE_URL`, `API_SECRET`, `API_BASE_URL`, optional `UPSTASH_REDIS_REST_URL/TOKEN`,
`RESEND_API_KEY` + `ADMIN_EMAIL`, `CRON_SECRET`, `API_DB_POOL_MAX` (`.env.example`).

### Deviations from §1–§15 and things to know

* **No real event exists yet**: the baseline produced none, and no price list was imported since.
  The capture → `api.events` → feed → webhooks path is verified by the `diff_events` unit tests, the
  feed's structure tests and the webhook delivery test; its first live exercise is the next
  import. Watch `api.capture_log` (one row per run, `events` column) and `api.events`.
* The feed is inclusive on `since` and the cursor carries the original `since` (see §7.6): a
  client resuming from `latest_detected_at` re-sees the tail of the same capture run and skips
  ids it already applied.
* Webhook targets must resolve to public addresses (checked at creation and again before each
  delivery); `API_ALLOW_PRIVATE_WEBHOOKS=true` relaxes this for local tests only.
* Usage accounting costs 3–4 small writes per request after the response; fine at launch, to be
  batched and flushed periodically at Business/Enterprise volumes on this database instance.

* Rate limits use fixed windows (per minute / calendar day / calendar month), not sliding.
* `GET /drugs?q=` is capped at 1,000 ranked results (§5) and costs up to two `web.search_drugs`
  calls per page (its 50-row cap).
* The sample's per-IP limiter keys on the /24 network of `X-Forwarded-For`; locally that header is
  trusted (the tests rotate it), on Vercel the platform overwrites it with the real address.
* `GET /drugs/{id}/alternatives` reads `web.drug_alternatives` live (not the state table); the
  alternatives of a product are not part of the delta feed (price changes of each alternative are).
* Scraping detection "sequential id walking" is approximated by distinct ids per day; usage per
  key is written synchronously after each response (one upsert + two `on conflict do nothing`).
* No retired slug exists yet, so the `301 moved` path is exercised by the unit of
  `getDrug()` and the integration test skips it until one appears.
* Bulk exports are generated on download (no file kept); each download re-streams the current
  dataset of the registered version.

## 17. Phase 3 — public pages, dashboard and admin (what was built)

| page | path | index | notes |
| --- | --- | --- | --- |
| landing (Arabic) | `/api` | yes | title «API أسعار الأدوية في مصر 2026 \| بيانات محدثة للمطورين والشركات», hero + two CTAs, live coverage from the dataset (same source as `/meta`), "what you get" field table, six value cards, five use cases, plan cards **from `api.plans`**, FAQ with FAQPage JSON-LD, embedded request form; BreadcrumbList; hreflang ar/en; ISR 1 h |
| landing (English) | `/api/en` | yes | same content in English, `hreflang` both ways |
| sample explorer | `/api/sample` | **noindex** | endpoint picker, parameters, live JSON from `/api/v1/sample/*`, copy-ready curl / JavaScript / Python / PHP / Dart; one client component |
| documentation | `/api/docs` | yes | English, rendered at build time from `openapi.yaml` (no Scalar/Redoc bundle: our own renderer, styled with the site tokens): getting started, authentication, pagination, errors, rate limits, delta-sync guide with a sync loop, every operation (parameters, responses, example, curl), every schema as a field table, changelog; `/api/openapi.yaml` serves the file |
| request access | `/api/request-access` | yes | name, company, e-mail, phone/WhatsApp, use case, volume, plan, preferred contact; honeypot + 5 requests/day per network; writes `api.access_requests`, e-mails the admin (Resend); `?plan=` preselects; WhatsApp link when `WHATSAPP_NUMBER` is set |
| license terms | `/api/terms` | yes | Arabic with an English summary: license, no resale/redistribution (+ canary disclosure), attribution, fair use, SLA table from `api.plans`, data accuracy (provenance: published Egyptian price lists/directories and manufacturers, verified against published sources), medical disclaimer, payment/termination, changes |
| developer dashboard | `/developer` | noindex | e-mail magic link (`/developer/login` → `/developer/login/verify?token=`, a page with one confirm button so mail scanners that pre-fetch links cannot consume the token), plan and quota with a progress bar, keys (create / rotate with 24 h overlap / revoke with inline confirmation; the key is shown once), 30-day usage chart, top endpoints, alerts, docs links, logout |
| admin | `/admin/api` | noindex | e-mail + password login (`api.admin_users`: scrypt hashes, 8 failures lock the account 15 min, 10 attempts/min per network; accounts are created with `node scripts/api-admin.mjs admin:create`, the password is printed once); requests (approve → creates the client, e-mails the applicant a dashboard invitation; reject), clients list, client page (status, plan, manual billing: paid-until + invoice reference + notes, IP allowlist, keys issue/revoke, usage, alerts), plans editor (limits, prices, features, visibility) |

Migration `0047_api_logins.sql`: `api.login_tokens` (one-time, 15 min, hash stored), `access_requests.contact_pref`, `clients.last_login_at`.
Sessions: signed httpOnly cookies (`dw_dev`, `dw_admin`, 30 days, HMAC with `API_SECRET`), no session table.
Environment added: `WHATSAPP_NUMBER`, `API_DEV_LOGIN_LINKS` (local only: shows the developer magic link on the page when no mailer is configured; ignored unless the Host is localhost).

Languages: the public API pages exist twice, Arabic under `/api/…` (site chrome) and English under `/api/en/…` (English chrome), each linking only to pages of its own language, with `hreflang` pairs. The switch (`/api/lang/{ar|en}?next=…`) lands on the counterpart page and stores the choice in the `dw_lang` cookie, which the dashboard and login pages (`/developer/…`) follow for chrome and strings. Admin pages stay Arabic.
Dependency added: `js-yaml` (the docs renderer).

Things to know: the admin and developer logins depend on e-mail delivery (`RESEND_API_KEY`); without it, links appear on the page only when `API_DEV_LOGIN_LINKS=true`, which must never be set in production. Approval does not e-mail a key: the client creates it in the dashboard, so no key ever travels by mail.
