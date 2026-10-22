# SUIT range / declaration-order experiment — rejected (2026-10-23)

The existing four-file partition cannot be adopted on this evidence. Reordering CSS and using exact Unicode ranges can remove the full fallback from some NFC and NFD strings, but the candidate changes valid Hangul cluster shaping. This was reproduced in both canvas pixels and actual DOM text, including a mixed Korean/English sentence. No application source, stylesheet, font preload, dependency, or production state changed. No integration commit was made. There is no new LCP or speed-score improvement claim.

## Scope and source

- Dedicated checkout: branch `codex/quality-font-range-20261023`, base `2efb3c3d`. No tracked or ignored files were created there; all experiments stayed under this temporary directory.
- Original SUIT file: 624,536 bytes, SHA-256 `aa894a204d5a6fbae259dac6868d350cbd373a390caee0313f92946af741df23` (`original.woff2`, copied unchanged).
- Original coverage: 2,933 Unicode cmap entries, 2,956 glyphs, 2,668 precomposed Hangul and 265 others; this is not the entire Hangul block. Weight axis remains 100–900.
- Existing derivatives were reused from `/tmp/moonlight-font-subset-20261023/candidates-v2`, not regenerated or altered. Their static outline/metrics/layout/variation integrity and original generation procedure are documented in `/tmp/moonlight-font-subset-20261023/REJECTED.md`.
- macOS headless Chromium 151.0.7922.34; Playwright from the existing Codex runtime. HTTP served only at loopback 3168 / 3169. No Hub/API/live customer records were accessed, no session or external credentials were used, and no foreground input was sent.
- No actual app build or throttled route performance run followed the failed rendering gate. Static fixture bytes are not customer-page/LCP evidence. WebKit, Firefox, actual Windows, and full Futura route geometry were not evaluated in this experiment.

## Four-file partition and provenance

| File | Body bytes | Original cmap entries | SHA-256 |
| --- | ---: | ---: | --- |
| `moonlight-ui-core.woff2` | 538,772 | 2,615 | `dc4d88c51d9bbede91160e1815b086a871b717fb5d0cfce92f8de6ef45041fca` |
| `moonlight-ui-hangul-00.woff2` | 37,916 | 128 | `a8841dbd9b269bc177c63f83640cbfffa77a9fae9c279dfefe67da69b8e9fd21` |
| `moonlight-ui-hangul-01.woff2` | 45,424 | 128 | `f71254653dfb3323c58594b2d7542ba2a4382ee67fe16142950faa5d69ce386a` |
| `moonlight-ui-hangul-02.woff2` | 21,312 | 62 | `80a9c6ddc8c61ce72d01f0a862979c04243d77fe59e3d7b0aeb9d74624f41906` |

Total 643,424 bytes, +18,888 / +3.02% over the original. Core has all 2,350 KS X 1001 Hangul plus all 265 non-Hangul entries. Full codepoint arrays, exact ranges, source hash, and generation tool versions remain in `candidates/report.json`; all binary hashes are also in `asset-sha256.json`. UI-256 control: 20 files, total 746,440 bytes (+19.5%).

Original generation used Python 3.12.14, FontTools 4.67.0, uharfbuzz 0.56.3, Brotli 1.2.1, and zopfli 0.4.3 in an isolated temporary venv. The original generator is copied to `repro/subset-hub-font-experiment.py`. To regenerate the historical binaries, use source baseline `050e12f4`, place the script in that checkout's `scripts/`, and run the pinned Python environment with `--license /path/to/OFL.txt --output /fresh/directory --plans ks2350-128 ui512-128 ui256-128`; the script asserts the original source hash and scans static public source text only. The current experiment reuses the resulting unchanged binaries and varies only local HTML/CSS declarations.

The original OFL license is preserved as `OFL.txt` and within copied candidate directories. Derivative internal names remain Moonlight UI; original copyright, license, reserved-font-name notice and upstream URLs were retained by the original generator. CSS aliases are experimental delivery names, not a claim that altered fonts retain the reserved SUIT name.

## Findings

| Variant | Narrow fixture result | Decision |
| --- | --- | --- |
| Same-family, exact original-cmap ranges | NFC selects subset; NFD selects system font, differing width/pixels | Reject |
| Original full face first, exact subsets after it in the same family | NFC core only; pure NFD original only; mixed English/NFD still requests original + core (1,163,308 bytes) | Reject duplicate bytes; pure NFD alone was misleading |
| Same-family, expose NFD Jamo in all/owner ranges | Regular NFD can shape correctly but downloads all four files; combining-mark / variation-selector cases still differ | Reject |
| Four separate CSS families, core first, each exposing its NFD closure | Common NFC/NFD/mixed fixtures request core only (538,772 bytes); normalized checks pass | Initially promising, rejected by raw partial-cluster coverage below |
| Core-first plus intermediate LV syllables added to each rare range | Same raw partial-cluster failures | Reject; Unicode range alone does not supply an absent glyph in that face |
| Rare families first, core last | Fewer partial-cluster failures but RAW, NFC and NFD combining cases differ; NFD and mixed NFD load all four files | Reject |

