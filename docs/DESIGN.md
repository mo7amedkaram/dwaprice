# Design system & SEO foundation — "Clinical Clean" (part 2)

Premium, white, calm, medical. Arabic first (`<html lang="ar" dir="rtl">`), English drug
names and ingredients set in Inter. Review every component at **`/design`** (noindex);
screenshots: `docs/screenshots/design-{360,768,1280}.png` (`npm run screenshots`).

Stack: Next.js 16.4 (App Router, Turbopack) · React 19.3 · TypeScript 5.9 · Tailwind CSS 4.3 ·
`pg` against the read-only `web` schema (DATA_PLAN.md).

## 1. Tokens — one place

All tokens live in **`src/styles/tokens.css`** (a Tailwind v4 `@theme` block). Tailwind turns each
into a CSS variable on `:root` and a utility class. Tailwind's default palette is removed
(`--color-*: initial`), so a class like `bg-red-500` does not exist: components can only use
these names, and no component contains a hex value. (The one exception is `src/app/icon.svg`,
a static favicon file that cannot read CSS variables; it mirrors `primary`, `bg` and `primary-tint`.)

### Colors

| token | light | dark | utilities | use |
| --- | --- | --- | --- | --- |
| `primary` | `#0D7C66` | `#3CC9A7` | `bg-primary`, `text-primary`, `border-primary`… | buttons, links, focus ring, chart line |
| `primary-hover` | `#0A6553` | `#5FD8BB` | `hover:bg-primary-hover` | hover of primary |
| `primary-tint` | `#E6F4F0` | `#11362F` | `bg-primary-tint` | selected/hover backgrounds, tags |
| `ink` | `#0F172A` | `#E2E8F0` | `text-ink` | main text, headings, prices |
| `text-2` | `#475569` | `#94A3B8` | `text-text-2` | secondary text, labels |
| `muted` | `#5B6B82` | `#8391A8` | `text-muted` | hints, disabled, old price, placeholders |
| `bg` | `#FFFFFF` | `#0F172A` | `bg-bg` | page background |
| `surface` | `#F8FAFC` | `#1E293B` | `bg-surface` | table heads, footer, empty states |
| `border` | `#E2E8F0` | `#334155` | `border-border` | every border and divider |
| `on-primary` | `#FFFFFF` | `#0F172A` | `text-on-primary` | text on a primary background (buttons, active chips) |
| `figure` | `#F8FAFC` | `#CBD5E1` | `bg-figure` | behind product photos (white images would glare in the dark) |
| `down` / `down-bg` | `#15803D` / `#DCFCE7` | `#4ADE80` / `#163A26` | `text-down`, `bg-down-bg` | price decrease, **cheapest** |
| `up` / `up-bg` | `#B91C1C` / `#FEE2E2` | `#F87171` / `#4A1D1D` | `text-up`, `bg-up-bg` | price increase |
| `rx` / `rx-bg` | `#B45309` / `#FEF3C7` | `#FBBF24` / `#422F0B` | `text-rx`, `bg-rx-bg` | prescription-only, warnings, unavailable |

### Theme (light / dark / device)

* The light values are the `@theme` block; the dark values are the same variables redefined
  under `html[data-theme="dark"]` and, for the no-JavaScript case, under
  `@media (prefers-color-scheme: dark) { html:not([data-theme="light"]) }` (both in `tokens.css`,
  written twice on purpose: `light-dark()` is not safe on older phones). `color-scheme` follows, so
  native controls and scrollbars match. Every utility compiles to `var(--color-*)`, so components
  need no dark variants; the `dark:` variant exists (`@custom-variant` in `globals.css`, keyed on the
  attribute, not the device) for the rare exception such as `dark:brightness-90` on product photos.
* `src/lib/theme.ts` holds the storage key (`dw_theme`: `light` | `dark`, absent = follow the
  device) and the inline script the root layout puts in `<head>`: it sets `data-theme` (effective)
  and `data-theme-choice` (what was picked) on `<html>` before the first paint, so there is no flash
  (`scripts/theme-check.mjs` proves the attribute is set while the document is still `loading`).
  `<html>` carries `suppressHydrationWarning` for that attribute.
* `ThemeToggle` (client): a `role="group"` of three 44 px buttons with `aria-pressed` (device /
  light / dark) in the header from `sm` and in the footer; one cycling button below `sm` in the
  header. All instances share the attributes on `<html>` (`useSyncExternalStore`, server snapshot
  "system"), follow the device live while on "system" (`matchMedia` change) and other tabs
  (`storage` event), and update `<meta name="theme-color">`. Switching animates only through the
  existing `transition-colors`; `prefers-reduced-motion` stops transitions site-wide.
* Light contrast: `muted`, `down` and `up` were darkened on 2026-10-21 (from `#94A3B8` / `#16A34A` / `#DC2626`)
  because Lighthouse flagged them as text below 4.5:1 (company lines in drug rows, price-up badges); now 5.4 / 4.6 / 5.3 (muted also >= 4.8 on the cheapest-row tint).
* Dark contrast (checked, WCAG AA): `ink`/`text-2`/`muted` on `bg` 14.5 / 7.0 / 5.6, on `surface`
  11.9 / 5.7 / 4.6; `primary` on `bg` 8.6; `on-primary` on `primary` 8.6; `down`/`up`/`rx` on their
  tints 7.2 / 5.1 / 7.7; `text-2` on `primary-tint` 5.1.

### Type

