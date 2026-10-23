원본 증거 폴더는 `/tmp/moonlight-checkbox-corner-20261023/production/`과 `/tmp/moonlight-checkbox-corner-20261023/fab/`다. 아래 상대 파일명은 각각 해당 원본 폴더를 기준으로 한다. 저장소에는 운영 데이터·자격 증명·업무 화면을 복제하지 않았다.

# My Work checkbox corner — actual production-route verification

2026-10-23. Candidate **804957036f700b04ef7c3c176b8fd1abeba82a6d**, integrated as **172238f9**. `git diff 80495703 172238f9 -- apps/hub ':!*.test.mjs'` is empty. Own actual Next production build **dfS5PRd0Y8ucSFcDWGK2m** completed successfully. No application source was changed during this follow-up.

## Scope and isolation

The unmodified production HTML, JavaScript, CSS, and fonts were served over HTTP by the candidate's Next production server on localhost:3167. The complete `/dashboard/work/my` route was used, with the real local operator login and temporary credentials. Server environment was allowlisted and contained no Supabase, Engine, or model API credentials. A Node fetch/socket guard rejected non-loopback egress; browser interception rejected external origins and unexpected writes. No blocked external attempt was recorded. No operational DB was contacted and no operational business write was sent.

Only the attention read and session recovery read received temporary local responses. Two public synthetic tasks, one short title and one long hidden title, were kept in the external temporary harness; none were added to the repository. Completion PATCH was intercepted locally, checked for the exact expected task ID/status, and answered with `saved`. This validates the UI-to-request contract, **not database persistence**. The earlier isolated-database report remains separate. CSS was not injected or modified at runtime.

## Executed matrix and results

Bundled Playwright Chromium, mobile emulation with actual touchscreen tap events, viewport 320×844 and 390×844, light and dark themes. `innerWidth`, `visualViewport.width`, scale 1, and coarse pointer were asserted. Fonts and finite animations settled before geometry/screenshots. This is browser mobile emulation, not physical-device verification.

All four conditions passed:

- First and last rows: each centered 44×44 integer-coordinate grid (offsets −22…21) hit its own checkbox at all **15,488 samples**, **0 misses**. Both visible faces remain **14×14px**, with adjacent rows 44px high. No sample hit a neighboring checkbox.
- Four ±21px corner taps on each first/last row: **32 actual corner taps** each changed only the expected checkbox, then Undo restored the same row. No completion request was sent. A further 3.6-second observation covered late timers and confirmed both rows remained.
- The first displayed letter of each title: **8 actual taps** each opened that task's detail panel with its full title. No extra completion mutation or request occurred. Panels were closed through their actual close button.
- A final lower-left corner tap per condition completed the last task and generated **exactly one intercepted PATCH** with that task ID and `status: done`. Only the first row remained after the local read response reflected the completion.
- The hidden badge remains visible; date text is unchanged and its rectangle stays inside the row's right padding. Row and document horizontal overflow are zero. Page errors, console errors, unexpected writes, and external browser requests are zero.

Aggregate evidence is in `summary.json`; per-condition geometry, touch routing, Undo, title results and intercepted writes are in `results.json`. The initial 320-light run and remaining three conditions were run sequentially; `RESUME=1` skips already completed conditions while preserving their results.

## Visual review and limitation

The four actual-route PNGs were opened and visually reviewed: `route-320-light.png`, `route-320-dark.png`, `route-390-light.png`, `route-390-dark.png`. Korean text, 14px checkbox faces, hidden badge and title ellipsis render. The intended coarse-pointer column effect is unchanged from the source review: checkbox moves 14px, title starts 30px farther right, reserving a 44px column without widening Card radius or changing fine-pointer density.

**Separate observation:** at the captured bottom scroll position in **320px dark**, the unchanged lower-right floating pencil button visually covers part of the final date. The date remains inside its row and the checkbox/title touch tests pass, but this report does not claim that every date pixel is unobscured. The observation was reported to the parent; no broad layout change was made. No full-route pre-change baseline was run for this observation, so it is not assigned to or ruled out as a regression by this follow-up.

The first exploratory full-route run also showed that the previous Undo toast could obscure a later independent trial. The final harness closes prior notifications using the real `알림 닫기` control before positioning the next row. It does not hide them with injected CSS. This separates successive trials without suppressing the product's notification behavior.

## Reproduction and cleanup

- `run.cjs`, `egress-guard.cjs`: allowlisted build/start wrapper and server egress guard. Credentials are read from a separate temporary file and are not printed or copied here.
- `check.cjs`: full-route browser checks; `run-first.log` and `run-remaining.log`: executions.
- `build.log`, `server.log`: actual production evidence.
- `../REPORT.md`: earlier source-component fixture, desktop/fine-pointer comparison, 600px coverage and 79 passing regression tests. Those results are not represented as production-route tests.

No score increase is inferred. Cleanup status is recorded separately in `cleanup.json` after the browser/server are stopped and the clean, integrated worktree is removed.


---

# My Work mobile footer clearance

Follow-up to the independently passed checkbox-corner correction. Baseline source **80495703** (runtime equivalent to integrated **172238f9**), actual production build **dfS5PRd0Y8ucSFcDWGK2m**. The 804 production interaction results remain in `../production/REPORT.md`; they do not resolve the newly observed date obstruction.

