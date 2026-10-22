# Five changes (2026-10-22): proof

## Part 1 — English toggle for the drug-information section only

- `InfoLangToggle` («عربي | English») in the معلومات الدواء header. Both languages are in the server
  HTML (Arabic visible, English in a `lang="en" dir="ltr"` container), toggled by CSS on
  `html[data-info-lang]`; applied before paint by `src/lib/info-lang.ts` and saved in `localStorage`,
  so it carries to later drug pages with no request and no layout shift. Only existing English text is
  used (DailyMed/EMA/eMC); blocks with no English show "English text not available for this section";
  the pharmacist-reviewed dosing block stays Arabic. No toggle when the drug has no English
  (`hasEnglishInfo`, unit-tested). Titles/meta/canonical/hreflang unchanged; the rest of the page stays
  Arabic. Screenshots `screenshots/drug-390-info-ar.png`, `drug-390-info-en.png`.
- **English coverage** over 13,228 indexable drugs: description 13,099 (99%), warnings 8,212 (62%),
  uses 8,210 (62%), contraindications 7,015 (53%), interactions 5,917 (45%), side-effects 5,805 (44%),
  monitoring 2,839 (21%).

## Part 2 — home search on mobile

- On phones the home search sits right under the header (compact H1 above, description below, via CSS
  `order` so the H1 is still first in the HTML); desktop unchanged. The header's sticky mobile search
  bar is hidden on `/` only (`HeaderMobileSearch`) so there are never two boxes. On focus the input
  scrolls just under the top; the suggestions list is sized to the space above the keyboard with
  `visualViewport` (own scroll, updates on resize/scroll); input is 16px (no iOS zoom). Screenshots
  `home-390-suggestions.png`, `home-412-suggestions.png`, and `home-390-keyboard.png` (viewport cut to
  the height above a keyboard — the list resized itself to 304px).

## Part 3 — removed «الأكثر زيارة»

- The section and its `getPopularDrugs` query are gone (the `web.popular_drugs` view stays: it still
  feeds the build-time top-drug slugs and the search index). Internal-link crawl: see
  `../part4/crawl-report.md` (re-run after this change). Every drug stays reachable within 3 clicks via
  the A–Z letters (home → `/adwiya/{letter}` → drug) and the latest-price-changes table.

## Part 4 — drug page section order

- hero → price card → **معلومات الدواء** → **المثائل** → **البدائل** → تاريخ السعر → identifiers,
  related, sources. Price-card button relabelled «المثائل والبدائل». One H1; JSON-LD unchanged. Verified
  live by `tests/drug-page.test.ts` (asserts the order of `id="info"`, `id="similars"`,
  `id="substitutes"`, `id="history"`, price card before info, exactly one H1).

## Part 5 — المثائل vs البدائل

- **المثائل** = same active ingredient(s): same strength first, then a "different strength" sub-section
  (`web.drug_alternatives`, unchanged). **البدائل** = different active ingredient, same therapeutic
  class: new view **`web.drug_substitutes`** (migration `0049_web_drug_substitutes.sql`, in the
  `drug_home_app` repo, applied to the DB). Rule: same ATC level-4, different level-5, same `route_class`,
  single→single (combos only for combo originals), indexable + priced, **no ATC → no section**.
  `isSubstitute` in `logic.ts` mirrors the view (unit-tested); a live test checks the view agrees.
- Price URL `/badael` unchanged (indexed); title «بدائل ومثائل {name} وأسعارها {year}»; sitemap
  unchanged. البدائل shows price + price-per-unit only (**no savings badge**). Safety notes verbatim:
  «نفس المادة الفعالة والتركيز. اسأل الصيدلي قبل الاستبدال.» and, more prominent,
  «مادة فعالة مختلفة من نفس المجموعة العلاجية. لا تستبدل دواءك ببديل إلا بأمر الطبيب.» Wording updated on
  the drug page, `/badael`, `/guide` and `/about`. Screenshots `badael-390-top.png`,
  `badael-390-substitutes.png`.
- **Performance of the view** (through the view, as `web_reader`): EXPLAIN ANALYZE uses
  `products_atc_gin`, no seq scan; cold 50 ms (first run), **warm 1–16 ms**. Coverage: **6,073** of
  13,228 indexable drugs are eligible (indexable, priced, known route, has ATC level-4); **~86%** of
  those get ≥1 بديل (600-drug sample: 519). Five real examples in `badael-examples.txt`.

## Verify — Lighthouse mobile (same machine, median of 3; CLS must not get worse)

| page | score before → after | CLS before → after | LCP before → after |
| --- | --- | --- | --- |
| `/` | 91 → 91 | 0 → **0** | 3562 → 3569 ms |
| `/dawa/alerid-10mg-30-f-c-tabs` | 89 → 89 | 0 → **0** | 3775 → 3720 ms |

Runs in `lighthouse/{before,after}-v2-*.json`. Scores unchanged, CLS stayed 0, LCP within run noise.
The bilingual HTML adds bytes but the hidden English container is `display:none`, so no layout cost.

Unit + live tests: `npm test` (105 passed, 20 env-gated skips), including the البدائل rule and the
English-toggle visibility. Live: `DRUG_PAGE_BASE_URL=http://localhost:3100 npx vitest run
tests/drug-page.test.ts` (section order, bilingual render, view↔rule consistency). `tsc` and
`eslint --max-warnings=0` clean.