| role | mobile / desktop (≥ 768 px) | utility | line height |
| --- | --- | --- | --- |
| H1 | 24 / 32 px | `type-h1` | 1.4 |
| H2 | 20 / 24 px | `type-h2` | 1.4 |
| body | 16 px | `type-body` (default) | 1.8 |
| small | 13 / 14 px | `type-small` | 1.6 |
| big price | 26 / 32 px | `type-price` (tabular) | 1.2 |

* Fonts are self-hosted by `next/font/google` (`src/app/layout.tsx`): **IBM Plex Sans Arabic**
  (Arabic + Latin subsets) for UI and body, **Inter** (Latin) for English names. Weights
  **400 / 500 / 600 only**, `display: swap`. Exposed as `--font-plex-arabic` / `--font-inter`;
  `font-sans` = Plex, and any element with `lang="en"` switches to Inter (`:lang(en)` in `globals.css`).
* Arabic: `letter-spacing: 0` everywhere; body line height 1.8, headings 1.4.
* **Every price uses tabular figures**: the `price` utility (`font-variant-numeric: tabular-nums;
  white-space: nowrap`) — built into `<Price>`, `type-price` and the chart labels.
* Numbers use Latin digits (as on Egyptian packs and price lists); currency `ج.م`; dates
  `21 أكتوبر 2026` (`ar-EG-u-nu-latn`). Helpers in `src/lib/format.ts`.

### Shape and layout

| token | value | utility |
| --- | --- | --- |
| spacing grid | 4 px (`--spacing: 0.25rem`, Tailwind default) | `p-4` = 16 px … |
| card radius | 12 px | `rounded-card` |
| control radius | 10 px / 8 px | `rounded-control` / `rounded-control-sm` |
| container | 1200 px, 16 px gutter (24 px from md) | `max-w-site` via `<Container>` |
| price column | 360 px | `var(--width-price-card)` |
| tap target | 44 px | `tap` (min width and height) / `min-h-11` |

## 2. RTL rules

* `<html lang="ar" dir="rtl">`. **Logical properties only**: `ms-/me-/ps-/pe-`, `start-/end-`,
  `text-start/text-end`, `border-s/e`, `rounded-s/e`. No `ml-`, `mr-`, `left-`, `right-`, `text-left`.
* Latin runs go in **`<Ltr>`** (`<span dir="ltr" lang="en">`): inline inside Arabic text, or
  `<Ltr block>` for a line of its own (an RTL block holding the LTR run, so it aligns with the
  Arabic line above it).
* Percentages and other mixed runs inside Arabic badges are wrapped in `dir="ltr"` (otherwise
  "82.9%" renders as "%82.9").
* Direction icons are logical: `ChevronEndIcon` / `ChevronStartIcon` flip with `rtl:-scale-x-100`.
* Charts keep time left → right (`dir="ltr"` on the plot) on RTL pages.

## 3. Responsive rules

* Mobile first, one column. `md` (768 px): two columns. `lg` (1024 px): main content + sticky
  price card — `grid lg:grid-cols-[minmax(0,1fr)_var(--width-price-card)]`, card `lg:sticky lg:top-6`.
* **Grids of cards/rows must declare `grid-cols-1`** (`minmax(0, 1fr)`): an implicit `auto`
  column grows to the width of truncated (`nowrap`) names and causes horizontal scroll.
* Tables become one card per row below `md` (`AlternativesTable`), keeping table semantics via
  explicit ARIA roles.
* No horizontal scroll at 360 px: `npm run screenshots` reports `overflowX` and any visible
  interactive element under 44 px for each width (all clear at 360 / 768 / 1280).

## 4. Components (`src/components`)

| component | what it is | accessibility |
| --- | --- | --- |
| `Header` | logo, search, nav (التصنيفات · أحدث الأسعار); search is in the header from md, and a **sticky bar under it on mobile** | `<header>`, `<nav aria-label>`, skip link "تخطَّ إلى المحتوى" in the layout |
| `SearchBox` (client) | search with suggestions from `/api/search`; submit → `/search?q=` | WAI-ARIA 1.2 combobox + listbox, ↑/↓/Enter/Esc, label, `role="search"` |
| `Footer` | about text, medical disclaimer, link groups | `<footer>`, labelled `<nav>`s |
| `Breadcrumbs` | trail + `BreadcrumbList` JSON-LD | `<nav aria-label="مسار التنقل">`, `<ol>`, `aria-current="page"` |
| `PriceCard` | current price, old price, change badge, unit price, units, last update, listing status, unverified notice | section with label, `<dl>`, `<time dateTime>`, change direction in text for screen readers |
| `PriceChangeBadge` | ↑ red / ↓ green percentage | `sr-only` "زيادة / انخفاض" |
| `PriceHistoryChart` | step chart: SVG line + HTML labels (readable at any width), no chart library | text summary + full data table (`sr-only`), visual layer `aria-hidden` |
| `DrugRow` | Arabic name, English name, ingredient, detail, price; whole row is the link (≥ 64 px) | one link per row, visible focus |
| `AlternativesTable` | المثائل (same ingredient: **cheapest highlighted**, same/different strength, difference vs the current drug) and, with `substitute` + `showDiff={false}`, البدائل (different ingredient: price + unit price, no savings badge) | `<table>` with caption, `scope="col"`, roles kept in the mobile card layout |
| `InfoLangToggle` (client) | «عربي \| English» for the معلومات الدواء section only (part 1) | `role="group"` + `aria-pressed`; sets `html[data-info-lang]`, CSS shows `.info-ar`/`.info-en` |
| `Accordion` | native `<details>/<summary>` | keyboard + screen reader native; content stays in HTML and works without JS |
| `Badge` / `Tag` | status label (neutral, primary, down, up, rx, muted) / linked chip | `Tag` is a 44 px link |
| `EmptyState` | icon, title, text, actions | heading level configurable |
| `Pagination` | prev / numbers / next, `?page=N` (page 1 has no parameter) | `<nav aria-label>`, `aria-current="page"`, `rel=prev/next` |
| `ThemeToggle` (client) | theme switch: device / light / dark (see §1 Theme) | `role="group"` + `aria-pressed` buttons, or one cycling button with a state-bearing `aria-label`; 44 px; keyboard (Enter/Space) |
| `Logo`, `Container`, `Ltr`, `Price`, `SectionTitle`, `buttonClass()`, `JsonLd`, icons | primitives | buttons ≥ 44 px, focus ring `outline-primary` |

