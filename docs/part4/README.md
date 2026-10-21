# Part 4 — home, search and listing pages: deliverables

| what | where |
| --- | --- |
| screenshots of every page type at 360 and 1280 px | `screenshots/{home,search-misspelled,ingredient,ingredients-index,company,category,category-filtered,atc,atc-index,last-prices,letter,letters-index,about,contact,guide}-{360,1280}.png` |
| search suggestions for a misspelled Arabic name ("كونجستل" → كونجستال), keyboard only | `screenshots/search-suggestions-{360,1280}.png`, measurements in `shots-report.json` (`search`) |
| per-page checks (status, robots, canonical, H1, overflow, small targets) | `shots-report.json` (`pages`) |
| crawl: click depth, orphans, broken and redirecting links | `crawl-report.md`, `crawl-report.json` |
| security boundary after migrations 0038–0041 | `boundary.txt` (73/78; the 5 failures are the part 1 PUBLIC grants) |
| decisions, migrations, search tiers and timings, monthly-pages proposal | `../DATA_PLAN.md` §12 |
| URL map, listing rules, components, search box, internal linking | `../DESIGN.md` §9 |

Reproduce (production build, local):

```
npm run build
npx next start -p 3100
BASE_URL=http://localhost:3100 node scripts/part4-shots.mjs
BASE_URL=http://localhost:3100 node scripts/crawl.mjs
WEB_DATABASE_URL=... node db/checks/boundary.mjs
npx vitest run
```
