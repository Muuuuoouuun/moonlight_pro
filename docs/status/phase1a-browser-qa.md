# Phase 1A Browser QA Snapshot

> Date: 2026-07-13 (Asia/Seoul)
> Tested source: `5df2a2a`
> Target: local production build at `http://127.0.0.1:3101`
> Viewports: 1440×1000 desktop, 390×844 mobile
> Breakpoint probes: 720, 721, 768, 900, and 901px
> Result: PASS in the tested scope

This is the repository-owned summary of the Phase 1A browser run. It does not claim live Supabase persistence or a deployed production environment.

## Verified scope

- Daily Brief and Projects preview states at desktop and mobile widths.
- No horizontal overflow at either viewport.
- Task creation returning 401, inline secret unlock, and exact idempotent retry.
- Composer and editor retry controls dismissed when their bound input changes.
- Editor 401 unlock inside the modal drawer, retry-busy field locking, and canonical refresh.
- Completion 401 unlock and retry through canonical removal.
- Live Task rows and EditDrawer behavior at 390×844.
- Daily due labels using the same workspace timezone as lane assignment.
- Engine 409 conflict normalization and retained editor state after a failed canonical refresh.
- Expected 401/409/503 responses separated from unexpected page, console, and API errors.
- Daily and Projects loading, empty, and initial-error states at 390×844.
- Inbox saved and duplicate capture with exact requests, idempotency keys, cleared input, announcements, and restored input focus.
- Closed mobile navigation excluded from Tab order; immediate open focus, one accessible close control, Escape close, disclosure state, and trigger focus restoration.
- Responsive focus and 44px navigation targets at 720, 721, 768, 900, and 901px breakpoint transitions, including no forced restoration after deliberately defocusing into content or non-focusable sidebar space.
- Daily desktop and Projects mobile light-theme swaps with theme-sensitive descendant transitions suppressed during the palette change.

## Evidence inventory

The final passing run contains 21 screenshots:

1. `daily-preview-desktop.png`
2. `daily-preview-mobile.png`
3. `projects-preview-desktop.png`
4. `projects-preview-mobile.png`
5. `projects-inline-unlock.png`
6. `projects-drawer-mobile.png`
7. `projects-live-mobile.png`
8. `daily-live-mobile.png`
9. `daily-completion-unlock-mobile.png`
10. `projects-conflict-retained.png`
11. `inbox-capture-mobile.png`
12. `keyboard-navigation-closed-mobile.png`
13. `keyboard-focus-visible-mobile.png`
14. `daily-light-desktop.png`
15. `projects-light-mobile.png`
16. `daily-loading-mobile.png`
17. `daily-empty-mobile.png`
18. `daily-error-mobile.png`
19. `projects-loading-mobile.png`
20. `projects-empty-mobile.png`
21. `projects-error-mobile.png`

## Findings and limits

- Unexpected JavaScript exceptions: 0.
- Unexpected application API errors: 0.
- Asserted final-run findings: 0.
- Known Low finding: `/favicon.ico` returns 404; no functional impact on the Task loop.
- The expanded run and independent review exposed closed-navigation Tab leakage, delayed or lost focus while opening and resizing in both directions, stale focus intent after deliberately leaving navigation or clicking sidebar whitespace, duplicate close semantics, undersized 721–900px navigation targets, descendant theme cross-fades, and lost post-capture focus. Source `5df2a2a` closes these findings, and the strengthened complete matrix passed again afterward.
- The screenshots remain in the local QA artifact rather than Git. This file preserves the tested matrix and source commit without adding generated binaries to the repository.
- This run does not replace live migration, duplicate/conflict/rollback smoke, or short real-use verification.