Every interactive element has a visible focus state (`:focus-visible` 2 px primary outline,
2 px offset) and is at least 44 × 44 px.

## 5. SEO rules

### Metadata (`src/lib/seo/metadata.ts`)

`buildMetadata({ kind, path, title, description, indexable?, page?, filtered?, image? })` returns
title, description, **canonical** (absolute, on `SITE_URL`), robots, Open Graph (`ar_EG`,
site name, URL) and Twitter tags. The layout appends ` | دليل الأدوية المصري` (`title.template`,
`TITLE_SUFFIX`) unless the title would exceed 60 characters; then the title stands alone (Google shows
the site name separately). **Site name** (`SITE.name`, part 4): «دليل الأدوية المصري», used identically by
the WebSite JSON-LD `name`, `og:site_name`, the title suffix, the logo and the footer. Google was
showing "dwaprice.com" instead (2026-10-23), so the signals were tightened: the **home `<title>` starts
with the site name** («دليل الأدوية المصري | أسعار الأدوية في مصر محدثة يومياً», `HOME_TITLE_DEFAULT`),
the WebSite/Organization `url` is the home page with its trailing slash, and `alternateName` carries
only brand spellings (`dwaprice`, `Dwaprice`, «دليل الادوية المصري») — never the bare domain, which must
not be offered as a name candidate. Both objects are output on the home page only; validate with
validator.schema.org (`scripts/site-name-check.mjs` posts the rendered home HTML to it).
`pageText.*` builds the Arabic titles and descriptions of hubs, index pages, A–Z, last prices
and search; drug, alternatives and uses texts live in `src/lib/drug/logic.ts`. Pages 2+ of a list
append " — صفحة N" to the title and "(صفحة N)" to the description, so every URL has its own.
`canonicalPath` points a filtered list at its clean URL.

**Indexing (`shouldIndex`)** — `noindex, follow` when any of:

