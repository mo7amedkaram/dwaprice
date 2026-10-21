# Sample isolation proof (phase 2)

Base URL `http://localhost:3100/api/v1`, 2026-10-21T14:52:54.601Z. 731 probes against the sample endpoints, **0 leak(s)**.

| check | probes | leaks |
|---|---:|---:|
| GET /sample/drugs/{id} with 150 random non-sample ids → must be 404 | 150 | 0 |
| GET /sample/drugs/by-barcode/{barcode} with 100 non-sample barcodes → must be [] | 100 | 0 |
| GET /sample/drugs?q= with non-sample product names and short prefixes → results ⊆ sample | 312 | 0 |
| GET /sample/drugs?company= / ?ingredient= of non-sample products → results ⊆ sample | 115 | 0 |
| GET /sample/drugs/{id}/alternatives for all 50 sample drugs → alternatives ⊆ sample | 50 | 0 |
| GET /sample/drugs (all pages) → exactly the 50 sample ids | 1 | 0 |
| GET /sample/price-changes → events of sample drugs only | 1 | 0 |
| GET /sample/companies and /sample/ingredients → only those of sample drugs | 2 | 0 |

By construction: every sample query in `src/lib/api/drugs.ts` carries `s.id in (select id from api.sample_drugs)` (search runs only over those 50 records; alternatives, barcode, feed, companies and ingredients are joined to the same table). The table is read-only for the API role (`docs/api/phase2/api_boundary.txt`).