Adding the original face before the subsets therefore does change selection order, as proposed, but does not remove fallback duplication for a single mixed text run. In the fixture `고객CRM · 회의Work · naïve café 한글` normalized to NFD, it loads 624,536 + 538,772 bytes. The unrestricted original also downloads on unsupported-character fallback; restricting the original to its cmap plus Jamo eliminates that particular unsupported-symbol duplicate but not mixed NFD duplication. Evidence: `probe-order.json`.

The core-first separate-family variant's favorable 538,772-byte results were only narrow fixtures, not actual customer routes. It is not a safe optimization. Rare-first also needed three files (622,112 bytes) for the synthetic static Home-label phrase and all four (643,424 bytes) for common/mixed NFD. These are font body bytes excluding HTTP headers, CSS and the unchanged mono font. Evidence: `probe-families.json`, `probe-rare-first.json`.

## Decisive rendering regression

The full check covered every original cmap entry, its NFC/NFD forms, every supported Hangul syllable's intermediate LV+trailing-Jamo representation, standalone Jamo, mixed Korean/English/accents/symbols, combining marks, variation selectors and ZWJ, at weights 100/400/500/700/900. Each of the three final variants had 78,690 canvas width/pixel comparisons; all subset files were loaded before these comparisons, so missing network fetch completion does not explain the failures.

| Candidate | RAW failures | NFC failures | NFD failures |
| --- | ---: | ---: | ---: |
| Core-first separate families | 1,405 | 0 | 0 |
| Core-first with intermediate-LV range closure | 1,405 | 0 | 0 |
| Rare-first with intermediate-LV range closure | 40 | 15 | 15 |

`RAW` means input was preserved as supplied rather than normalized before measuring. Core-first fails 281 intermediate LV+T strings at each of five weights. Example: U+AC00 U+11B2 (`가` + trailing Jamo). The original composes the supported U+AC0B glyph. At 24px/weight 100 canvas width is 20.975997924804688px; the candidate is 41.735992431640625px. The base LV is owned by core while the composed LVT glyph belongs to a different face. Exposing the intermediate LV in the rare face's CSS range does not change its actual cmap.

The live DOM reproduction at 36px also gives original 31.46875px versus candidate 62.609375px at weights 100/400/900. CDP shows one original SUIT glyph, while the candidate uses one Moonlight UI glyph plus one system Apple SD Gothic Neo glyph. The mixed sentence `고객CRM 갋 · 회의Work` changes intrinsic width too: at 24px / weight 400, 244.234375px becomes 264.984375px. In equal 380px-content-width boxes at 36px / weight 400, the original occupies one line (46px including borders) while the candidate wraps to two (90px). See `dom-repro.png`, `dom-repro.json`, and `dom-repro.html`. This is an actual DOM regression, not only a canvas-test artifact.

Rare-first leaves combining-mark / variation-selector regressions, including `가\u0301 각\uFE0F`; its first weight-100 failure is 71.47198486328125px versus 74.49598693847656px. Full captured examples and counters are in `browser-shaping-rare-first.json`.

A simple count of cluster-group ownership shows that regrouping every intermediate LV/LVT group with its rare counterpart would affect 1,180 common-core syllables. That would require a different font partition/generation experiment, potentially duplicated glyphs or different core contents. This report does not prove that all future partition strategies are impossible; it rejects the tested existing-binary CSS range/order strategy. No text normalization workaround was added.

## Reproduction

The scripts contain their existing local Playwright runtime path. With that runtime available:

```sh
node /tmp/moonlight-font-range-20261023/probe-order.cjs
node /tmp/moonlight-font-range-20261023/probe-families.cjs
node /tmp/moonlight-font-range-20261023/browser-shaping-families-full.cjs
node /tmp/moonlight-font-range-20261023/browser-shaping-cluster-closure.cjs
node /tmp/moonlight-font-range-20261023/browser-shaping-rare-first.cjs
node /tmp/moonlight-font-range-20261023/dom-repro.cjs
```

Run sequentially: they temporarily share loopback ports and shut down their own browser/server on completion. Copied original/candidate assets make these fixture runs independent of the removed font-range checkout. No repository runtime or npm dependency is added. `*.json` and `*.log` beside the scripts preserve the measured results. JSON failure lists cap at 30 examples; `failureCounts` contains the full failure counts.

## Why cmap coverage was insufficient

[CSS Fonts 4 unicode-range](https://www.w3.org/TR/css-fonts-4/#descdef-font-face-unicode-range) defines the effective character map as the font cmap intersected with the declared range and describes reverse declaration-order checking for composite faces. [Cluster matching](https://www.w3.org/TR/css-fonts-4/#cluster-matching) includes canonical-equivalent composition. A disjoint cmap union proves individual encoded coverage, not equivalent selection/shaping of every grapheme cluster. The observed DOM failures are the direct rejection evidence; the specification explains why range declarations alone are insufficient.

Cleanup: candidate fixture servers and headless browsers exited. The untouched experimental worktree was removed after clean status/diff and original-hash verification. No commit, source change, npm installation, application build, deployment, or operational write was produced by this investigation.
