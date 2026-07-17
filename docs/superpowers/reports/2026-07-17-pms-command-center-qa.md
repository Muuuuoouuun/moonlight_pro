# Moonlight PMS Command Center QA

Date: 2026-07-17

Branch: `codex/pms-command-center`
Result: **PASS — 91/100** (acceptance gate: 86)

## Verification gate

- `npm test`: 374/374 passed
- `npm run check:contracts`: passed
- `npm run typecheck`: passed
- `npm run build`: passed
- `git diff --check`: passed
- Final error-state specification review: PASS
- Final independent production review: Ready, no critical/important findings

The browser pass used the configured live Supabase ledger in read-only mode. No live create, edit, task completion, or rhythm check-in was submitted. Durable writes, retries, conflicts, idempotency, and relationship guards are covered by automated route/service tests.

## Browser and desktop evidence

- Live ledger: 7 projects, 8 open tasks, 4 active projects, 2 blocked/overdue projects
- Progress evidence observed: task-derived 50%, task-derived 100%, and explicitly labelled reported 80%
- Exact project UUID survived Projects detail, Timeline, Roadmap, and Rhythm navigation
- Timeline rendered due markers and undated work without inventing a start date
- Roadmap rendered an honest live-empty state for the current four-month data window
- Rhythm rendered four ledger rituals with project-aware labels
- Create drawer: empty title, labelled fields, advanced status/priority/due controls, validation feedback, title autofocus, Escape focus restoration
- Mobile project detail: full-width dialog, close-button focus, Escape restoration to the exact originating row
- Mobile navigation: closed links absent from the accessibility tree, modal semantics while open, main content inert, Shift+Tab wrap, Escape restoration to the menu button
- Forced configured-read failure: Overview and Projects showed `error`, withheld summary values, identified failed sources, and exposed retry instead of preview or fake zero
- Workspace ID without Supabase configuration: repository and route tests prove explicit `preview` with no fetch
- Client-supplied workspace IDs are discarded at all Hub write boundaries; the server-configured workspace is authoritative
- Capped ledgers expose lower-bound/partial counts, while an exact selected project and its six detail sources are fetched workspace-safely and merged without duplicates

Selected captures:

- `/Users/bigmac_moon/.codex/visualizations/2026/07/17/019f6d9b-464f-7f70-be66-a1fda23ed832/pms-live-desktop-1440.png`
- `/Users/bigmac_moon/.codex/visualizations/2026/07/17/019f6d9b-464f-7f70-be66-a1fda23ed832/pms-live-mobile-detail.png`
- `/Users/bigmac_moon/.codex/visualizations/2026/07/17/019f6d9b-464f-7f70-be66-a1fda23ed832/pms-mobile-nav-open.png`
- `/Users/bigmac_moon/.codex/visualizations/2026/07/17/019f6d9b-464f-7f70-be66-a1fda23ed832/pms-desktop-drawer.png`

## Acceptance score

| Area | Score | Evidence |
|---|---:|---|
| Information architecture | 14/15 | One project identity and stable deep links across Projects, Timeline, Roadmap, and Rhythm |
| Core workflows | 18/20 | Safe create/update, exact detail, evidence progress, conflict/retry recovery, durable rhythm contracts |
| Visual hierarchy and density | 13/15 | Portfolio metrics, next-action/risk/due hierarchy, compact Moonstone surfaces |
| Responsive behavior | 11/12 | 1440 desktop and 390 mobile verified; full-width mobile detail and modal navigation |
| Accessibility | 11/12 | Keyboard rows, named controls, focus trap/restoration, inert navigation, progress semantics |
| Feedback and recovery | 10/12 | Preview/error/partial/live-empty taxonomy, retry, draft preservation, aria-live feedback |
| Data truth and integrations | 14/14 | Raw/display separation, evidence progress, idempotent guarded writes, lossless ledger projections |
| **Total** | **91/100** | **PASS** |

## Fidelity ledger

1. **Information hierarchy:** The shipped UI keeps Moonlight's two-tier sidebar and groups projects by container. This is more faithful to the operator model than the concept's flatter list.
2. **Density:** Portfolio counters and compact rows preserve command-center scan speed without turning cards into bright dashboard tiles.
3. **Drawer/detail behavior:** Detail opens only after a project is selected; mobile transforms it into a full-width sheet. The concept's always-visible desktop detail was intentionally avoided to protect list width.
4. **Progress treatment:** Shipped progress is task evidence first, explicitly reported legacy progress second, and indeterminate otherwise. The concept's dual/manual formula was not implemented because it is not approved product truth.
5. **Responsive transformation:** Desktop retains list/detail context; 390px mobile prioritizes portfolio and project cards, then presents detail and navigation as focus-managed overlays.

## Known limits

- Live-browser QA was intentionally read-only; mutation safety is proven by automated integration and contract tests.
- The Next.js development toolbar appears in local screenshots but is not part of the production UI.
- A forced-error screenshot timed out in the browser capture layer; the same state was verified through the live accessibility DOM snapshot.
- The current live Roadmap is empty because no ledger dates fall inside the displayed four-month window; the empty state is deliberate, not mock data.
