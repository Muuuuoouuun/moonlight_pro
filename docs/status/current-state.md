# Moonlight Current State

> Status: ACTIVE IMPLEMENTATION SNAPSHOT
> Updated: 2026-07-13
> Product truth and document precedence: [`../README.md`](../README.md)

## Current phase

Phase 0 is shipped. Phase 1A Durable Task Loop is implemented and has passed the code suite, production build, and targeted QA against a local production build. It is not yet declared live because this worktree has no configured Hub/Engine/Supabase environment for applying the migration and running atomic persistence smoke tests.

## Implemented in Phase 1A

- Signed single-operator Hub write session with production same-origin writes still denied until unlocked.
- Hub Task BFF and Quick Capture forwarding into guarded Engine commands with server-owned workspace context.
- Atomic SQL contracts for Task create/update/capture, mutation receipts, idempotency, optimistic concurrency, and canonical response rows.
- Quick Capture destinations for `task` and `inbox`, preserving the existing Inbox classifier and raw input.
- Canonical open-Task reads with workspace timezone, guarded pagination, honest `live|empty|preview|error` states, and no fabricated Task rows.
- Daily Brief Task lanes: `missed`, `today`, `waiting`, and `inbox`, plus server-confirmed completion and canonical refetch.
- Projects Task creation, completion, and EditDrawer updates while Project creation/deletion remains read-only.
- Exact-snapshot unlock retry, stale-input dismissal, conflict row recovery, project-detachment preservation, and recomputed presentation fields.
- Desktop and 390×844 local production-build browser coverage for preview, live rows, loading/empty/error states, mobile editor, delayed retry-busy state, completion unlock, conflict, failed canonical refresh, keyboard navigation, and light/dark theme behavior.

## Verification state

- Root Node suite: 174/174 passing.
- Contract and Inbox checks: passing.
- Typecheck and monorepo production build: passing.
- Lint command: exit 0, but Turbo reports that no package lint tasks are configured; this is not counted as lint coverage.
- Targeted browser QA: 21 final-run screenshots and all asserted scenarios passing. The expanded run and independent review found and closed responsive navigation focus/semantics/target-size gaps, transient descendant theme contrast loss, and post-capture focus loss. One unrelated Low finding remains (`/favicon.ico` 404). See [`phase1a-browser-qa.md`](phase1a-browser-qa.md).
- `check:connections`: expected failure in this checkout because Hub/Engine Supabase URLs and Hub/Engine app URLs are unset.
- `check:connections` is a partial diagnostic, not proof that all runtime secrets, migration credentials, or owner-membership prerequisites are activation-ready.
- Live DB migration and atomic smoke: not run; environment-gated activation work remains.

## Activation gate

Before calling Phase 1A live:

1. Configure the complete activation contract:
   - Hub runtime: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COM_MOON_DEFAULT_WORKSPACE_ID`, `COM_MOON_ENGINE_URL`, `COM_MOON_HUB_URL` or `NEXT_PUBLIC_APP_URL`, `COM_MOON_SHARED_WEBHOOK_SECRET`, and `COM_MOON_HUB_WRITE_SECRET`.
   - Engine runtime: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COM_MOON_DEFAULT_WORKSPACE_ID` or `DEFAULT_WORKSPACE_ID`, and the same `COM_MOON_SHARED_WEBHOOK_SECRET`.
   - Migration access: `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`, or a Supabase URL from which the project ref can be derived.
   - Data prerequisite: the selected workspace has a non-null `owner_id` and an active `workspace_memberships` row for that owner.
2. Apply the exact migration with `npm run db:migrate -- 20260713_0015_durable_task_loop.sql`; the bare migration command defaults to older files.
3. Prove create→reload→complete→reload against live persistence.
4. Prove same-key duplicate, changed-payload conflict, stale `updated_at`, and transaction rollback cases.
5. Use the loop briefly and record any missed follow-up, confusing retry, or incorrect timezone behavior.

## Not implemented yet

- Phase 1B cross-lane Action Desk ranking, real Follow-up aggregation, and Google Calendar agenda.
- Phase 1C atomic contact outcome, Activity, current-task completion, and next-task/review flow.
- Verified owner mapping and automatic urgent KA/focus-customer recommendations.
- Durable Project creation/deletion, candidate generation, checklist progress, delay, and bottleneck scoring.
- ClassIn import/outbox/conflict bridge.
- Audio upload, transcription, AI meeting analysis, and retention/cost controls.
- Direct social publishing and detailed content-performance analysis.

## Operator decisions

The Q1–Q115 interview is already normalized in [`../operator-workflow-profile.md`](../operator-workflow-profile.md). Do not create a second answer summary. Q116 onward stays paused until the operator asks or Phase 1 usage produces questions that materially affect the next design.
