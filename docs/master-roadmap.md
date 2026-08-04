# Moonlight Personal Operator Loop: Master Roadmap

Status: active roadmap
Updated: 2026-07-15

> 현재 사실과 문서 우선순위: `docs/README.md`
> 현재 단계: Phase 0·Phase 1A 완료, Phase 1B 부분 작동. Quick Capture의 task/work-order 두 destination과 공통 receipt, task-only Today 완료·재조회는 live이며 정식 Attention adapter와 Calendar agenda 계약이 다음 범위

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

- **1A Durable Task Loop:** quick text → durable task → task-only Today → complete → reload.
- **1B Action Desk:** real follow-up and Google Calendar sources, urgent KA 1, focus customers 3~5, deterministic ranking.
- **1C Contact Outcome Loop:** summary, reaction, next action/date, activity, and task creation in one durable flow.
- Work OS shows live projects, blockers, decisions, routine checks, and next actions.
- Content and Revenue remain contextual lanes, not competing home dashboards.

Exit gate:

- Hub can answer "what matters today?" in under 5 seconds.
- At least 90% of active records have a next action or waiting reason.

### Phase 2: Closed Execution

Goal: actions taken in Hub or external channels produce durable execution history.

Must ship:

- Hub-to-Engine intent endpoints for content handoff, run retry, and routine checks.
- Telegram command results visible in ledger and user reply.
- GitHub read sync into Work OS.
- Gmail/Resend send paths with `sync_runs` and user-visible preview/sent/failure states.
- Content handoff logs for publish/export/provider outcomes.
- Idempotency and honest partial/failed responses across public write routes.

Exit gate:

- A real signal can enter Engine, appear in Hub, become an action, execute, and return a result to the ledger.

### Phase 3: Decision Memory And Repair

Goal: failures and decisions compound into operational learning.

Must ship:

- Decision capture with context/options/rationale/review point.
- Failure grouping by cause and affected lane.
- Repair proposal queue with owner, priority, and approval state.
- Runbook links for repeated operational failures.
- AI briefs that cite ledger context and become accepted tasks/decisions.

Exit gate:

- Failed automation has owner, cause, and retry/repair path within 24 hours.
- One AI recommendation per week becomes an accepted task or decision.

### Phase 4: Public Proof Engine, Later

Goal: public output is generated from proven private execution, not from a separate public app.

Candidate outputs:

- case-study pages,
- content artifact exports,
- public changelog,
- campaign proof,
- operating essays generated from decision logs.

Exit gate before starting:

- private command loop is sticky for 30 days,
- ledger has enough clean history to export proof without manual cleanup.

## 4. Current Priority Stack

1. Finish Phase 1B Attention adapter, real Google Calendar agenda, source timeout/partial contract, and stable slotting. Daily Brief already reads six live ledgers and exposes three verified-owner focus customers without unassigned CRM records.
2. Build Phase 1C atomic contact outcome and next-action loop. Existing outcome logging is not the required one-transaction completion flow.
3. Keep the completed Phase 1A task/inbox receipt spine, live PMS, and three ClassIn content lanes on their existing Hub→Engine→Supabase write boundaries while Phase 1 closes.
4. Project candidate, delay, and bottleneck management.
5. Content idea → variant → handoff/export history.
6. Guided repair and broader integration readiness.

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
