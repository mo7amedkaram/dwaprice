# Instant drug search + voice — proof (2026-10-22)

Suggestions come from a static index searched in a Web Worker, so from the second character every
keystroke is answered in a few milliseconds with no server round trip. Voice input uses the
browser's own speech recognition. Design write-up: `docs/DESIGN.md` §9 (“Search box”).

## Before / after (local build, same machine)

| measure | before | after |
| --- | ---: | ---: |
| keystroke → suggestions, 2nd char (desktop) | 344 ms | **9.9 ms** |
| keystroke → suggestions, 2nd char (4× CPU) | 724 ms | **45 ms** |
| 3rd char update (desktop) | 485 ms | **9.5 ms** |
| /api/search per query (now the fallback only) | 93 ms warm | unchanged |
| Lighthouse mobile — home | 92 | 91 |
| Lighthouse mobile — drug page | 91 | 90 |
| CLS (home / drug) | 0 / 0 | **0 / 0** |
| LCP — home / drug | 3421 / 3572 ms | 3551 / 3712 ms |
| first-load JS — home / drug (gzip) | 141.8 / 147.3 KB | 143.0 / 148.5 KB |

Numbers and the method behind each are in `measurements/before.json` and `measurements/after.json`;
the Lighthouse runs kept are in `lighthouse/{before,after}-*.json`. Production and 4×-CPU keystroke
numbers are in those files too.

**Reading the Lighthouse row:** the score is within one point and within run-to-run variance (each
median’s `runs` list still contains a baseline-level run), CLS is unchanged at 0, and LCP/FCP are
within noise. The index and the worker load only *after* the page is idle (home and search pages) or
when the box is first used, so they never touch LCP or FCP. The home run’s inflated transfer
(~782 KB) is that idle index prefetch — the brief asked for it — which Lighthouse counts because its
trace runs past the load event.

## Index

- 16,509 drugs (every indexable drug page; the live index and the build-time file are built by the
  same code from the same `web.*` views, so they carry the same hash for the same data).
- 2527.8 KB raw, **588.2 KB gzip, 459.8 KB brotli** — under the 1 MB target, no sharding needed.
- Only: slug, Arabic/English names, dosage form, ingredient names, alias/spelling tokens, popularity
  *bucket* (0–5). Never prices, barcodes, companies or raw counters — `tests/search-index.test.ts`
  fails the build if any appear (and asserts the file is columnar and under 1 MB compressed).
- **Live, fresh without a deploy.** The browser first reads `/search-index/version.json` (`{hash,
  drugs, generatedAt}`, `max-age=60`) and then loads `/search-index/current.json?v=<hash>`: the index
  built from the database on the server (`src/lib/data/search-index-current.ts`, a tagged cache
  busted by `/api/revalidate` on the `catalog` tag, 15-minute ceiling), served brotli/gzip by
  `Accept-Encoding` and immutable per hash — an unchanged hash is reused from the worker's Cache API,
  a changed one is downloaded once. The build-time `/search-index/index.<hash>.json`
  (`src/app/search-index/[file]/route.ts`) is only the first-load fallback when the live route fails.
- The cached value is the brotli bytes (≈ 0.65 MB as base64), not the raw JSON: Next's data cache
  silently refuses entries over 2 MB and would otherwise rebuild the index on every request.

## Loading (first page load is never blocked)

- Suggestion code (engine + client + highlight) is a chunk loaded on first focus/hover, not on the
  first page load; the `SearchEngine` class is in the worker chunk; the voice recognition code loads
  on the first microphone tap; the index downloads after the load event in `requestIdleCallback`
  (home and search pages; skipped on `Save-Data` / 2G) or on first focus/hover of the box anywhere.
- The worker keeps the index in the Cache API keyed by the hashed URL: repeat visits read it with
  zero network and old versions are deleted. A failed load falls back to `/api/search` and retries
  once.

## Fallback while the index loads

`/api/search?q=…&limit=50` for the first two characters, cached in memory and filtered locally for
the following keystrokes; switches to the index silently when ready, without reordering the visible
list. Proven end to end by `scripts/search-verify.mjs` (checks E1–E6).

## Matching — real cases

`cases.txt` has the live output (`npx tsx scripts/search-cases.mjs`). Covered: two Arabic letters,
`ى`→`ي` and `ة`→`ه` spelling, a one-letter typo (`اوجمنتن` → Augmentin), an English brand name, an
ingredient name (shows which ingredient matched), and mixed input (`اوجمنتين 1g`). Client/server
normalisation parity is tested against the database in `tests/search-normalize.test.ts`.

## Voice

Microphone button shown only where the Web Speech API exists (detected after hydration, faded in, no
layout shift). `ar-EG`, interim text fed into the box live, the recognition code imported lazily on
the first tap. A strong top match is pre-selected, never auto-navigated. `aria-label="بحث بالصوت"`,
`aria-pressed` while listening, keyboard operable. Privacy page says the audio is the browser's and
is not recorded. Needs `Permissions-Policy: microphone=(self)` (set in `next.config.ts`). All voice
states are verified with a mocked recogniser in `scripts/search-verify.mjs` (checks G1–G9).

## Reproduce (built, server on :3100)

```
npm run build                 # also runs scripts/build-search-index.mts (needs WEB_DATABASE_URL)
npx next start -p 3100

# functional (41 checks: route, loading, fallback, keyboard/ARIA, voice)
node scripts/search-verify.mjs

# timing
node scripts/search-timing.mjs --wait-index          # desktop, index loaded
node scripts/search-timing.mjs --wait-index --cpu 4  # 4x CPU
node scripts/search-api-timing.mjs                   # /api/search server time

# Lighthouse mobile (needs Google Chrome)
LABEL=after node scripts/lighthouse-perf.mjs / /dawa/alerid-10mg-30-f-c-tabs

# first-load JS, and the real cases
node scripts/first-load-js.mjs / /dawa/alerid-10mg-30-f-c-tabs
npx tsx scripts/search-cases.mjs
```

The parity fixture (`tests/fixtures/normalize-parity.json`) is regenerated from the database with the
script in the git history of this folder; the unit tests run offline against it.

## Two production (Nginx) changes still needed on the VPS

Verified locally; cannot be set from here.

1. **Voice:** confirm Nginx passes `Permissions-Policy: microphone=(self)` through to the browser.
2. **Do NOT override `Cache-Control` for `/search-index/`.** The app sets the right header per
   route itself: `immutable` for the hashed file and for `current.json?v=<hash>` when the hash
   matches, `no-store` when it does not, and `max-age=60` for `version.json` — the freshness marker
   that must never be cached for long. A blanket `proxy_hide_header Cache-Control; add_header
   Cache-Control "… immutable"` on the prefix (an earlier version of this note) would freeze
   `version.json` for a year and stamp a mismatched `current.json` immutable: don't.

   Nginx currently appends `Cache-Control: no-cache` to every response. For this prefix that is
   *safe* (browsers just revalidate: one 304 per load), so leaving it is fine. The only improvement is
   to stop the global `add_header` from applying to `/search-index/` so the app's headers stand
   alone — e.g. a `location ^~ /search-index/ { proxy_pass …; }` block with no `add_header` of its
   own, placed where the global one does not inherit (or move the global `add_header` into the
   locations that need it). Never add an `immutable` header here yourself.
