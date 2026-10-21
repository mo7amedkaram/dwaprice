# Crawl report (part 4)

Local production build at `http://localhost:3100`, 2026-10-21T13:36:27.224Z. Mode: drug pages discovered + 300 sampled. Crawl complete.

Every non-drug page was fetched (home, index pages, every hub page and its ?page=N pages, A-Z pages, last prices, static pages). Drug pages are recorded when a fetched page links them (their depth is exact); a random sample of drug pages was fetched with every new link target on them, and the sub-pages (/badael, /dawaei-estemal) of the other drugs are counted at drug depth + 1 (the drug template links them; checked on the sample).

| | |
|---|---|
| Pages fetched | 7,237 (avg 1303 ms; 2,382 s) |
| Sitemap URLs (all indexable URLs) | 32,367 |
| **Orphans** (in a sitemap, no crawled page links them) | **0** |
| **Indexable drug pages deeper than 3 clicks** | **0** |
| **Broken links** (4xx/5xx/network) | **2** |
| Links that redirect | 0 |
| Sitemap URLs fetched that are noindex / non-200 / canonical elsewhere | 0 |
| Sampled drug pages missing a sub-page link the sitemap expects | 0 |
| Links not followed | filters 0, search 7,235, files 0, api 0, external 2,837 |

## Click depth of sitemap URLs

| Type | URLs | Fetched | Max depth | Depth: URLs |
|---|---:|---:|---:|---|
| home | 1 | 1 | 0 | 0: 1 |
| index page | 5 | 5 | 1 | 1: 5 |
| last prices | 1 | 1 | 1 | 1: 1 |
| static | 6 | 6 | 1 | 1: 6 |
| drug | 13,106 | 300 | 3 | 1: 13, 2: 2,169, 3: 10,924 |
| drug: alternatives | 8,751 | 200 | 4 | 2: 8, 3: 1,612, 4: 7,131 |
| drug: uses | 6,651 | 150 | 4 | 2: 1, 3: 1,387, 4: 5,263 |
| ingredient | 1,980 | 1,980 | 2 | 2: 1,980 |
| company | 1,033 | 1,033 | 2 | 2: 1,033 |
| category | 208 | 208 | 2 | 1: 8, 2: 200 |
| atc | 603 | 603 | 2 | 1: 14, 2: 589 |
| A-Z letter | 22 | 22 | 1 | 1: 22 |

## Deepest path per type

- **home**: `/`
- **index page**: `/` → `/adwiya`
- **last prices**: `/` → `/last-prices`
- **static**: `/` → `/about`
- **drug**: `/` → `/adwiya/ا` → `/adwiya/ا?page=29` → `/dawa/abc-mocotive-topical-spray-70ml`
- **drug: alternatives**: `/` → `/adwiya/ا` → `/adwiya/ا?page=29` → `/dawa/abc-omega-3-6-9-syrup-60ml` → `/dawa/abc-omega-3-6-9-syrup-60ml/badael`
- **drug: uses**: `/` → `/adwiya/ا` → `/adwiya/ا?page=10` → `/dawa/alphaclarin-250mg-14-f-c-tabs` → `/dawa/alphaclarin-250mg-14-f-c-tabs/dawaei-estemal`
- **ingredient**: `/` → `/active-ingredient` → `/active-ingredient/3g2c-peptide-complex`
- **company**: `/` → `/sharika` → `/sharika/2m-whites-pharma`
- **category**: `/` → `/category` → `/category/5-alpha-reductase-inhibitor`
- **atc**: `/` → `/atc` → `/atc/a01ab03-chlorhexidine-oral-local`
- **A-Z letter**: `/` → `/adwiya/ا`

## Fetched pages by type

| Type | Pages (200) | Indexable | Max depth |
|---|---:|---:|---:|
| home | 1 | 1 | 0 |
| index page | 5 | 5 | 1 |
| last prices | 3 | 1 | 2 |
| A-Z letter | 22 | 22 | 1 |
| category | 214 | 208 | 4 |
| atc | 1,996 | 603 | 5 |
| static | 6 | 6 | 1 |
| drug | 382 | 300 | 4 |
| last prices (page 2+) | 224 | 0 | 58 |
| A-Z letter (page 2+) | 124 | 0 | 2 |
| category (page 2+) | 171 | 0 | 28 |
| atc (page 2+) | 304 | 0 | 10 |
| company | 1,087 | 1,033 | 4 |
| ingredient | 2,025 | 1,980 | 4 |
| company (page 2+) | 113 | 0 | 5 |
| ingredient (page 2+) | 208 | 0 | 9 |
| drug: alternatives | 200 | 200 | 4 |
| drug: uses | 150 | 150 | 4 |

## Issues

- Orphans: none
- Drug pages deeper than 3: none
- Broken links: `/dawa/daktarin-2-cream-15gm` → `/sharika/mina-pharm-janssen-cilag` (500); `/dawa/panthozin-cream-30gm` → `/active-ingredient/seasame-oil` (500)
- Redirecting links: none
- Sitemap issues: none
- Template issues: none

## Notes

- The two "broken links" were `500` answers caused by `statement timeout` (the 5 s cap of the
  `web_reader` role) on hub lookups while the crawl, its 300-drug sample and the API-spec research
  queries hit the database at the same time. Both pages were re-fetched on the rebuilt server after
  the crawl: `/sharika/mina-pharm-janssen-cilag` 200 (0.98 s cold), `/active-ingredient/seasame-oil`
  200. No link is actually broken.
- Pagination chains: pages 2+ of long lists link only their neighbours (plus first and last), so the
  118 pages of `/last-prices` and the 54 pages of the largest category sit up to 58 clicks deep.
  Those pages are `noindex,follow` and every drug on them is also reached through the A–Z pages
  (every listed drug ≤ 3 clicks), so no indexable URL is affected. If crawl budget on those pages
  ever matters, `Pagination` can link every 10th page as well.
- The "small targets" the screenshot script reports on `/guide` and the home trust section are text
  links inside running prose (WCAG's inline-link exception); all standalone controls are ≥ 44 px.