## Confirmed before correction

At 320×844 dark, scrolling the actual `main.hub-content` to its maximum leaves the final date beneath the fixed memo launcher. The document itself is not scrollable: scrollTop 0, clientHeight/scrollHeight 844/844. The main is scrollTop **122**, clientHeight **746**, scrollHeight **868** (maximum 122). The date rectangle is x217, y789, 64×14 (bottom803); the memo button is x256, y780, 48×48 (bottom828). Overlap remains at maximum scroll. My Work's existing bottom padding is 24px.

At 390×844 dark with the same two local rows, main has 0/746/746 and the date bottom755 is above FAB top780, so this specific short page does not overlap. The 320px issue is not solved by telling the user to scroll farther.

`../production/fab-maxscroll.json` records the full ancestor scroll geometry and `../production/maxscroll-320-dark.png` shows the maximum-scroll picture. The earlier `2efb3c3d` and baseline804 have identical My Work, QuickMemo and Hub app source; only checkbox-specific CSS changed. A separate 2ef production baseline was not executed, so this report uses804 as the measured baseline.

## Completed narrow correction

Add `hub-mywork-page` to the existing page wrapper and, at max-width600 only, set its bottom padding to `48px + max(16px, env(safe-area-inset-bottom)) + 16px` (80px with zero safe-area inset). This uses existing scroll content to reserve room for the existing 48px memo launcher, its16px bottom offset, and 16px gap. No new surface, content, or control is added; main, other routes, FAB position, row targets/radius and fine-pointer desktop layout are not modified. Existing top/right/left padding stays unchanged.

The same 79 relevant responsive, motion and My Work tests passed. Actual production and geometry comparison results are complete below; no runtime CSS injection was used.


## Final actual production verification

Committed as **7c4e7bb7** and integrated as **4fcc1a7c**: two files, 9 additions / 1 deletion. `git diff 7c4e7bb7 4fcc1a7c -- apps/hub ":!*.test.mjs"` is empty, confirming the tested Hub runtime source is identical to the integrated source. Actual production build **kXWAzuJhiEg_D_HNcmKTK** completed successfully. The browser used its emitted CSS and application code without CSS injection. Temporary local authentication/read fixtures/write interception and server egress controls were the same as the earlier production verification; no operational DB or external business write was used.

All **4 production interaction conditions** (320/390 × light/dark) passed again: 15,488 hit samples with 0 misses, 32 actual corner taps with the correct task completion and Undo, 8 title-first-letter taps with the correct detail and no completion, four final lower-left completions with exactly one locally intercepted PATCH per condition, and four memo dialog open/close cycles without business writes. Page/console errors were zero. The entire last row, its checkbox, and date are above the memo button in all four cases. Mobile row action buttons retain display:none, rather than becoming overlapping targets.

**16 before/after geometry comparisons** (320/390/600 touch and 1440 fine × light/dark × two-row live and zero-row live-empty) passed. At scrollTop 0, heading, quick task input, first/last row, checkbox/date, row actions, memo button, and empty-state rectangles are identical to baseline. Main viewport rectangle is unchanged. At 1440, all captured top/bottom geometry and scrolling dimensions are identical. Horizontal overflow remains 0. This correction adds only scrollable space at the end where required; it does not shift the first action down.

At 320 dark, maximum main scrollTop increases122→178, scrollHeight868→924 (clientHeight746 unchanged). Final row bottom818.5→762.5 and date bottom803→747, clearing FAB top780 by 17.5px for the whole row. At 390 dark, maximum scrollTop 0→8 moves row bottom770.5→762.5. At 320/390 light and 600 both themes, short content already clears the button and the last row's viewport position stays unchanged. Nonzero safe-area insets are accounted for in CSS but were not physically measured on a device; emulated Chromium reports a zero inset.

The four mobile actual-route screenshots and before/after empty-state pictures were visually reviewed. Korean text, hidden badge and date are retained; the dark 320 date obstruction is removed. The intentionally changed screenshot at maximum scroll follows the increased available scroll range. No new panel, label or surface was introduced, no palette/radius/border changed, and the desktop density is unchanged. The dedicated class keeps the correction within My Work and the bottom-padding property avoids changing the main shell or other routes.

## Evidence

- `summary.json`: final aggregate, source/build identity and limits.
- `candidate/results.json`, `interaction.cjs`, `interaction.log`: actual whole-route touch, Undo, title, memo and intercepted completion checks.
- `comparison.json`, `compare.py`, `geometry.cjs`: asserted before/after position comparison.
- `baseline/geometry-{live,empty}.json`, `candidate/geometry-{live,empty}.json`: measured rectangles/scroll values at each condition.
- `baseline/bottom-live-320-dark.png` versus `candidate/bottom-live-320-dark.png`: confirmed obstruction and correction.
- `candidate/route-320-light.png`, `candidate/route-320-dark.png`, `candidate/route-390-light.png`, `candidate/route-390-dark.png`: actual production-route pictures from the interaction test.
- `build.log`, `server.log`, `../production/fab-node-tests.log`: production build/start and 79 passing source tests.

No performance or score gain is inferred. The synthetic business read and completion response are outside the repository; this report does not represent DB persistence testing. Final browser/server shutdown and clean-worktree removal are recorded in `cleanup.json`.
