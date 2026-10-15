# Home Morning Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. The operator already directed implementation in this session; execute inline.

**Goal:** Add a concise source-backed morning brief and the existing one-line Guru tip below the Home schedule.

> 2026-09-30 운영자 정정: 이 계획의 카드 내부 Guru 팁 배치는 대체됐다. 최신 위치와 통합 선택 범위는 같은 날짜의 `../specs/2026-09-29-home-morning-brief-design.md` §목적과 위치·§내용 4를 따른다.

**Architecture:** A pure selector forms three factual rows from the existing daily-brief and calendar responses. Home lifts its current calendar read to share it with the schedule and new brief. The existing GuidanceInlineTip renders inside the brief card and retains its own cadence and detail link.

**Tech Stack:** Next.js client React, JavaScript, CSS tokens, Node test runner.

---

### Task 1: Source-backed briefing model

**Files:**
- Create: `apps/hub/components/hub/pages/home-morning-brief.js`
- Test: `apps/hub/components/hub/pages/home-morning-brief.test.mjs`

- [x] **Step 1:** Add tests for urgent KA and next ongoing/future timed event; task focus `picked/done`; disconnected/error/partial sources. Call `buildHomeMorningBrief({ brief, schedule, now })` and assert each returned row `text` and `state`.
- [x] **Step 2:** Run `node --import ./scripts/register-hub-alias.mjs --test apps/hub/components/hub/pages/home-morning-brief.test.mjs`; confirm the missing export fails.
- [x] **Step 3:** Implement `buildHomeMorningBrief` to return `{ attention, agenda, progress, state }`. Treat only `live`/`partial` slices as readable. Use the first urgent source-backed candidate; filter timed events by `end > now`; never turn failed reads into empty counts.
- [x] **Step 4:** Run the same test and confirm it passes.

### Task 2: Home rendering and reused tip

**Files:**
- Modify: `apps/hub/components/hub/pages/home.jsx`
- Create: `apps/hub/components/hub/pages/home-morning-brief.css`
- Modify: `apps/hub/components/hub/guidance-inline-tip.test.mjs`
- Test: `apps/hub/components/hub/pages/home-morning-brief-surface.test.mjs`

- [x] **Step 1:** Add a Home surface test for section order `TodaySchedule → MorningBrief → footer`, one `GuidanceInlineTip variant="today"` inside it, and two navigation actions. Update the existing guidance tip placement test to allow exactly one Home tip and keep Today/Overview constraints.
- [x] **Step 2:** Run both tests and confirm failure because Home lacks the new section.
- [x] **Step 3:** Extend the existing daily-brief hook with `dailyFocus`, `taskToday`, `generatedAt`; lift `useTodaySchedule` to Home and pass it to `TodaySchedule`. Render `MorningBrief` below schedule using `buildHomeMorningBrief`, `TruthBadge`, `Skeleton`, existing tip, and buttons that only navigate. Style with Futura/token CSS and 44px mobile actions.
- [x] **Step 4:** Run the two tests and model test until they pass. Inspect the desktop and 390px rendered Home for layout, status wording, and contrast.

### Task 3: Verification and finish

**Files:** all files above.

- [x] **Step 1:** Run targeted Home, GuidanceInlineTip, state usage, motion, and no-mock-data tests.
- [x] **Step 2:** Run Hub lint/typecheck/build if available; investigate failures attributable to this change.
- [x] **Step 3:** Review diff for hardcoded sample records and unwanted changes; stage named paths only and commit on `codex/home-morning-brief`.

## Self-review

The plan covers position, content, source states, existing tip reuse, on-demand AI, mobile layout, and regression checks. It introduces no new API or persistence. The prior standalone HTML is a review artifact and is not copied into production.
