# Drug Prices API — phase 3 deliverables (public pages, dashboard, admin)

| what | where |
| --- | --- |
| screenshots of every page at 360 and 1280 px: home (with the API section), landing, sample explorer, docs, request access, terms — each in Arabic (`<page>`) and English (`<page>-en`) — developer login, admin login | `screenshots/<page>-{360,1280}.png` |
| language flow: Arabic docs → English switch → «Try the sample» stays English (explorer run in English) → developer login in English chrome → back to Arabic → dashboard login in Arabic | `screenshots/lang-1-sample-en-from-docs-1280.png`, `lang-2-developer-login-en-1280.png`, steps in `shots-report.json` |
| the sample explorer after a misspelled search («اوجمنتن») with the Python snippet tab | `screenshots/sample-explorer-result-1280.png` |
| end-to-end flow: request access → admin e-mail + password login (a wrong password first: error shown, e-mail kept) → approve → client page → key issued once → admin pages without a session redirect to the login → developer magic link → create / rotate / revoke → the same dashboard in English → logout | `screenshots/flow-1…8-*.png` (`flow-7b-developer-dashboard-en-1280.png` is the English dashboard), steps and head checks in `shots-report.json` |
| what was built, per page | `../../API_SPEC.md` §17 |

Head checks (from `shots-report.json`): `/api` and `/api/en` are indexable with FAQPage (8 Q&A) + BreadcrumbList JSON-LD and `hreflang` ar / en / x-default; `/api/docs`, `/api/request-access`, `/api/terms` and their `/api/en/…` counterparts indexable with BreadcrumbList and `hreflang` pairs; `/api/sample`, `/api/en/sample`, `/developer/*`, `/admin/*` are `noindex,follow`. No horizontal overflow on any page at 360 or 1280 px; every English page renders inside the English chrome (`chrome: "en"` in the report).

Reproduce (the flows need `API_DEV_LOGIN_LINKS=true` in `.env.local` — never in production — and an admin account: `node scripts/api-admin.mjs admin:create --email <e-mail> --name <name> --password <pw>`, passed as `ADMIN_EMAIL_FOR_TEST` / `ADMIN_PASSWORD_FOR_TEST`):

```
npm run build && npx next start -p 3100
BASE_URL=http://localhost:3100 ADMIN_EMAIL_FOR_TEST=<e-mail> ADMIN_PASSWORD_FOR_TEST=<pw> node scripts/phase3-shots.mjs
npx vitest run tests/api-pages.test.ts
```
