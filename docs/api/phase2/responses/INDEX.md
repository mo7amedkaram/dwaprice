# Captured responses (phase 2)

Base URL: `http://localhost:3100/api/v1`, captured 2026-10-21T14:53:51.561Z. Long arrays are cut to a few items in these files.

| file | request | status | items |
|---|---|---:|---:|
| `sample-meta.json` | `GET /sample/meta` | 200 | 1 |
| `sample-drugs-list.json` | `GET /sample/drugs?limit=3` | 200 | 3 |
| `sample-drugs-search-misspelled.json` | `GET /sample/drugs?q=%D8%A7%D9%88%D8%AC%D9%85%D9%86%D8%AA%D9%86` | 200 | 3 |
| `sample-drugs-search-non-sample-name.json` | `GET /sample/drugs?q=%D8%A8%D8%A7%D9%86%D8%A7%D8%AF%D9%88%D9%84` | 200 | 0 |
| `sample-drug-get.json` | `GET /sample/drugs/augmentin-1gm-14-tablets` | 200 | 1 |
| `sample-drug-get-non-sample-id.json` | `GET /sample/drugs/congestal-20-tabs` | 404 | - |
| `sample-drugs-by-barcode.json` | `GET /sample/drugs/by-barcode/6221051011317` | 200 | 0 |
| `sample-drug-alternatives.json` | `GET /sample/drugs/augmentin-1gm-14-tablets/alternatives?strength=any` | 200 | 3 |
| `sample-drug-price-history.json` | `GET /sample/drugs/augmentin-1gm-14-tablets/price-history` | 200 | 2 |
| `sample-price-changes.json` | `GET /sample/price-changes?since=2026-10-19T14:53:30Z` | 200 | 0 |
| `sample-companies.json` | `GET /sample/companies?limit=5` | 200 | 5 |
| `sample-ingredients.json` | `GET /sample/ingredients?limit=5` | 200 | 5 |
| `meta.json` | `GET /meta` | 200 | 1 |
| `drugs-list.json` | `GET /drugs?limit=3&dosage_form=syrup&sort=price` | 200 | 3 |
| `drugs-search.json` | `GET /drugs?q=%D9%83%D9%88%D9%86%D8%AC%D8%B3%D8%AA%D9%84&limit=3` | 200 | 3 |
| `drugs-filter-atc-updated.json` | `GET /drugs?atc=J01C&prescription_status=prescription&limit=3` | 200 | 3 |
| `drug-get.json` | `GET /drugs/congestal-20-tabs` | 200 | 1 |
| `drug-get-not-found.json` | `GET /drugs/no-such-drug` | 404 | - |
| `drugs-by-barcode.json` | `GET /drugs/by-barcode/6221051011317` | 200 | 1 |
| `drug-alternatives.json` | `GET /drugs/augmentin-1gm-14-tablets/alternatives?limit=3` | 200 | 3 |
| `drug-price-history.json` | `GET /drugs/interofer-100mg-5ml-5-amp-for-i-v-inj/price-history` | 200 | 3 |
| `price-changes.json` | `GET /price-changes?since=2026-10-19T14:53:30Z&limit=3` | 200 | 0 |
| `price-changes-since-too-old.json` | `GET /price-changes?since=2025-12-25T14:53:30Z` | 400 | - |
| `companies.json` | `GET /companies?q=eva&limit=3` | 200 | 3 |
| `ingredients.json` | `GET /ingredients?q=%D8%A8%D8%A7%D8%B1%D8%A7&limit=3` | 200 | 3 |
| `drugs-list-page-1.json` | `GET /drugs?limit=2&company=sigma` | 200 | 2 |
| `drugs-list-page-2.json` | `GET /drugs?limit=2&company=sigma&cursor=eyJmIjoiZTgwZTQzYTkyZGQ1YmI3OSI…` | 200 | 2 |
| `error-401-no-key.json` | `GET /drugs?limit=1` | 401 | - |
| `error-401-bad-key.json` | `GET /drugs?limit=1` | 401 | - |
| `error-400-validation.json` | `GET /drugs?limit=500&dosage_form=pill` | 400 | - |
| `error-400-invalid-cursor.json` | `GET /drugs?cursor=abc.def` | 400 | - |
| `error-403-plan-feature.json` | `POST /exports` | 403 | - |
| `etag-304.json` | `GET /meta` | 304 | - |
| `export-create.json` | `POST /exports` | 202 | 1 |
| `export-get.json` | `GET /exports/22bf7076-7bcb-4101-ac75-04c27e927cbc` | 200 | 1 |
| `export-download-csv.json` | `GET /exports/{id}/download (signed)` | 200 | 14729 |
| `webhook-create.json` | `POST /webhooks` | 201 | 1 |
| `webhooks-list.json` | `GET /webhooks` | 200 | 1 |
| `webhook-test.json` | `POST /webhooks/d93c9b94-f4e9-4d84-8ea4-7aa8b3caf969/test` | 200 | 1 |
| `webhook-delete.json` | `DELETE /webhooks/d93c9b94-f4e9-4d84-8ea4-7aa8b3caf969` | 204 | - |
