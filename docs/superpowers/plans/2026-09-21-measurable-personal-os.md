# Measurable personal OS implementation plan

> Status: implemented and locally verified on 2026-09-21. Production migration/deployment remain separate. See [validation and evaluation](../../evaluations/2026-09-21-measurable-personal-os-validation.md). This contract does not add operator decisions beyond the requested goal.

## Outcome

Connect objectives and measurable key results to existing work, preserve dated evidence, and offer useful AI assistance through Gemini and provider-neutral MCP. Keep manual operation useful when AI is unavailable. Do not count drafts, task completion, or approval as business outcomes without an explicit metric definition.

## Contract

- Shared pure package `@com-moon/goal-contracts`: validation, source catalog, progress, API projection. Public scope is `personal|company`; legacy `classin` is normalized only at source boundaries.
- Objective: `id,title,description,scope,periodStart,periodEnd,timezone,status,revision`. Dates are inclusive local dates in the declared IANA timezone. Status `active|archived`.
- Metric/KR: `id,objectiveId,name,unit,role,direction,baseline,target,targetMin,targetMax,sourceKey,revision`. Role `outcome|driver|guardrail`; direction `increase|decrease|range`; source `manual|tasks_completed|contacts_recorded|content_published|reviews_completed`. Definitions are immutable once created; archive and replace to change meaning.
- Observation: append-only period snapshot, never additive to another snapshot. `id,metricId,value,observedAt,periodStart,periodEnd,coverage,evidence,note,sourceKey`. `coverage=complete|partial|unmeasured`; incomplete values cannot become achieved. Corrections preserve old snapshots. Manual complete observations require dated evidence; missing is distinct from zero. Latest observation for the exact period and current definition determines progress.
- Link: `objectiveId,entityType,entityId`; entity allowlist projects/tasks/campaigns/brands/content_items/deals/leads/customer_accounts/memos/journal_entries. Validate same-workspace existence inside the RPC. Linking does not increment a metric.
- Commands: `{commandId,action,expectedRevision?,input}`. Actions `create_objective,update_objective,create_metric,archive_metric,record_observation,link_entity,unlink_entity`. Successful response `{status:'saved',persisted:true,replayed,commandId,entity}`. Same ID with different input conflicts. CAS protects mutable definitions. Ambiguous transport returns persisted:null and instructs receipt lookup; no automatic replay with a new ID.
- SQL tables use `operating_*` prefix and one `operating_goal_command_v1` transaction with durable receipts, RLS, revoked public execution, service-role access, workspace isolation.
- Hub GET `/api/hub/goals?scope=personal&objectiveId=&entityType=&entityId=` returns `{status,source,objectives,metrics,observations,links,asOf}`. Errors use HTTP 200 + status:error. POST `/api/hub/goals/commands` uses Hub write guard. GET receipt via same path `?commandId=`. Auto measurements are generated server-side from allowlisted adapters; a client cannot assert automatic provenance.
- Shared repository exports `getGoalsLedger(options)`, `executeGoalCommand(payload, context?)`, `getGoalCommandReceipt(commandId, context?)`; context optional `{workspaceId,actorId}` is only supplied by authenticated server code. Repository metrics include `measurement` and `progress` projections.
- Auto adapter root-owned `apps/hub/lib/metrics/source-adapters.js` exports `measureGoalMetric({sourceKey,scope,periodStart,periodEnd,timezone,workspaceId})` returning `{value,coverage,evidence,observedAt,sourceKey,periodStart,periodEnd,reason?}`. Queries must report truncation/read failure, actual event timestamps and scope. `tasks_completed` explicitly means currently-done cohort, not immutable historic completion events.

## Implementation ownership and sequence

1. Backend: goal-contracts, migration, repository, guarded Hub routes, transactional database and pure tests. Start tests before implementation.
2. UI: `現況 / 현황` goals subview, goal detail/create/measure, common links panel in project/task/content/CRM/campaign/brand/memo/review surfaces where entity identity exists; preserve deep links and scope. Shared primitives, accessible controls, failure-safe input and command-ID reuse.
3. AI: correct mentor/cron contract and real model attribution; add bounded work-context, persisted AI candidates and review outcomes, Gemini assistance and scoped MCP tools/profile using same service. Preserve evidence, source revision, usage unknown versus zero, separate suggestion from application. No outbound send/publication.
4. Root: automatic source adapters and truthful weekly report integration; integration review, real local DB/browser/API checks, no-mock/token/motion gates, full suite and build.

## Acceptance and evaluation

- All sources: explicit workspace and company/personal boundaries, complete/partial/unmeasured states, zero/negative/decrease/range/period/timezone edge cases, query caps, evidence and no duplicate snapshots.
- All writes: durable receipt, duplicate request, ID collision, stale CAS, cross-workspace link denial, unavailable persistence, unknown outcome recovery. No preview write success.
- UX: 390/768/1440 widths, keyboard creation/close/focus, states and input recovery, goals accessible from overview and related work, loading uses Skeleton. No business dummy records in code.
- AI: bounded source-backed output, saved candidate distinct from applied work, stale-source checks, outcome/time fields with unknown baseline remaining unknown, actual model/usage attribution, MCP discovery in three client-compatible stdio configs.
- Test evidence precedes claims. Baseline: 1,481 passed, 11 skipped, zero failures on 2026-09-21. Skips are not passes. Existing doctor confirms main-workspace reads only, no new-feature write or worker success.
- Six scored axes: workflow usefulness, measurement/integration, AI usefulness, durability/recovery, design/accessibility, performance/operations. Five evidence groups per axis, 20 points each; reproducible checks only. Required average >=80, every axis >=76, and no scope leak, false achievement, data loss, or inaccessible primary flow. Record limits honestly; do not give points for planned tests.

## Finish

Run independent contract/security and UX/measurement reviews, repair findings, optimize measured bottlenecks, write rollout/configuration and evidence report. Add a separate creative UI/UX development plan with optional ideas beyond current DESIGN.md. Do not treat local completion as production migration or deployment.
