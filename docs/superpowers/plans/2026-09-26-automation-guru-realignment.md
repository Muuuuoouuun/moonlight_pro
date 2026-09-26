# Automation / Guru Realignment Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the isolated legacy endpoint task and review. The primary agent implements the coupled ledger/home changes.

**Goal:** Stop retired AI batch automation and surface only actionable operational failures at home.

**Architecture:** A shared automation policy resolves known retired keys and trigger-based execution mode. The automation repository retains historical runs and computes one current incident per active scheduled/event workflow; home consumes those incidents. Existing request-driven AI surfaces continue unchanged.

**Tech Stack:** Next.js routes, JS, node:test, Supabase REST.

## Task 1 — retire legacy execution (delegated)

Files: apps/hub/app/api/cron/{followup-autopilot,content-flywheel,chief-of-staff}/route.js and route.test.mjs; scripts/guru-autonomy.test.mjs.

- [x] Add tests asserting authenticated GET returns 410 disabled, unauthenticated guard is honored, and no AI/network/database calls occur.
- [x] Run tests before implementation to observe old behavior failing the contract.
- [x] Replace obsolete execution bodies with authenticated disabled responses pointing at existing request-driven screens. Preserve Vercel schedule exclusion.
- [x] Run affected tests and resolve obsolete source-contract assertions if necessary.

## Task 2 — policy, history and home (primary)

Files: new apps/hub/lib/automation-policy.js + test, repositories/automations-ledger.js + test, app/api/hub/daily-brief/route.js, components/hub/pages/automations.jsx.

- [x] Test orphan key recovery, retired/manual exclusion, repeated failure grouping, later success recovery, ignored/running not masking failure, old/invalid timestamps and failed source preservation.
- [x] Preserve raw lifecycle while resolving executionMode and known retired policy; never fabricate business records.
- [x] Compute incidents from the full fetched run window, before the displayed history slice. Reuse incidents for home automation cards and cross-pillar risk.
- [x] Replace misleading active/stopped copy in existing automation rows and show dated runs, without adding panels.

## Task 3 — actual scheduler and operational reconciliation

- [x] Inspect local scheduler config, launch agents and DB scheduling read-only, without printing credentials.
- [x] 운영 Vercel에서 구형 예약 3개가 남은 것을 확인. DB 자동화 2행을 백업 후 disabled로 정리.
- [ ] 별도 운영 패치 배포: 기존 운영 커밋 98d920c3 기반 7파일, 문의 동기화·점수 재계산 유지. 운영자 답변 대기.
- [x] Verify via readback; document known and unknown invocation sources.

## Task 4 — verification and integration

- [x] Run targeted regressions, full npm test, build and browser check on the real data read surface.
- [x] Independent spec then code review; address actionable findings.
- [ ] Commit only explicit paths, check git show --stat, merge into the starting integration branch without disturbing concurrent edits, remove worktree after merge.
- [x] Record evidence and limits here.


## Verification evidence — 2026-09-26

- Baseline targeted tests: 16/16. Regression tests observed failing before implementation (legacy route 6, policy 6, ledger/home 5, completion/trigger 2, bounded incident window 3), then passed.
- Final full suite: 3401 total / 3388 pass / 0 fail / 13 skip (DB-dependent tests); Hub production build exit 0.
- Spec review passed after completion-order and trigger-source truth fixes. Independent code review passed after separating the recent settled-result query from capped history. Incident query over 500 rows becomes partial with unknown attention count; read failure remains HTTP 200 error envelope.
- Browser QA: Browser skill unavailable; bundled Playwright used against 127.0.0.1:3036, real Supabase reads. 1440×1000: automation list shows both retired rows as 중단; dated history resolves orphan Guru name; row click exposes error details; console/page errors 0. 390×844 document overflow 0; existing sidebar was open in the captured mobile viewport, so detailed phone visual certification is not claimed. No AI generation or business data writes in QA.
- Live local endpoints: three old authenticated cron GETs return 410 disabled/automation-retired. Daily Brief HTTP200 live, failedSources=[], automation signals=[], automation attention metric=0.
- DB: two automations rows (followup-autopilot and content-flywheel) changed active→disabled with workspace/id/previous-status/key filters and successful readback. No chief-of-staff definition row. Original records retained at ~/.moonlight/backups/automation-realignment-20260926.json (0600). Historical run receipts untouched.
- Actual scheduler found: Vercel moonlight-pro-hub Production 98d920c3 (2026-09-24) still registers chief-of-staff 22:45, content-flywheel 22:30, followup-autopilot 22:00 UTC plus inquiries-sync21:00 and recompute-scores15:00. Cron Jobs is enabled; Hobby's one-hour execution window agrees with recorded07:40/08:21KST attempts. Source control cleanup never reached this production deployment. Prior documentation stating Vercel env0/no operational runs is stale.
- Vercel CLI token gets403; signed-in browser shows current settings. Do not switch off all Cron Jobs because it also stops the two retained operational jobs. Prepared isolated production patch at codex/retire-production-crons, based on exact current production98d920c3; targeted auth/no-side-effects tests18/18.
- No local user crontab or matching LaunchAgent/Codex/Claude scheduled-task definition found. Supabase pg_cron/pg_net extensions absent.
