# Dark mode — proof (2026-10-21)

| what | where |
| --- | --- |
| home, drug page, alternatives page, search dropdown — light and dark, 360 and 1280 px (16 files) | `screenshots/{home,drug,alternatives,search}-{light,dark}-{360,1280}.png` (`scripts/theme-shots.mjs`; dark = device setting, nothing saved) |
| a drug with a product photo (the `figure` container behind white images) in both themes; the English header at 360 px with the toggle | `screenshots/drug-with-photo-{light,dark}-1280.png`, `screenshots/en-header-light-360.png` |
| first paint has the right theme in every combination: device light/dark × saved none/light/dark — `data-theme` is set once while the document is still `loading` | `scripts/theme-check.mjs` (MutationObserver from an init script) |
| toggle persists across reload and navigation, `aria-pressed` follows, "device" clears the saved choice, a device change while on "device" is followed live, phone header has no overflow, the cycle button works with Enter and Space | `scripts/theme-check.mjs` |
| Lighthouse accessibility, desktop preset, both themes, three pages | `lighthouse/{home,drug,alternatives}-{light,dark}.json` (`scripts/lighthouse-theme.mjs`; the final screenshot's pixel proves the audited theme: white vs `#0F172A`) |

Lighthouse accessibility (final build):

| page | light | dark |
| --- | --- | --- |
| `/` | 100 | 100 |
| `/dawa/alerid-10mg-30-f-c-tabs` | 100 | 100 |
| `/dawa/alerid-10mg-30-f-c-tabs/badael` | 100 | 100 |

The light theme had scored 97 on these pages before this work (33 `color-contrast` nodes: `muted #94A3B8` text at 2.6:1 and price-up badges `#DC2626` on `#FEE2E2` at 4.0:1); those three light tokens were darkened (`muted #5B6B82`, `down #15803D`, `up #B91C1C`), see `docs/DESIGN.md` §1.

Reproduce (server on 3100, built):

```
node scripts/theme-check.mjs
node scripts/theme-shots.mjs
node scripts/lighthouse-theme.mjs   # needs Google Chrome installed; uses npx lighthouse@13.5.0
```
