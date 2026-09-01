# Personal Revenue Roadmap Design QA

## Comparison target

- Source visual truth: `/Users/bigmac_moon/.codex/generated_images/01a0559e-6f60-7a11-bcc2-1f2920b1dc1b/exec-8f60be29-c502-415d-b0b2-8d207d6f9f64.png`
- Source pixels: `1488 × 1058`
- Intended implementation route: `/dashboard/revenue/overview?scope=personal`
- Implementation screenshot: unavailable
- Intended viewport: `1488 × 1058` CSS px at device scale factor `1`
- Density normalization: not performed because the implementation capture is unavailable
- State to compare: dark theme, populated 30-day Personal revenue ledger, one timeline deal selected, conditional right detail drawer open

## Evidence captured

- The source mock was opened at original resolution and inspected.
- The local Hub returned HTTP 200 and the production build completed.
- The local revenue endpoint currently returns an honest configured `preview` ledger with zero deals, so the selected populated state cannot be reached from the current data source.
- The Codex in-app preview was opened/queued at the intended route, but this environment exposes no browser screenshot or interaction-capture tool.
- Direct Playwright capture was not used because Product Design browser rules require the user's browser choice/permission before direct Playwright use.

## Full-view comparison evidence

Blocked. There is no browser-rendered implementation screenshot to place beside the source image, and the current ledger cannot render the populated selected-deal state.

## Focused-region comparison evidence

Blocked for the same reason. The required summary strip, timeline markers, selected deal state, right drawer, and action list cannot be compared from code or file paths alone.

## Findings

- [P0] Browser-rendered evidence is missing
  - Location: full Personal Revenue view.
  - Evidence: source image is available, implementation screenshot is not.
  - Impact: typography, spacing, color, overflow, drawer proportions, and visible interaction fidelity cannot be truthfully approved.
  - Fix: with user approval, capture the local route in their chosen browser at `1488 × 1058`, inject or connect a clearly identified populated test ledger for the selected-deal state, and compare the combined source + implementation image.

- [P1] Selected populated state is unavailable from the current local ledger
  - Location: timeline and conditional deal drawer.
  - Evidence: `/api/hub/revenue` returns `source: preview` with `deals: []`.
  - Impact: the core interaction cannot be visually or behaviorally exercised in-browser.
  - Fix: use a browser-scoped network fixture or a connected development ledger. Do not ship mock operational rows as live data.

## Required fidelity surfaces

- Fonts and typography: blocked pending rendered comparison.
- Spacing and layout rhythm: blocked pending rendered comparison.
- Colors and visual tokens: code uses Moonlight semantic tokens, but visible fidelity remains blocked.
- Image quality and asset fidelity: no content imagery is required; icons use the existing Moonlight SVG icon library. Visible sizing/alignment remains blocked.
- Copy and content: implemented Korean labels match the selected product direction; rendered wrapping/truncation remains blocked.

## Primary interactions and console checks

- Source-contract tests cover default-closed drawer, click selection, `aria-expanded`, `aria-controls`, Escape, close, focus restoration, and the Personal Deals deep link.
- Browser interaction execution: blocked.
- Browser console check: blocked.

## Comparison history

- Pass 0: source opened; implementation capture unavailable. No visual fixes were made from an unsupported code-only comparison.

## Implementation checklist

1. Confirm permission to use local Playwright, or select an available browser with screenshot support.
2. Render a clearly labelled populated development fixture without mixing it into live/preview product data.
3. Capture default and selected-deal states at desktop plus a narrow responsive viewport.
4. Combine source and implementation captures, fix all P0/P1/P2 findings, and repeat.
5. Check keyboard interactions and console errors in the same browser session.

final result: blocked
