# My Work checkbox corner clipping — corrected

2026-10-23. Baseline `2efb3c3d`; candidate **`80495703`**. Only `apps/hub/components/hub/hub-tokens.css` changed: **6 added lines**, scoped to coarse pointers and direct bare-checkbox children of My Work rows.

## Cause and final correction

The visible checkbox is 14×14px and its centered touch halo is 44×44px. In a clipped, radius-14px Card the original left edge of that halo met the rounded corner. The last row's lower-left point therefore missed the checkbox; the first row's upper-left corner was similarly affected in an unheaded card.

The coarse-pointer My Work row now reserves a **44px checkbox column**: left margin `var(--r-lg)` (14px), original 14px face, right margin 16px. The checkbox moves **14px right** and the title starts **30px farther right**. The halo remains centered and 44×44px. Card radius, border, overflow, row height, date position, and fine-pointer layout are preserved. This is an explicit target-spacing correction; the mobile picture is intentionally not pixel-identical.

The right margin also separates the detail-title target from the checkbox. A smaller 5px margin removed geometric overlap but Chromium still adjusted a touch on the first letter to the nearby native checkbox. Temporary probes at margins 5, 6, 8, 10 and 13px reproduced this; 16 and 20px routed the actual touch to the title. The adopted 16px margin is the tested value that completes the 44px column.

At 320px, a hidden-status badge plus date exposed the old title's inline `min-width:35%` as a second constraint. The adjacent title alone gets `min-width:0` on coarse pointers, allowing its existing nowrap/ellipsis behavior to yield space to the badge and date. The full text remains in the DOM; no records or words are removed. Ordinary long-title widths are 114px / 184px / 394px at 320 / 390 / 600px respectively. Long titles already used ellipsis before this change and still do.

## Browser validation

Bundled Playwright Chromium with real touch events through its mobile emulation. Browser plugin skill unavailable. HTTP source fixture at 127.0.0.1:3167 directly extracts current repository `ItemRow`, `Card`, `Checkbox`, `CheckboxRow`, `Badge`, `IconButton` and icons. Public verification labels only; unrelated due-date helper returns null. No source business fixtures, APIs, operational data, paid services or writes were used. This is source component validation, not a rebuilt production or physical-device claim.

20 main cases: baseline/candidate × light/dark × 320 touch, 390 touch, 600 touch, 1440 fine, 1440 coarse.

- At each coarse condition, both adjacent boundary rows were sampled over their centered 44×44 integer-coordinate grid (offsets −22…21): **1,936 points per row**, **30,976 candidate samples total**. Before correction the first/last row missed 81/62 points; afterward **0/0**. Every sampled point targeted its own checkbox, with no neighboring-row interception.
- All four ±21px corner taps on each row reached only that row's completion callback: four completions per row, no detail opens. This was repeated at all four coarse widths.
- Title center and first-letter taps reached only that row's detail callback: two opens, no extra completion. CheckboxRow's visible text still toggled exactly once.
- Body and Card scroll widths do not overflow. Row/card rectangles and date rectangles match baseline. All faces remain 14×14px; row heights remain 44px on coarse pointers.
- Both fine-pointer screenshots are pixel-identical to baseline. Coarse screenshot differences are limited to the intended checkbox/title positions and resulting ellipsis. Korean text, both themes and font completion were checked visually. Page/console errors: zero.

Eight additional status/action cases (baseline/candidate × 320/390/600 touch and 1440 fine) use a real ItemRow with metadata, a hidden-status badge, and row actions. At all widths, date rectangles match baseline and row/body overflow is zero. Mobile row actions retain their existing display:none rule; fine-pointer hover actions and geometry remain unchanged. The 320px screenshot confirms the badge and date remain visible.

## Regression and evidence

`node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/hub-responsive-css.test.mjs apps/hub/components/hub/hub-motion-fx.test.mjs apps/hub/components/hub/pages/my-work*.test.mjs`: **79 passed, 0 failed**. `git diff --check` passed.

- `results.json`, `summary.json`: main geometry, hit testing and callback evidence.
- `extras-results.json`: badge, date and row-action geometry.
- `title-probe.json`: touch adjustment diagnosis.
- `server.cjs`, `check.cjs`, `extras.cjs`, `summarize.py`: temporary reproduction harnesses.
- `baseline-320-touch-light.png` / `candidate-320-touch-light.png`, and corresponding 390px / dark PNGs: short titles above, long titles in actual Card below.
- `extras-baseline-320.png` / `extras-candidate-320.png`: long title with status badge and date.

These are source-component measurements. The subsequent rebuilt whole-route verification and mobile footer correction are recorded in [production verification](touch-targets-production.md). The corner correction is integrated as `172238f9`; the footer correction is integrated as `4fcc1a7c` (runtime equivalent to candidate `7c4e7bb7`). The browser and owned server are stopped, port 3167 is released, and the clean auxiliary worktree was removed. No operational writes occurred.