* `kind` is `search` (result pages) or `internal` (`/design`);
* `indexable === false` (from `web.drug_cards.indexable`, hub views' `indexable`);
* `filtered` (any filter/sort query);
* `page > 1`. **Paginated pages keep a self-referencing canonical** (`?page=N`), never page 1.

Every page has exactly one Arabic H1. 404 pages get Next's own `noindex`.

### JSON-LD (`src/lib/seo/jsonld.ts`, render with `<JsonLd>`)

| helper | used on | content |
| --- | --- | --- |
| `websiteJsonLd()` | home page | `WebSite` + `SearchAction` → `/search?q={search_term_string}` |
| `organizationJsonLd()` | home page | `Organization` name, alternateName, URL, logo, description, areaServed, contactPoint |
| `breadcrumbJsonLd()` | pages with `<Breadcrumbs>` | `BreadcrumbList` |
| `drugJsonLd()` | drug pages | `Drug`: name, alternateName (Arabic), activeIngredient, nonProprietaryName, dosageForm, administrationRoute, manufacturer, prescriptionStatus (`PrescriptionOnly`/`OTC`), and **`offers` (price, `priceCurrency: EGP`, availability from listing status) only when a price exists** |
| `faqJsonLd()` | uses pages | `FAQPage` **only from real Q&A content**; returns `null` (nothing rendered) when there is none |

### robots.txt (`src/app/robots.ts`)

```
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /account
Sitemap: https://dwaprice.com/sitemap.xml
```

Search results, filtered lists and `/design` are **not** disallowed on purpose: they are
`noindex,follow`, and a disallowed URL is never fetched, so its noindex would never be read nor its
links followed (part 4 removed the part 2 `Disallow: /search?`).

### Sitemaps

* `/sitemap.xml` is a **sitemap index** (`src/app/sitemap.xml/route.ts`) pointing at
  `/sitemaps/<type>-<n>.xml` (`src/app/sitemaps/[file]/route.ts`).
* Types: `static`, `drugs`, `alternatives`, `uses`, `ingredients`, `companies`, `categories`, `atc`,
  `letters`; each split at **45,000 URLs** per file. **Only `indexable = true` pages**
  (`web.sitemap_drugs`, hub views), page 1 of lists only, no pack variants that canonicalise elsewhere.
* `lastmod`: drugs = latest of `price_updated_date` and the row's `updated_at`; hubs = latest
  price date of their indexable products; the index uses each file's maximum.
* Part 4: static 13 (home, 5 index pages, last prices, 6 static pages) · atc 603 · letters 22, on top
  of the drug, alternatives, uses and hub files (see `docs/part4/crawl-report.md`).
* Cached for a day; refreshed by the `sitemap` tag.

### Redirects

`src/proxy.ts` (Next 16 proxy, Node runtime) answers **301** for retired slugs
(`web.slug_lookup`, `is_current = false` → `current_slug`) on `/dawa/*`, `/active-ingredient/*`,
`/sharika/*`, `/category/*`, keeping sub-paths (`/badael`, `/dawaei-estemal`) and the query string.
ATC URLs are keyed by the code (never retired); the page itself 308s a wrong or missing name suffix
to `/atc/{code}-{name}`.
The retired-slug map is held in memory and refreshed every 10 minutes, so requests do not wait
on the database. Verified with a temporary retired slug (301 → current slug, then removed).

### Error pages

`not-found.tsx` (styled 404 with search), `error.tsx` (styled 500 inside the layout, retry),
`global-error.tsx` (500 when the layout itself fails).

## 6. Rendering and caching

| rule | how |
| --- | --- |
| top drugs generated at build | `generateStaticParams` returns `getTopDrugSlugs()` (`STATIC_TOP_DRUGS = 200`, by `visit_count`, `search_count` from `web.popular_drugs`) |
| everything else on demand, cached a day | `export const revalidate = 86400` and `export const dynamicParams = true` in each page file (literal value required) |
| data cached with tags | loaders in `src/lib/data/*` wrap queries in `unstable_cache` with `tags: ['catalog', 'drug:<slug>']` etc. (`src/lib/cache.ts`) |
| refresh one drug when its price changes | `POST /api/revalidate` with header `x-revalidate-secret: $REVALIDATE_SECRET` and `{"drugs":["<slug>"]}` or `{"tags":["drug:<slug>","prices"]}`; uses `revalidateTag(tag, "max")` (stale-while-revalidate). A drug tag also refreshes `prices` and `sitemap` |

Pattern for the drug route (part 3):

```tsx
export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return (await getTopDrugSlugs()).map((slug) => ({ slug }));
}
```

* `unstable_cache` entries survive deployments (`.next/cache`): **change the key prefix**
  (e.g. `['drug-page-v2', slug]`) when a loader's output shape changes.
* `unstable_cache` items are capped at 2 MB. The drugs sitemap list is ~1 MB at 13k URLs; past
  ~25k indexable products it would silently stop caching — then cache per sitemap file
  (type + chunk) instead of per type.
* Hub lists: resolve the hub row first, then list `web.drug_cards` **with the key as a literal**
  (`where category_key = $1 order by sort_name limit 48`), so the planner can use the
  `(category_key, sort_name)` index (1 ms instead of 55 ms for the largest category).

## 7. Data access

* `src/lib/db` — `pg` pool for `WEB_DATABASE_URL` (role `web_reader`, Supavisor transaction mode),
  imported only through `server-only` modules; DATE columns are kept as `YYYY-MM-DD` strings.
  TLS: set `WEB_DATABASE_CA` (Supabase root CA, PEM) to verify the pooler certificate; without it the
  connection is encrypted but unverified.
* The browser reaches data **only** through `GET /api/search?q=` (2–80 chars, top 10, one call to
  `web.search_drugs`, `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`).
  Everything else is server-rendered.
* No Supabase key and no service-role key exist in this app.
* Environment: `.env.example` (`WEB_DATABASE_URL`, `WEB_DATABASE_CA`, `SITE_URL`, `REVALIDATE_SECRET`,
  `CONTACT_EMAIL`, `WEB_DB_POOL_MAX` — connections per server process, default 3).

## 8. Drug templates (part 3)

| page | route | data |
| --- | --- | --- |
| price | `src/app/dawa/[slug]/page.tsx` | `getDrugPageData(slug)` (one cached loader; tags `catalog`, `drug:<slug>`) |
| alternatives | `src/app/dawa/[slug]/badael/page.tsx` | same loader; 404 when the drug has no alternative |
| uses | `src/app/dawa/[slug]/dawaei-estemal/page.tsx` | same loader; 404 unless `hasUsesPage()` |

**Rules live in `src/lib/drug/logic.ts`** (pure, unit-tested in `tests/drug-logic.test.ts`, run `npm test`)
and are shared by `generateMetadata`, the page body (`src/lib/drug/model.ts`) and the sitemaps:

* **H1** `سعر {arabic_name or trade_name} {strength} {year}`: the short strength (text before "(") is
  added only when the name doesn't already contain its numbers, with Arabic units (`مجم`, `جم`, `مل`…)
  so it reads in order in RTL; `{year}` = the year the price was verified.
* **Title** `سعر … {year} | {English}` without the site suffix (`title.absolute`), ≤ 60 characters: tries
  the English trade name, then the shorter price-list name, else drops the English part (never cuts the
  Arabic). المثائل والبدائل page: `بدائل ومثائل {name} وأسعارها {year}`.
* **Description** from real fields (price + date, ingredients, form + company); sentences are added while
  the text stays ≤ 155 characters; a missing price is never invented.
* **Robots / canonical** (`drugRobots`): self-canonical with `indexable` from `web.drug_cards`; a
  non-canonical member of a `recognition_product_index` group gets `rel=canonical` to the group's page
  (same sub-page when it exists there) **and** `noindex, follow` (`chooseGroupCanonical`).
* **Content only from real data**: an accordion section appears only when it has a usable statement;
  descriptions flagged `description_needs_review` and statements citing price directories are not shown;
  company names lose research notes (`cleanCompanyName`); **dosing only from APPROVED rules**
  (`DosingRules`, always with reviewer, credentials, review date and sources); no FAQPage (no real Q&A).
* **Price card**: current price, previous price + change badge (`latestChange`: an event if any, else the
  catalogue), unit price (`سعر القرص/الكبسولة/…`, stored or price ÷ units), last update, and
  "سعر موثّق" when `price_verified` (not "official": most prices come from published directories). History chart + changes table only with ≥ 1 change
  (`historyPoints` merges the payload history with old → current).
* **Section order (part 6)**: hero → price card → **معلومات الدواء** → **المثائل** → **البدائل** →
  تاريخ السعر → identifiers, related, sources. One H1; the price-card button links to `/badael` labelled
  «المثائل والبدائل».
* **المثائل vs البدائل (part 6)** — two distinct ideas, exact UI wording:
  * **المثائل**: the same active ingredient(s). `groupAlternatives` → same strength first (preview on the
    drug page, and the first `/badael` section), then a "نفس المادة الفعالة بتركيز مختلف" sub-section.
    "الأرخص" marks the cheapest available product that is not another pack of the same drug (siblings are
    badged "عبوة أخرى من نفس الدواء"); other forms are badged "شكل مختلف"; shows the price difference vs the
    original in EGP and %. Note above it: «نفس المادة الفعالة والتركيز. اسأل الصيدلي قبل الاستبدال.»
  * **البدائل**: a **different** active ingredient from the same therapeutic class — `web.drug_substitutes`
    (migration 0049): same ATC level-4 code, a different ATC level-5 code, same `route_class`, single→single
    (a combination original may be matched by combinations), indexable with a price; **no ATC → no section**
    (never the broad category field). `isSubstitute` in `logic.ts` is the pure mirror of the view
    (unit-tested; a live test checks the view agrees). Sorted by price, **no savings badge** (different
    ingredients aren't price-comparable) — only price and price-per-unit. Prominent note above it:
    «مادة فعالة مختلفة من نفس المجموعة العلاجية. لا تستبدل دواءك ببديل إلا بأمر الطبيب.»
  * `AlternativesTable variant="compact"` beside/under the content on the drug page, `variant="full"` on
    `/badael`; `substitute` + `showDiff={false}` for البدائل. `AlternativesExplainer` explains both terms.
    URL `/badael` is unchanged (indexed); the sitemap is unchanged, so a drug that has بدائل but no مثائل has
    a `/badael` page that `web.sitemap_drugs.has_alternatives` (set_key based) does not list.
* **Drug-info language toggle (part 1)**: the معلومات الدواء section gets a «عربي | English» switch
  (`InfoLangToggle`). Both languages are in the server HTML — Arabic visible, English in a
  `lang="en" dir="ltr"` container — toggled by CSS on `html[data-info-lang]`, applied before paint by the
  `<head>` script (`lib/info-lang.ts`) and remembered in `localStorage`, so it carries to later drug pages
  with no request and no layout shift. English uses only English text already in the data (DailyMed/EMA/eMC
  …); blocks with no English show a "English text not available for this section" note; the dosing block
  stays Arabic (pharmacist-reviewed, never machine-translated). No switch when the drug has no English
  (`hasEnglishInfo`). Arabic stays the default for SEO; titles, meta, canonical and hreflang are unchanged.
  The rest of the page and site stay Arabic.
* **Images**: `next/image` (unoptimized, see `DrugImage`) only for `image_verified`; otherwise a placeholder icon.
* **Links to drug and hub pages use `prefetch={false}`**: prefetching an ISR page that isn't cached
  renders it on the server; on this small database one page view would trigger several extra renders.
* **Build**: `experimental.cpus = 3` and 3 pooled connections per process keep prerendering within the
  database's capacity (15 workers × 5 connections caused statement timeouts).
* **Transient network errors** (DNS, connect timeout, dropped socket) are retried twice with backoff in
  `lib/db/pool.ts`; query errors (e.g. statement timeout) are never retried.

### JavaScript budget (measured with `scripts/first-load-js.mjs`; gzip; modern browsers)

| page | first-load JS | framework part |
| --- | ---: | --- |
| `/dawa/{slug}` | 151.6 KB | React DOM 71.8 + Next router 44.1 + Turbopack runtime 4.3 |
| `/`, `/search`, listings | 146.1 KB | same |

The ~70 KB target is **not reachable with the App Router**: the framework alone is ~120 KB. All main
content is static HTML from ISR, with no client-side fetching of it (verified: 0 page-content fetches).
The legacy-browser polyfills (38.7 KB) are `noModule` and never loaded by modern browsers.

Instant search (part 6) added **~4 KB** to the first load (the combobox, the loader that owns the
worker, highlighting, the voice button). The heavy parts stay off the first load on purpose: the
search engine class is in the worker chunk, the ~379 KB index downloads only when the page is idle
or the box is used, and the voice recognition code is imported on the first microphone tap. Measured
with `scripts/first-load-js.mjs`; before/after and Lighthouse in `docs/search/README.md`.


## 9. Home, search and listing pages (part 4)

### URL map

| page | URL | indexable | notes |
| --- | --- | --- | --- |
| home | `/` | yes | revalidate 1 h; WebSite + SearchAction + Organization JSON-LD |
| search | `/search?q=` | **noindex,follow** | approximate-match notice when only tiers 4–5 matched |
| drugs A–Z | `/adwiya`, `/adwiya/{letter}?page=N` ({letter} = `a`..`z` or `0-9`, English trade name) | page 1, buckets with drugs (empty ones noindex, not in the sitemap) | 100 per page, **every page number linked** (click depth); old Arabic-letter URLs 301 → `/adwiya` |
| ingredients | `/active-ingredient`, `/active-ingredient/{slug}?page=N` | `ingredients.indexable`, page 1 | grouped by form + strength, cheapest per group |
| companies | `/sharika`, `/sharika/{slug}` | `companies.indexable`, page 1, no filter | sortable, filterable |
| categories | `/category`, `/category/{slug}` | `categories.indexable`, page 1, no filter | filterable |
| ATC | `/atc`, `/atc/{code}-{name}` | `atc_classes.indexable`, page 1, no filter | sub-classes + list |
| last prices | `/last-prices?direction=&page=` | base URL only | revalidate 1 h |
| static | `/about`, `/guide`, `/contact`, `/disclaimer`, `/privacy`, `/terms` | yes | `StaticPage` layout, last-review date |

### Rules every listing follows

* Server-rendered; every drug row is an `<a>` to `/dawa/{slug}` (`DrugRow`, `prefetch={false}`).
* `?page=N` pagination with plain crawlable links (`Pagination`; `showAll` on A–Z pages);
  `?page=1` redirects to the clean URL; pages ≥ 2 are noindex,follow with a self canonical.
* Filters (`form`, `rx`, `min`, `max`, `sort`) are a server-rendered GET form (`FilterForm`, no JS):
  any filter → noindex,follow + canonical to the clean URL; empty or default parameters → 307.
* Unique title and description per URL; one H1; `PageHeader` renders the breadcrumbs with
  BreadcrumbList JSON-LD.
* Lists show listed products (indexable, no pack variant that canonicalises elsewhere), sorted by
  folded Arabic name (`lib/data/listings.ts`). Pure logic (filters, pages, groups, letters, ATC URLs)
  is in `src/lib/listing/logic.ts`, unit-tested in `tests/listing-logic.test.ts`.

### Components added

| component | role |
| --- | --- |
| `listing/PageHeader`, `Facts` | breadcrumbs + H1 + lead + facts row (count, price range, last price date) |
| `listing/DrugList` | grid of `DrugRow` (1 column on phones, 2 from md), "الأرخص" badge |
| `listing/HubList` | filter form, "عرض X–Y من Z", list, empty state, pagination |
| `listing/FilterForm` | GET form: form, prescription, price range, sort |
| `listing/PriceChangesTable` | drug, old, new, change, %, date; table from md, cards below |
| `listing/LetterNav` | A–Z letters |
| `listing/HubIndexList` | alphabetical index grouped by first letter, with jump links |
| `StaticPage` | static pages: prose (`prose-ar` utility), last review date, sibling links |

No listing component ships JavaScript (filters are a plain GET form): first-load JS is **139 KB gzip** on
`/`, `/active-ingredient/*`, `/category/*`, `/last-prices`, `/about`, the same as the drug pages (framework + `SearchBox`).

### Search box — instant suggestions (part 6) and voice

`SearchBox` is a WAI-ARIA 1.2 combobox; ↓/↑ wrap, Enter opens the active option (or submits to
`/search`), Escape closes then clears, Tab leaves; the last option is "كل النتائج عن «…»". The list
is absolutely positioned and the count is announced in a visually hidden live region: **CLS 0.00**
measured while typing. Display names drop availability markers ("(n/a)") via `tradeName()`.

**On phones (part 2):** the home page shows the search box right under the header (a compact H1 above,
the description below, via CSS `order` so the H1 stays first in the HTML); the header's sticky mobile
search bar is hidden on `/` only (`HeaderMobileSearch`, so there are never two boxes). On focus the
input scrolls just under the top and the suggestions list is sized to the space above the keyboard with
`visualViewport` (its own scroll, updated on `resize`/`scroll`); the input is 16px so iOS Safari does not
zoom.

Suggestions come from a **static index searched in a Web Worker**, so from the second character
every keystroke is answered in a few milliseconds with no server round trip (desktop ~10 ms, 4×-CPU
~45 ms, vs ~340 ms before). How it fits together (`src/lib/search/`, full write-up in
`docs/search/README.md`):

* **The index** (`build-search-index.mts`, run by `npm run build`): every indexable drug the sitemap
  lists, with only its names, dosage form, ingredient names, alias/spelling tokens and a popularity
  *bucket* (never prices, barcodes, companies or raw counters — `tests/search-index.test.ts` fails
  the build otherwise). Columnar JSON with a content hash in the name, served immutable at
  `/search-index/<hash>.json` with pre-compressed `.br`/`.gz` picked by `Accept-Encoding`
  (`src/app/search-index/[file]/route.ts`). **~379 KB brotli for 13,106 drugs.**
* **Loading** (`client.ts`, one shared client per page): never during the initial page load — on the
  home and search pages after the page is idle (`requestIdleCallback`, skipped on Save-Data / 2G),
  and on every page the moment the box is focused, hovered or touched. The worker keeps the file in
  the Cache API keyed by the hashed URL (repeat visits: zero network), deletes old versions, and
  retries once on failure.
* **Matching** (`engine.ts`, in the worker; `engine-shared.ts` holds the light half the page needs
  for highlighting so the class stays out of the first load): normalisation identical to the database
  (`normalize.ts` == `web.search_normalize`, `tests/search-normalize.test.ts`); tiers exact → name
  prefix → word prefix → alias → ingredient → substring → fuzzy (1 typo from 4 chars, 2 from 8);
  unit/form synonyms (g = gm = جم, mg = مجم …) for mixed input; tie-break by popularity bucket then
  shorter name.
* **Fallback** while the index loads (or if it fails): `/api/search?q=…&limit=50` for the first two
  characters, cached in memory and filtered locally for the following keystrokes; switches to the
  index silently when ready. The `/search` results page still renders on the server.
* **Voice** (`search/VoiceButton.tsx` + `voice.ts`): a microphone button shown only where the Web
  Speech API exists (detected after hydration, faded in, no layout shift); `ar-EG`, interim text fed
  into the box live, the recognition code imported lazily on the first tap. A strong top match is
  pre-selected, never auto-navigated. `aria-label="بحث بالصوت"`, `aria-pressed` while listening,
  keyboard operable. Needs `Permissions-Policy: microphone=(self)` (set in `next.config.ts`).

### Internal linking and click depth

Header: categories, last prices. Footer (every page): A–Z, ingredients, companies, categories, ATC,
last prices, search, and the six static pages. Home: most visited, latest 5 changes, A–Z letters,
top categories, the 14 ATC groups, ingredients and companies. Every listed drug is ≤ 3 clicks from
home through the A–Z pages; every indexable hub is 2 clicks away through its index page.
`scripts/crawl.mjs` checks it (orphans, depth, broken and redirecting links):

```
npm run build && npx next start -p 3100
BASE_URL=http://localhost:3100 node scripts/crawl.mjs            # drug pages discovered + 300 sampled
BASE_URL=http://localhost:3100 node scripts/crawl.mjs --full     # fetch everything (heavy on the shared DB)
```

## 10. API section pages (Drug Prices API, phase 3)

| page | notes |
| --- | --- |
| `/api`, `/api/en` | landing in Arabic and English (`ApiLanding`, one component, `hreflang` ar/en/x-default) |
| `/api/en/{sample,docs,request-access,terms}` | English twins of the Arabic pages: one shared component per page in `src/components/api/pages/` takes `lang`; the route files only set metadata (`hreflang` pairs) and the language. The root layout renders no chrome; route groups do: `(site)` = Arabic header/footer, `(en)` = `EnHeader`/`EnFooter` inside `div[dir=ltr][lang=en]` (the `<html>` stays RTL, so the wrapper is `relative overflow-x-clip` to keep sr-only elements from widening the page), `(dev)` = chrome by the `dw_lang` cookie. Every link in the English section stays in English; `/developer` links go through `/api/lang/{ar\|en}?next=/developer` so the dashboard opens in the language of the page you came from |
| `/api/sample` | the explorer is the one client component of the section (`SampleExplorer`): endpoint picker, parameters, live JSON from `/api/v1/sample/*`, snippets in five languages; noindex |
| `/api/docs` | English reference rendered at build time from `openapi.yaml` by `src/lib/api-docs/openapi.ts` (no Scalar/Redoc bundle); `Markdown` renders the small Markdown subset used in descriptions; the file itself is served at `/api/openapi.yaml` |
| `/api/request-access`, `/api/terms` | server-rendered; the form is a client component only for field errors (`useActionState`) |
| `/developer/*`, `/admin/api/*` | server components + server actions (`src/lib/api/*-actions.ts`); the key reveal, login and revoke-confirm forms are the only client parts; `AdminShell` frames the admin pages; everything noindex and `/admin/` disallowed in robots.txt; the developer pages are bilingual (`getLang()`), the admin pages Arabic with an e-mail + password login (`AdminLoginForm`, `admin-auth.ts`) |

Shared pieces live in `src/components/api/`: `ApiNav` (section navigation, scrolls on phones), `CodeBlock` + `CopyButton`, `Blocks` (`StatsStrip`, `PlanCards` fed from `api.plans`, `FieldTable`, `Faq` with FAQPage JSON-LD, `UsageChart` SVG), `Forms`. New tokens: `--font-mono` (code, keys). Prose pages reuse the `prose-ar` utility.


## 11. Site admin & editable settings

A professional admin area at `/admin` (route group `(admin)`, its own sidebar shell, no public
chrome, noindex, `/admin/` disallowed in robots.txt) changes the live site without a redeploy. It
shares the API admin's auth (`/admin/api/login`, `api.admin_users`, the `dw_admin` session);
`requireAdminSession` / `currentAdmin` re-check the admin server-side on every page and action, and
admin sessions time out after 12 h (developer sessions stay 30 days). Full write-up: `docs/admin/README.md`.

* **Storage** (migration `0050`, `api` schema): `api.site_settings` (key → jsonb), `api.site_settings_audit`,
  `api.site_assets` (favicon bytes). Written by the admin actions with `api_app`; read by the public
  site with `web_reader` through the `web.site_settings` / `web.site_assets` views. Reads are a tagged
  cache (`site-settings`) merged over the code/env defaults (`lib/settings/config.ts`); saving calls
  `revalidateTag('site-settings')`, so the live site updates in seconds. Favicon bytes live in the
  database (not Supabase Storage — no service-role key in the env), behind a thin read/write boundary.
* **Sections**: Dashboard (health, freshness, counts, index size, API counts, most-visited — cumulative,
  no weekly/most-searched counter yet), Branding (favicon), Analytics & verification (GA4 + Google/Bing),
  SEO defaults (title/description/suffix/OG with live counters + a Google preview), Contact (email,
  WhatsApp, social — used by the footer), Audit log. Forms (`SettingsForm`) have inline validation, a
  save toast, an unsaved-changes guard and a "last changed by X at Y" line.
* **Favicon** (`lib/settings/favicon.ts`, `sharp`): an uploaded square PNG/JPG (≥512, ≤2 MB, validated
  server-side by `sharp` metadata) becomes favicon.ico (16/32/48 packed by hand — sharp cannot write
  ICO) + icon-48/96/192/512 + apple-touch-icon. Stable root route handlers serve them (cached,
  `max-age=86400`, revalidated by the tag) or the built-in brand mark rendered to size; `<head>` carries
  the icon/apple/manifest links. `metadata` in the root layout and home page is now `generateMetadata`
  reading the settings (title suffix, description, icons, verification on home only).
* **Google Analytics 4** (`SiteAnalytics`): loaded on every page view — no cookie-consent gate and no
  cookie notice (product decision 2026-10-22, so Google's tag detector and GA4 Realtime see the tag).
  IP anonymised, Google signals and ad personalisation off, automatic page_view off — `page_view` is
  sent with the path only, never `?q=` (`lib/analytics.ts`). Events via `track()`. Not loaded on
  `/admin`, and not loaded when the GA4 id is empty. Privacy page updated; the GA4 property's enhanced
  "Site search" must be turned off by hand (a user action).

## 12. Comments, problem reports, WhatsApp channel (2026-10-23)

Three visitor-facing additions, all moderated or admin-controlled. Storage: migration `0052`
(`api.drug_comments`, `api.drug_reports`, written by the website's server actions with `api_app`;
the public site reads approved comments only through the `web.drug_comments` view with `web_reader`
— the view is the privacy boundary: name, text, pharmacist badge, site reply, date; never e-mail,
IP hash, user agent or status). The database's `ensure_rls` event trigger switches RLS on for every
new table, so the migration switches it back off, like every other `api.*` table (access is by grants).

* **Comments** (`components/feedback/CommentsSection` + `CommentForm`, under the medical disclaimer):
  name ≤ 60, comment 20–1000, optional e-mail (never shown), «أنا صيدلي» badge. Every comment starts
  `PENDING` and is invisible until an admin approves it; the form then shows «تم استلام تعليقك وسيظهر
  بعد المراجعة». Approved comments are server-rendered (real content), newest first, plain text, under
  a stable `#comments` heading; no JSON-LD; the page title/description do not change. The admin can
  post an official reply shown with the «فريق الموقع» badge. Cached per page under `comments:<slug>`
  — moderation busts only that block, never the drug's loaders or the `drug:<slug>` tag.
* **Report a problem** (`components/feedback/ReportProblem`, at the end of the price aside): an inline
  form (type · details 10–800 · «السعر الصحيح» for the price type · optional contact, never shown).
  Rows carry `page_url`/`referrer` filled on the client from the live document. Statuses
  `NEW / IN_REVIEW / FIXED / REJECTED` + an internal note. On phones the aside precedes the main
  column, so opening the form moves the content *below* it by the form's height (the H1 and the price
  card do not move); `scripts/feedback-shots.mjs` measures and reports this.
* **Safety (lib/feedback/logic.ts, server-enforced in lib/feedback/submit.ts):** HTML stripped, text
  rendered as text; any URL rejected; honeypot field + submit-time window (3 s – 24 h, timestamp set
  on the client because the pages are cached HTML); rate limits 3 comments / IP / hour, 1 / drug / IP /
  day, 5 reports / IP / hour, counting rows of every status (only an admin *delete* refills a budget);
  `ip_hash` = HMAC-SHA256(ip, `API_SECRET`) — the address is never stored. The admin notification
  e-mail (existing `notifyAdmin`) carries the drug name and the admin link, never visitor text; with no
  provider configured only "skipped" is logged. CSRF: Next's same-origin check on server actions.
* **Admin** (`/admin/comments`, `/admin/reports`, sidebar badges with the pending/new counts read live
  by the layout, two dashboard cards): status/type filters, drug linked to its public page (there is no
  separate admin drug view — `drug_id`/`slug` are shown copyable), approve / reject / spam / delete /
  reply, bulk approve/reject (checkboxes bound to the bulk form via the `form` attribute), report
  status + note. Every action re-checks the admin server-side and answers 403 otherwise
  (`lib/feedback/moderation.ts`, unit-tested).
* **WhatsApp channel button** (`components/WhatsAppChannelButton`, client): «تابع آخر تحديثات الأسعار
  على واتساب», `target=_blank rel=noopener`, GA4 `whatsapp_channel_click` with the placement only. The
  URL is the admin setting `contact.whatsappChannelUrl` (Contact section; validated
  `https://whatsapp.com/channel/…`; the button is hidden while empty). Placements: home under the
  search (compact, never above it), header under the desktop search and a slim non-sticky strip under
  the mobile sticky bar, footer, and under the title of «أحدث الأسعار».
* Privacy page: section «التعليقات والبلاغات». Tests: `tests/feedback-logic.test.ts`,
  `tests/feedback-actions.test.ts` (mocked write paths, 403s, APPROVED-only read, plus a real
  PENDING→APPROVED round trip against the database). Proof: `scripts/feedback-shots.mjs`
  → `docs/feedback/screenshots/`.
