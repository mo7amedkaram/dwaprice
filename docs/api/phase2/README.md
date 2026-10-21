# Drug Prices API — phase 2 deliverables (access control and the safe sample)

| what | where |
| --- | --- |
| test results (unit + integration) | `test-results.txt` |
| proof that the sample cannot return a non-sample drug | `sample-isolation-proof.md` (≈ 700 probes) + the integration test "the sample cannot reach the catalogue" |
| one response from every endpoint (sample, authenticated, errors, Enterprise) | `responses/INDEX.md` and `responses/*.json` |
| security boundary of the API role `api_app` | `api_boundary.txt` (60/60) |
| design | `../../API_SPEC.md` (§16 = what phase 2 built), `../../../openapi.yaml` |

## Reproduce

```
npm run build && npx next start -p 3100
node scripts/api-admin.mjs client:create --company "X" --contact "Y" --email x@y.z --plan starter
node scripts/api-admin.mjs key:create <clientId>                # key printed once
API_BASE_URL=http://localhost:3100/api/v1 npx vitest run tests/api-integration.test.ts
API_BASE_URL=http://localhost:3100/api/v1 node scripts/api-sample-proof.mjs
API_BASE_URL=... API_KEY_STARTER=... API_KEY_ENTERPRISE=... node scripts/api-responses.mjs
API_DATABASE_URL=... node db/checks/api_boundary.mjs
```
