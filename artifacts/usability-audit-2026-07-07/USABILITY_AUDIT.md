# Moonlight Hub Usability Audit

Date: 2026-07-07
Target: `apps/hub` on existing dev server `http://localhost:3000`
Mode: combined UX, design-system, and accessibility audit
Destination: local folder

## Captured Steps

| Step | Screenshot | Route / State | Health |
| --- | --- | --- | --- |
| 1 | `screenshots/01-desktop-daily-brief.png` | `/dashboard/daily-brief` | Strong first-screen signal, but dense action queue and many sub-44px controls. |
| 2 | `screenshots/02-desktop-classin-pipeline.png` | `/dashboard/classin/pipeline` | Honest empty/live state; good trust posture. Empty state action is visible but not strongly directional. |
| 3 | `screenshots/03-desktop-brand-queue.png` | `/dashboard/brand/queue` | Clear queue surface; table-like layout is efficient on desktop but likely scroll-first on mobile. |
| 4 | `screenshots/04-desktop-automations-runs.png` | `/dashboard/automations/runs` | Broken. Client runtime error prevents the page from loading. |
| 5 | `screenshots/05-desktop-command-palette.png` | Command palette open | Visually useful and fast, but lacks dialog/search accessibility semantics. |
| 6 | `screenshots/06-desktop-operator-session.png` | Operator lock panel open | Copy explains the locked write state clearly; popover semantics and focus handling need hardening. |

Mobile screenshots were not captured. The in-app Browser failed to attach to its webview twice, and the Chrome fallback did not expose viewport override. Mobile risks below are therefore based on code/CSS inspection, not rendered-device screenshots.

## Strengths

- Daily Brief answers the core operator question quickly: what needs attention today, what is live, and what can be approved.
- Workspace IA is much clearer than a generic dashboard: `클래스인` and `브랜드` are first-class, while older global menus are secondary.
- Preview/live status is visible in many places, and ClassIn empty state does not mix fake live data with missing Supabase data.
- Shared primitives and token file exist, so many fixes can be made once and reused.
- Command palette is discoverable in both sidebar and topbar workflow, and focus lands in the search input when opened.

## Top Risks

1. P1: `/dashboard/automations/runs` is broken in the browser.
   The page renders a Next runtime error: `Objects are not valid as a React child (found: object with keys {openTasks, recentUpdates, activeProjects})`. The likely source is `mapRuns` passing `row.output_payload?.summary` through as `detail`, while `Runs` renders `r.detail` directly.
   Evidence: `apps/hub/lib/repositories/automations-ledger.js:131`, `apps/hub/components/hub/pages/automations.jsx:384`.

2. P1: Core interactive records are mouse-first.
   Signal cards, KPI cards, deal/account rows, and council cards often use clickable `div`/`Card` patterns without button/link semantics, keyboard reachability, or robust accessible names.
   Evidence: `daily-brief.jsx`, `revenue.jsx`, `agents.jsx`.

3. P1: Command palette and popovers are visually modal but not semantically modal.
   Command palette lacks `role="dialog"`, `aria-modal`, an accessible label, focus trap, and focus return. Operator panel has the same family of issue.
   Evidence: `apps/hub/components/hub/hub-command-palette.jsx:52`, `apps/hub/components/hub/hub-topbar.jsx`.

4. P1: Small controls conflict with the 44px target requirement.
   Primitive `Button` sizes are 24/30/34px tall, `IconButton` is often 24/28px, and `Checkbox` is a 14px unlabeled button. Runtime sampling found many visible controls below 44px on every captured desktop screen.
   Evidence: `apps/hub/components/hub/hub-primitives.jsx:123`, `apps/hub/components/hub/hub-primitives.jsx:275`.

5. P2: Design-system drift is active in page-level UI.
   Several pages hardcode purple, green, warm gold, pink, brown, or thicker selected borders despite the Moonlight moonstone/hairline rules.
   Evidence: `content.jsx`, `agents.jsx`, `automations.jsx`, `projects.jsx`.

6. P2: Mobile is still scroll-first in important operational tables.
   `.hub-table-card` forces 720px-ish minimum widths and several active tables keep many fixed columns. This preserves desktop density but makes phones pan across data.
   Evidence: `apps/hub/components/hub/hub-tokens.css:207`, `automations.jsx:101`, `revenue.jsx:662`.

7. P2: Focus and labels are uneven.
   Some text fields use `outline: none`, placeholders stand in for labels, and custom checkbox state is not exposed semantically.
   Evidence: `content.jsx:713`, `agents.jsx:281`, `revenue.jsx:1137`, `hub-primitives.jsx:275`.

8. P2: Low-contrast microcopy may miss AA.
   `--fg-faint` is used for many 10-11px metadata labels. Static contrast estimates put it below AA on dark surfaces.
   Evidence: `apps/hub/components/hub/hub-tokens.css:25`.

## Recommendations

1. Fix the run-log crash first.
   Normalize run `detail` to a string in the repository layer, for example stringify/summarize object payloads before returning UI data.

2. Promote accessible interaction primitives.
   Add shared patterns for clickable cards/rows, dialog/popover, checkbox, input label, and command palette items. Then sweep pages to use those instead of inline `div` controls.

3. Set a target-size policy by density and pointer type.
   Desktop compact density can stay visually tight, but clickable hit areas should be at least 44px on coarse pointers and not collapse to 14-28px for icon/checkbox controls.

4. Convert mobile tables into card summaries for primary workflows.
   Keep horizontal scroll for secondary/admin tables, but use stacked cards for Daily Brief approvals, queue items, leads/deals, and run logs.

5. Run a design-token drift sweep.
   Replace non-canonical accents and 2px borders with tokenized moonstone/status chips and 1px hairlines.

6. Align state language.
   Prefer `preview`/`live` over `mock` in operator-facing labels, matching the repo rule and the stronger Daily Brief language.

## Evidence Limits

- Screenshots cover desktop Chrome at `1920x856`.
- Mobile findings are static inspection only; real 375px/390px screenshots are still needed.
- Keyboard focus order was partially inferred from code and popup behavior; a full tab-order pass is still needed.
- Contrast was estimated from tokens and visible usage, not measured with a rendered pixel contrast tool.
- No files in the app were edited during this audit.
