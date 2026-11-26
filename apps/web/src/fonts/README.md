# Fonts

`Geist-Variable.subset.woff2` and `GeistMono-Variable.subset.woff2` are subsets of the variable Geist fonts
from the `geist` npm package (SIL Open Font License 1.1, see `LICENSE-Geist-OFL.txt`). They keep all weights
(variable `wght` axis) but only Basic Latin, Latin-1, Latin Extended-A and the typographic symbols the UI uses
(– — ‘ ’ “ ” • · … ₹ € → ↑ ↗ ✓ ⌘ ↵ ×), which halves their size (≈68 KB → ≈36 KB each).

Regenerate with `node scripts/subset-fonts.mjs` (needs `subset-font`, e.g. `npm i --prefix /tmp/subset subset-font`
and `NODE_PATH=/tmp/subset/node_modules`).
