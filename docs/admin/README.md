# Site admin area (settings without a redeploy)

A professional admin area at `/admin` to change the live site without deploying: branding (favicon),
Google Analytics, site-verification codes, SEO defaults, contact + social links, and an audit log.
It shares the existing admin login (`/admin/api/login`, `api.admin_users`, the `dw_admin` session).

## How it works

- **Storage** (migration `0050_api_site_settings.sql`, in the `drug_home_app` repo, applied to the DB):
  `api.site_settings` (key → jsonb), `api.site_settings_audit` (old → new, who, when), `api.site_assets`
  (favicon bytes). Written by admin server actions with the write-capable role `api_app`; read by the
  public site with its read-only role `web_reader` through the `web.site_settings` / `web.site_assets`
  views. Saving calls `revalidateTag('site-settings')`, so the live site updates within seconds.
- **Asset storage note:** the generated favicon bytes are stored in the database (`api.site_assets`),
  not Supabase Storage, because no Supabase service-role/storage key exists in the environment and
  adding one is a sensitive credential. Same guarantees (survives deploys, stable URLs, cached,
  tag-revalidated). The read/write is behind a thin boundary (`lib/settings/read.ts`, `write.ts`), so a
  switch to a Storage bucket is a one-file change if a service key is added.
- **Security:** `/admin` is a separate route group (no public chrome), noindex, blocked in robots.txt.
  Every page and server action re-checks the admin session server-side (`requireAdminSession` /
  `currentAdmin`); a missing or disabled admin is rejected. Admin sessions time out after **12 hours**
  (developer sessions stay 30 days). Server actions are CSRF-safe via Next's same-origin check.

## Sections

| section | what it changes |
| --- | --- |
| Dashboard | server health + live commit, data freshness, counts, search-index size/build, API client/key counts, most-visited drugs (cumulative — there is no per-week or "most-searched" counter yet; stated on the card) |
| Branding | favicon upload (PNG/JPG, square, ≥512, ≤2 MB; `sharp` generates favicon.ico + icon-48/96/192/512 + apple-touch-icon; preview in a tab, a phone home screen, and a Google row) |
| Analytics & verification | GA4 Measurement ID (G-XXXXXXXXXX); Google + Bing verification codes |
| SEO defaults | home title, meta description, title suffix, default OG text — live counters + a Google preview |
| Contact | contact email, WhatsApp, social links (used by the footer) |
| Audit log | every change, old → new, who, when |

## Favicon serving

Stable root route handlers — `/favicon.ico`, `/icon-48.png`, `/icon-96.png`, `/icon-192.png`,
`/icon-512.png`, `/apple-touch-icon.png`, `/site.webmanifest` — serve the uploaded icon (cached,
revalidated by the tag) or the built-in brand mark rendered to that size. `Cache-Control:
public, max-age=86400` (not immutable, so a change propagates). The `<head>` carries
`<link rel="icon" href="/favicon.ico" sizes="48x48">`, `icon-192` PNG, `apple-touch-icon` and the
manifest. `favicon.ico` is a real ICO (16/32/48 PNG payloads packed by hand — `sharp` cannot write
ICO). The old `src/app/icon.svg` was removed after the routes were verified.

## Google Analytics 4

Loaded on every page view — no cookie-consent gate and no cookie notice (product decision, 2026-10-22:
so Google's tag detector and GA4 Realtime see the tag). `anonymize_ip`, `allow_google_signals:false`,
`allow_ad_personalization_signals:false`, automatic page_view off — we send `page_view` ourselves with
the **path only**, never `?q=` or any query string (`lib/analytics.ts#pageViewParams`). Events:
`search_used`, `voice_search_used`, `toggle_info_language` (more are easy to add via `track()`). Not
loaded on `/admin`, and not loaded at all when the GA4 id is left empty. The privacy page has an honest
GA section with how to opt out (browser settings or Google's opt-out add-on).

> **Required user action in GA4:** turn OFF enhanced measurement "Site search" in the GA4 property —
> Google can otherwise capture `q=` server-side, which code here cannot prevent.

## Verify

- `scripts/admin-verify.mjs` (login → each section → live checks): SEO title reflected on the live home
  with no redeploy; favicon changes after upload; verification meta tags on home; **GA loads on the
  first visit with no click and no cookie notice**; audit records changes.
  Screenshots in `screenshots/`, final home `<head>` in `home-head.html`.
- `tests/settings.test.ts`: verification-token parsing (bare + pasted `<meta>`), GA id / WhatsApp
  validation, **no query string in the GA page_view**, favicon validation (rejects SVG / non-square /
  too small), icon generation (every size + a valid ICO header), built-in fallback.
- Lighthouse mobile before/after in `lighthouse/` — see the main report.

## Production note (same as the search index)

Nginx currently appends `Cache-Control: no-cache` to every response, so the icon routes' `max-age`
only takes effect once the `/_next/static/`-style location block is extended (DEPLOY.md). Correctness
is unaffected; only cache lifetime.

## Lighthouse mobile (before → after, median of 3; CLS must not get worse)

| page | score before → after | CLS | LCP (ms) |
| --- | --- | --- | --- |
| `/` | 90 → 90 | 0 → **0** | 3576 → 3620 |
| `/dawa/alerid-10mg-30-f-c-tabs` | 89 → 89 | 0 → **0** | 3757 → 3751 |

Scores held at 90/89 with CLS 0 for the admin brief (table above). GA now loads on every visit via
`afterInteractive` (non-blocking and `send_page_view:false`, so no extra layout work), so expect at
most a point of movement on performance now that the gtag script loads for every visitor. Runs in
`lighthouse/`.

> **Proof artifacts note:** `home-head.html` and `screenshots/` were captured mid-test, so they show
> placeholder values — the verification tokens (`test_google_verification_token_123`, `BINGTOKEN123`)
> and the pink test favicon are from `scripts/admin-verify.mjs`, not real settings. The database was
> reset to empty afterwards, so the deployed site starts with the code defaults and no custom icon.
