# Moonlight Personal Operator Loop: Master Roadmap

Status: active roadmap
Updated: 2026-07-13

> 현재 사실과 문서 우선순위: `docs/README.md`
> 현재 단계: Phase 1A 구현·정적 검증·targeted local QA 완료, live migration/smoke 활성화 대기

## 1. North Star

Moonlight turns every project, business, relationship, content idea, automation event, and useful note into an action, decision, or repair path.

The roadmap is not organized around three legacy projects. Those projects remain seed lanes, but the product boundary is broader: all active work and business information that should change what the operator does next.

## 2. Operating Principles

- **Action-first:** every important record should have a next action, owner, due point, or explicit waiting reason.
- **Ledger-first:** Engine writes durable state and correlation IDs before Hub tries to interpret it.
- **Private loop first:** prove daily operator gravity before rebuilding public surfaces.
- **Guided repair, not auto-patching:** AI can summarize failures and propose fixes, but code changes stay human-approved.
- **Open-ended lanes:** project/business/content/revenue lanes are data-driven, not hardcoded around old names.
- **Mobile reality:** capture, review, and approve from phone-friendly Hub and Telegram flows.

## 3. Phase Gates

### Phase 0: Foundation, Shipped

- Turborepo active workspace with `apps/hub`, `apps/engine`, and `packages/*`.
- Supabase ledger foundation.
- Public web detached from active workspace.
- Hub/Engine health endpoints.
- Basic contract checks and CI.
- Content variant canonical contract.
- Honest write response taxonomy and live-empty/error UI.
- `Junhyuk Mun` operator identity and atomic Content draft approval.
- Verification: Node test 50/50, contracts, typecheck, Hub/Engine build.

Implementation record: `5c9ccc2` on `codex/moonlight-phase0-trust`.

### Phase 1: Daily Control, Current

Goal: Moonlight becomes the first-open surface.

Must ship:

- **1A Durable Task Loop:** quick text → durable task → task-only Today → complete → reload. 구현·정적 검증·targeted local production-build QA는 완료했고 live DB migration/smoke는 환경 설정 뒤 남았다.
- **1B Action Desk:** real follow-up and Google Calendar sources, urgent KA 1, focus customers 3~5, deterministic ranking.
- **1C Contact Outcome Loop:** summary, reaction, next action/date, activity, and task creation in one durable flow.
- Existing Work OS surfaces remain read-only/contextual in Phase 1; durable Project CRUD, checklist progress, delay, and bottleneck management begin in Phase 3.
- Content and Revenue remain contextual lanes, not competing home dashboards.

Exit gate:

- Hub can answer "what matters today?" in under 5 seconds.
- At least 90% of active records have a next action or waiting reason.

### Phase 2+: Non-binding sequence

The sequence below matches the active deep design. These phases are directional, not approved implementation contracts; each requires a separate design gate after Phase 1 usage.

- **Phase 2 — Person-first Customer Continuity:** Contact 중심 detail, Account/Opportunity/Activity/Task 연결, KA·집중 신호, verified owner scope.
- **Phase 3 — PMS:** durable Project CRUD, checklist and relation editing, candidate inbox, progress, delay, bottleneck, monthly review.
- **Phase 4 — ClassIn Bridge:** HMAC bootstrap, Account+Contact import, missing-only sync, conflict comparison, official-object and activity-summary outbox.
- **Phase 5 — Content Intake:** single idea inbox, raw/link capture, Studio handoff, parent idea and channel variants.
- **Phase 6 — Audio and Review Automation:** recording/transcript, 30-day raw-audio retention, reviewed AI analysis, cost ledger, quarterly review.

Closed execution, decision memory, guided repair, and public proof remain outcome themes, not competing numbered phases. They enter only when the matching phase closes a real operator loop; public proof still waits for 30 days of sticky private use.

## 4. Current Priority Stack

1. Hub·Engine·Supabase live 환경 설정과 Phase 1A migration 적용.
2. create→reload→complete→reload, duplicate, stale conflict, rollback live smoke.
3. 짧은 실사용으로 누락·재시도·우선순위 행동 확인.
4. Phase 1B real follow-up and Google Calendar aggregation.
5. Phase 1C contact outcome and next-action loop.
6. Phase 2 person-first customer continuity and verified owner scope.
7. Phase 3 Project candidate, checklist, delay, and bottleneck management.
8. Phase 4 ClassIn bootstrap, missing-only sync, conflict comparison, and official outbox.
9. Phase 5 Content idea → variant → handoff/export history.
10. Phase 6 audio, reviewed analysis, cost ledger, and quarterly review.
11. Guided repair and broader integration readiness as a cross-phase outcome theme.

## 5. Retired Premises

| Old premise | Replacement |
| --- | --- |
| Moonlight is a Hub for three projects | Moonlight is a universal private command loop for all projects, businesses, and information streams. |
| Public Landing is an active workspace layer | Public proof is deferred until private execution has gravity. |
| Self-Evolution means automated code patching | Guided repair: AI proposes, human approves, Engine/ledger records. |
| Classinkr green defines product design | Moonlight Pro moonstone design system in `DESIGN.md`. |
| Milestones are app surfaces | Milestones are proof gates for behavior and execution loops. |

## 6. Exit Rule

When choosing the next implementation round, do not ask "what new tab should exist?"

Ask:

1. Which signal is currently not becoming an action?
2. Which action is not producing a logged result?
3. Which failure is not visible or repairable?

Build the smallest complete loop that closes one of those gaps.
