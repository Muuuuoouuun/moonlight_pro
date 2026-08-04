<!-- /autoplan restore point: /Users/bigmac_moon/.gstack/projects/Muuuuoouuun-moonlight_pro/codex-moonlight-p0-hardening-autoplan-restore-20260502-133848.md -->
# Moonlight Command Loop: 2026-05 Strategy Review Archive

Status: HISTORICAL STRATEGY REFERENCE — superseded by `docs/README.md` and the 2026-07-13 Personal Operator OS design
Updated: 2026-05-02
Original branch: `codex/moonlight-p0-hardening`

> 이 문서는 2026-05 `/autoplan` 검토와 결정 배경을 보존한다. 현재 제품 사실, 구현 단계, 테스트 상태를 판단할 때는 `docs/README.md`, `docs/operator-workflow-profile.md`, `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`, `docs/master-roadmap.md`를 우선한다.

## 1. Product Thesis

Moonlight is not a dashboard for three fixed projects.

Moonlight is a private founder command system that turns every project, business, relationship, content idea, external event, and loose piece of information into one of three things:

1. a clear next action,
2. a logged decision,
3. or a visible failure that can be repaired.

The daily promise is simple:

> Open Moonlight first. See what matters, what changed, what is blocked, and what to do next.

Everything else, Hub UI, Engine routes, Supabase tables, AI briefs, Telegram, email, n8n, GitHub, Notion, calendar, exists to make that loop true.

## 2. Corrected Scope

Moonlight is not limited to `classinkr-web`, `sales_branding_dash`, and `ai-command-pot`. Those are seed lanes, not the product boundary.

The system must accept any future project or business as a first-class operating lane:

- product builds,
- client work,
- content brands,
- revenue pipelines,
- research notes,
- personal operating routines,
- automations,
- external collaborators,
- decision logs.

The source of truth is not "which old project does this belong to?" It is "what should the operator do with this signal?"

## 3. Active Layers

### Hub, Private Command Surface

`apps/hub` is the operator-facing surface. It reads the ledger, shows priority, and turns state into decisions. It should not own provider execution details.

Primary jobs:

- show today's highest-signal work,
- surface blocked revenue/content/work loops,
- capture manual updates and decisions,
- expose safe action buttons,
- show whether a flow is live, preview, degraded, or failed.

### Engine, Intake And Execution

`apps/engine` owns public and server-to-server execution:

- webhook intake,
- Telegram commands,
- email send routes,
- AI brief generation,
- provider sync,
- validation and normalization,
- ledger writes,
- execution records.

Public POST routes must be protected by `COM_MOON_SHARED_WEBHOOK_SECRET`, provider-native secrets, or explicit local-only open mode.

### Supabase Ledger

Supabase is the operational memory:

- `projects`, `tasks`, `project_updates`,
- `content_items`, `content_variants`, `content_assets`, `publish_logs`,
- `automation_runs`, `webhook_events`, `error_logs`,
- `integration_connections`, `field_mappings`, `sync_runs`,
- `decisions`, `notes`, `routine_checks`.

Supabase 없는 환경은 `preview` 또는 empty state로 드러낸다. Live 데이터와 mock 데이터는 섞지 않는다.

### Shared Domain

`packages/*` holds reusable logic. Domain work such as card news generation belongs here, not duplicated inside Engine or Hub pages.

### External Surfaces

Telegram, GitHub, Notion, Google Calendar, Gmail, Resend, n8n, Slack, OpenClaw, and future providers are signal or execution channels. They are not the product center.

### Public Proof Engine, Later

The former public web surface is not active in this workspace. Public output may return later as a proof/export layer generated from real private ledger data: case studies, content artifacts, campaign proof, changelogs. It should not become a parallel app until the private command loop has gravity.

## 4. Core Operating Loop

```text
External signal / manual capture / AI brief / content idea
        |
        v
Engine validates, normalizes, deduplicates, and writes ledger records
        |
        v
Supabase ledger stores state, history, failures, and correlation ids
        |
        v
Hub ranks what matters and shows next actions
        |
        v
Operator approves, edits, retries, sends, or defers
        |
        v
Engine executes provider action or records the human decision
        |
        v
Result, failure, and learning return to the ledger
```

The product is only working when this loop changes daily behavior.

## 5. Work Domains

### Revenue Protection

Goal: no important lead, client, payment, proposal, renewal, or follow-up dies in memory.

Signals:

- Gmail and Resend activity,
- CRM-like leads/deals/accounts,
- calendar meetings,
- manual notes,
- external forms,
- future payment/provider events.

Hub output:

- who needs a reply,
- what changed,
- next follow-up,
- owner,
- deadline,
- risk.

### Content Output

Goal: one source idea becomes channel-ready variants with export/handoff history.

Supported lanes:

- newsletter,
- blog or insight,
- card news,
- X thread,
- reels script,
- future public proof asset.

Hub owns preparation, variant editing, preview, save state, and handoff status. Engine/provider layers own sending, exporting, uploading, and result logging.

### Work And Project Execution

Goal: every active project has status, blocker, latest change, and next action.

Project categories are open-ended. The system must not hardcode old project names as product structure.

### Knowledge And Decision Memory

Goal: decisions survive beyond the day they were made.

Moonlight should capture:

- context,
- options considered,
- decision,
- rationale,
- next review point,
- linked project/content/revenue object.

### Automation Reliability

Goal: failures are visible and repairable.

The old "self-patching" premise is retired. Moonlight does not automatically patch production code. The correct loop is:

```text
Failure -> grouped cause -> owner -> retry or repair proposal -> human approval -> logged result
```

AI may summarize, cluster, and propose fixes. Code changes stay human-approved until there is a mature trust boundary, tests, rollout gates, and rollback path.

## 6. Current P0 Priorities

1. **Today-first decision stack**: Hub home answers "what matters now?" in under 5 seconds.
2. **Engine intake hardening**: every public write route has auth, deduplication, honest partial/failed responses, and ledger correlation.
3. **Content action loop**: ideas become variants, variants become handoff/export records, failed handoffs become retry candidates.
4. **Revenue next-action loop**: leads/accounts/deals show owner, deadline, risk, and next touch.
5. **Failure visibility and guided repair**: failed runs are grouped, explained, assigned, and recoverable.
6. **Integration readiness**: GitHub, Telegram, Google Calendar, Gmail/Resend, Notion, OpenClaw, and n8n are treated as typed channels into the same ledger loop.
7. **Behavioral contracts**: the strategy is not real until tests cover auth denial, duplicate events, partial persistence, degraded live reads, autosave recovery, and AI/provider failure paths.

## 7. Premises To Validate

| Premise | Validation Check | Pass Condition |
| --- | --- | --- |
| Hub becomes first-open tool | Daily use | Opened 5 days/week before checking scattered sources |
| Signals can become actions | Data quality | 90% of active records have `next_action` or explicit "waiting" reason |
| Supabase ledger is useful memory | Reconstruction | A project incident can be reconstructed from ledger records alone |
| Content OS creates output | Throughput | 1 source idea becomes 3+ channel variants with saved handoff state |
| Revenue loop protects follow-up | Latency | Qualified lead follow-up action appears within 24h |
| Failure loop builds trust | Recovery | Failed automation has owner, status, and retry/repair action within 24h |
| AI briefs are trusted | Human action | At least one AI recommendation per week becomes an accepted task or decision |

If these fail, the product needs fewer surfaces and tighter loops, not more tabs.

## 8. Success Gates

### Gate 1: Daily Control

- Today, Alerts, Approvals, Cross-lane Feed, Next 3 Actions are live.
- Preview/live states are honest.
- User can create or update a project/content/revenue action without leaving Hub.

### Gate 2: Closed Execution

- Engine writes idempotent intake records.
- Provider sends or handoffs create `sync_runs`, `automation_runs`, `publish_logs`, or `webhook_events`.
- Hub shows partial/failure states, not fake success.

### Gate 3: Operator Trust

- Failed runs are grouped by cause.
- Retry candidate and human handoff lanes exist.
- AI proposals are logged as proposals, not silent code changes.

### Gate 4: Public Proof

- Public output is generated from proven private activity.
- No new public app surface until private command loop is sticky.

## 9. Architecture Boundaries

```text
                    +------------------------------+
                    |        External Signals       |
                    | GitHub, Telegram, Calendar,   |
                    | Gmail, Resend, Notion, n8n,   |
                    | OpenClaw, manual capture      |
                    +---------------+--------------+
                                    |
                                    v
                    +------------------------------+
                    | apps/engine                  |
                    | auth, validate, normalize,   |
                    | dedupe, execute, log         |
                    +---------------+--------------+
                                    |
                                    v
                    +------------------------------+
                    | Supabase Ledger              |
                    | state, history, failures,    |
                    | correlation, decisions       |
                    +---------------+--------------+
                                    |
                                    v
                    +------------------------------+
                    | apps/hub                     |
                    | read, rank, decide, approve, |
                    | dispatch intent              |
                    +---------------+--------------+
                                    |
                                    v
                    +------------------------------+
                    | Engine / Provider Action      |
                    | send, retry, sync, handoff    |
                    +------------------------------+
```

Hard rules:

- Hub read APIs use `apps/hub/app/api/hub/` and `apps/hub/lib/repositories/`.
- Engine write/intake APIs live under `apps/engine/app/api/`.
- Hub-to-Engine calls send `COM_MOON_SHARED_WEBHOOK_SECRET`.
- Hub must not smuggle provider secrets or provider execution logic into UI pages.
- Engine must not own UI.
- Same-origin checks are not authorization. Hub write routes need a real operator/session boundary or server write secret before production.
- `COM_MOON_ALLOW_OPEN_WEBHOOKS=true` is local-only. Production must refuse open webhook mode.

## 10. Ranking, State, And Failure Contracts

The "Today-first" stack needs a contract before it becomes UI.

### 10.1 Attention Read Model

Moonlight should introduce an `attention_items` or `today_actions` read model/repository contract before adding more dashboard panels.

Minimum fields:

| Field | Purpose |
| --- | --- |
| `workspace_id` | tenant/workspace scope |
| `source_type` | project, task, content, revenue, automation, decision, note |
| `entity_id` | linked source record |
| `priority_score` | sortable urgency score |
| `reason` | why this is surfaced |
| `next_action` | what the operator should do |
| `owner_id` | who owns the action |
| `due_at` | time pressure |
| `status` | open, waiting, approved, done, failed |
| `correlation_id` | trace to Engine/provider/log records |

Hub reads this contract. Engine and domain writers feed it. UI pages should not independently invent "what matters" rankings.

### 10.2 Response Taxonomy

Routes must use these meanings consistently:

| Status | Meaning |
| --- | --- |
| `preview` | Persistence/execution intentionally unavailable because config/workspace/provider is missing or local preview mode is active. |
| `saved` / `accepted` / `sent` | Intended durable/live action succeeded. |
| `partial` | At least one durable write succeeded and at least one intended durable write failed. |
| `failed` | Intended durable/live action failed. |
| `duplicate` | Idempotent duplicate detected and no duplicate side effect was performed. |
| `degraded` | Live configuration exists, but reads or provider checks failed. |

Responses should include `durableRecordIds`, `failedWrites`, `retryable`, and `correlationId` when relevant.

### 10.3 AI Boundary

AI output is a proposal, not source-of-truth fact.

AI routes must:

- redact secrets and obvious PII before provider calls,
- cap context size,
- mark generated ledger records as `proposal`,
- reject empty output,
- store model, provider status, and input digest,
- never directly trigger provider sends or code changes without human approval.

### 10.4 Repair Data Model

The repair loop should get its own model instead of overloading logs.

Candidate table: `repair_items` or `incident_groups`

Minimum fields:

- `workspace_id`,
- `group_key`,
- `severity`,
- `status`,
- `owner_id`,
- `retry_action`,
- `approval_status`,
- `linked_run_ids`,
- `linked_event_ids`,
- `last_seen_at`,
- `resolved_at`.

This is what makes "failure -> repair" operational instead of vibes in a trench coat.

### 10.5 Content Variant Source Of Truth

Code and schema must agree on content variant types before Content Studio can be trusted live.

Current planning target:

- `newsletter`,
- `blog_insight`,
- `card_news`,
- `x_thread`,
- `reels_script`.

The Supabase schema, migrations, repository constants, and contract checks should use one shared source of truth or migration-backed assertion.

## 11. Design Direction

The old classinkr green premise is retired.

Active design system:

- Moonlight Pro / Moonstone Command Deck,
- dark-native Hub,
- moonstone accent `#5274a8` / tokenized OKLCH stack,
- cool silver precision,
- no warm gold, green, purple, or generic SaaS gradient identity.

See `DESIGN.md` for source-of-truth tokens and rules.

## 12. Competitive Positioning

Do not compete as a generic "AI operations OS." Airtable Omni already builds AI apps with data, interfaces, automations, and enterprise controls. Notion AI already searches across workspace and connected apps, writes reports, and works inside a broad productivity suite. n8n already owns flexible workflow automation, AI workflow builder, MCP access, and human approval tools.

Moonlight's wedge is narrower and more personal:

> Korean-first, founder-first private command loop for revenue protection, content output, decision memory, and operational repair.

That is defensible because it is opinionated around one operator's actual daily behavior, not a blank generic builder.

References checked during `/autoplan` landscape review:

- Airtable Omni: https://www.airtable.com/platform/app-building
- Notion AI / Enterprise Search: https://www.notion.com/product/ai and https://www.notion.com/product/enterprise-search
- n8n AI workflows and human approval: https://n8n.io/ai/ and https://docs.n8n.io/advanced-ai/human-in-the-loop-tools/

## 13. NOT In Scope Right Now

| Item | Rationale |
| --- | --- |
| Rebuilding a public marketing app | Private command gravity is not proven yet. Public proof can be generated later from real ledger activity. |
| Fully autonomous code patching | Too much trust and deployment risk. Keep guided repair human-approved. |
| Integrating every provider at once | The loop needs correctness before breadth. Start with the channels that create daily actions. |
| Treating old project names as navigation architecture | Future lanes must be data-driven and open-ended. |
| Generic AI app builder positioning | Airtable, Notion, and n8n are stronger there. Moonlight wins by being narrow and lived-in. |

## 14. What Already Exists

| Sub-problem | Existing code / doc | Reuse decision |
| --- | --- | --- |
| Supabase-first active direction | `README.md`, `CLAUDE.md`, `AGENTS.md` | Reuse as the active architecture boundary. |
| Hub content ledger | `apps/hub/lib/repositories/content-ledger.js`, `apps/hub/app/api/hub/content/route.js` | Reuse for Content OS action loop. |
| Engine project intake | `apps/engine/lib/project-webhook.ts`, `/api/webhook/project/**` | Reuse and harden. |
| Shared webhook auth | `apps/engine/lib/shared-webhook.ts` | Reuse for Hub-to-Engine and provider aliases. |
| Telegram command loop | `apps/engine/lib/run.ts`, `/api/webhook/telegram` | Reuse as mobile command entry. |
| Hub write guard | `apps/hub/lib/hub-write-guard.js` | Reuse for same-origin/server writes. |
| Integration inventory | `docs/integration-inventory.md` | Reuse as channel backlog, but reinterpret channels as action-loop inputs. |
| Design system | `DESIGN.md`, `apps/hub/components/hub/hub-tokens.css` | Reuse. Master plan must not contradict it. |
| Contract checks | `scripts/check-contracts.mjs`, `.github/workflows/ci.yml` | Extend as architecture hardening grows. |

## 15. Dream State Delta

```text
CURRENT
  Good Hub/Engine/Supabase foundation.
  Many surfaces and integrations emerging.
  Master docs still carry old three-project/public/self-patch premises.

THIS PLAN
  Reframes Moonlight around universal signals -> actions.
  Retires stale premises.
  Prioritizes daily control, execution honesty, and guided repair.

12-MONTH IDEAL
  Moonlight is the first-open founder command loop.
  Every project/business/info stream has next action, decision memory, and failure state.
  Public proof is generated from real private execution.
  AI proposes, operator approves, Engine executes, ledger remembers.
```

## 16. Implementation Alternatives Considered

| Approach | Summary | Effort | Risk | Pros | Cons | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| A. Minimal doc cleanup | Only replace old three-project/public/green/self-patch language. | S | Low | Fast, low churn. | Does not change operating priority. | Rejected. Too shallow. |
| B. Action-loop reframe | Make universal action conversion the master premise, then align roadmap/directive docs. | M | Low | Fixes strategy, architecture, and immediate prioritization. | Requires follow-up implementation. | Accepted. |
| C. Full product rewrite | Redesign every doc and app lane around the new thesis now. | XL | High | Maximum consistency. | Too much blast radius for this turn. | Deferred. |

Recommendation: Approach B. It boils the lake inside the active planning blast radius without turning this into a multi-week rewrite.

## 17. Temporal Interrogation

| Horizon | What must be decided now |
| --- | --- |
| Hour 1 foundations | Master premise, active layers, no public app, no autonomous patching, open-ended project model. |
| Hour 2-3 core logic | Which records produce actions: project updates, content variants, revenue events, failed runs, decisions. |
| Hour 4-5 integration | Every provider needs auth, dedupe, correlation id, honest status, and visible Hub state. |
| Hour 6+ polish/tests | Test coverage must prove preview/live separation, failure states, dedupe, and action visibility. |

Human-team hours above compress to roughly 30-60 minutes with CC + gstack, but the decisions are the same.

## 18. GSTACK AUTOPLAN REVIEW REPORT

### Phase 1: CEO Review

Mode: SELECTIVE EXPANSION
Premise gate: passed by user on 2026-05-02
Outside voices: `subagent-only`; Codex external outside voice was blocked because sending private repo content to an external Codex backend was rejected by safety review.

#### 0A. Premise Challenge

| Premise | Verdict | Fix |
| --- | --- | --- |
| Moonlight exists to integrate three projects | Wrong. It is too narrow and implementation-led. | Reframe as all signals across all work/business/info streams becoming actions. |
| Hub/Engine/Supabase architecture is the strategy | Incomplete. It is infrastructure. | Tie architecture to daily operator behavior and measurable loops. |
| Public landing is an active layer | Stale. Active workspace detached public web. | Public returns later only as proof/export from ledger. |
| Self-improving loop means code patch automation | Dangerous as stated. | Replace with failure visibility and guided repair. |
| Classinkr green is the design anchor | Stale. DESIGN.md says Moonlight Pro moonstone. | Retire green premise. |

#### 0B. Existing Code Leverage

See "What Already Exists" above. The current code already supports the new framing better than the old plan did: Engine validates and writes ledger records, Hub reads repositories, Content has autosave/variants, and integration docs already treat external systems as channels.

#### 0C. Dream State Mapping

See "Dream State Delta" above.

#### 0C-bis. Alternatives

See "Implementation Alternatives Considered" above.

#### 0D. Scope Decisions

Accepted:

- Rewrite master thesis around universal action conversion.
- Retire old public/green/self-patch premises in active master docs.
- Keep public proof engine deferred.
- Keep autonomous code patching out of scope.

Deferred:

- Full historical-doc cleanup.
- Full UI implementation of Today-first stack.
- Provider-by-provider integration buildout.

#### 0E. Temporal Interrogation

See "Temporal Interrogation" above.

#### 0F. Mode Selection

SELECTIVE EXPANSION. The repo already has a large P0 hardening branch, so the right move is not more speculative scope. The right move is to align the product premise with what the code is already becoming, then cherry-pick only near-blast-radius improvements.

#### CEO Dual Voices, Consensus Table

```text
CEO DUAL VOICES - CONSENSUS TABLE
===============================================================
Dimension                            Claude  Codex  Consensus
------------------------------------ ------- ------ ----------------
1. Premises valid?                   No      N/A    FLAGGED
2. Right problem to solve?           No      N/A    FLAGGED
3. Scope calibration correct?        Partial N/A    FLAGGED
4. Alternatives explored?            No      N/A    FLAGGED
5. Competitive risks covered?        No      N/A    FLAGGED
6. 6-month trajectory sound?         No      N/A    FLAGGED
===============================================================
Missing voice = N/A. Single critical finding from subagent is flagged.
```

Key subagent finding: the old plan solves "integration" instead of "leverage." The accepted fix is the founder command loop reframe.

#### CEO Sections 1-10

1. Architecture: boundary is good, but plan now states why it exists: action conversion, not architecture admiration.
2. Error & Rescue: failure visibility remains a P0. Silent partials are not acceptable.
3. Security: Engine public writes must stay secret-protected; local open mode must remain explicit.
4. Data Flow: new core flow is signal -> normalized record -> action -> result.
5. Code Quality: avoid hardcoded old project names as architecture.
6. Tests: current repo has contract checks but no full test framework; test plan artifact required.
7. Performance: biggest risk is over-fetching dashboards before daily action ranking is clear.
8. Observability: every action loop needs correlation id, status, owner, and failure reason.
9. Deployment: public proof and autonomous patching are deferred to avoid rollout risk.
10. Long-Term: reversibility 4/5 after this rewrite. The plan narrows strategy while keeping data model open.
11. Design: skipped as a full Phase 2 because the original plan did not define a specific new UI surface. Design premise itself was corrected.

### Phase 2: Design Review

Skipped. UI scope detector found no specific new screen/component/form/modal/layout implementation in the original plan file. Design system contradiction was still fixed because it was a strategic premise bug.

### Phase 3: Engineering Review

#### Scope Challenge

The plan now matches the active repo better:

- `README.md` already says public web is detached.
- `apps/engine/lib/shared-webhook.ts` already protects shared webhook routes.
- `apps/engine/lib/project-webhook.ts` already handles dedupe and partial persistence status.
- `apps/hub/lib/repositories/content-ledger.js` already models content items, variants, publish logs, and attention.
- `apps/hub/components/hub/pages/content.jsx` already has IndexedDB local mirror and Supabase autosave behavior.

Main engineering gap: there is no general automated test framework yet. Contract checks exist, but they do not cover branch behavior, route failure modes, UI flows, or provider failure paths.

#### Architecture Diagram

```text
Hub UI
  | reads
  v
Hub API / repositories
  | reads ledger, dispatches intent with shared secret
  v
Engine API
  | validates auth, parses payload, normalizes, dedupes
  v
Supabase REST ledger
  | returns state / partial / failure
  v
Hub status, attention, next-action surfaces
```

#### Eng Dual Voices, Consensus Table

Codex external voice remained unavailable for the same private-data safety reason noted in Phase 1. Claude subagent returned 10 engineering findings and the plan has been updated to reflect the P1/P2 hardening items.

```text
ENG DUAL VOICES - CONSENSUS TABLE
===============================================================
Dimension                            Claude  Codex  Consensus
------------------------------------ ------- ------ ----------------
1. Architecture sound?               Partial N/A    FLAGGED
2. Test coverage sufficient?         No      N/A    FLAGGED
3. Performance risks addressed?      Partial N/A    FLAGGED
4. Security threats covered?         Partial N/A    FLAGGED
5. Error paths handled?              Partial N/A    FLAGGED
6. Deployment risk manageable?       Partial N/A    FLAGGED
===============================================================
Missing voice = N/A. Single P1 finding from subagent is flagged.
```

Eng subagent findings folded into the plan:

| Finding | Severity | Plan response |
| --- | --- | --- |
| Today-first ranking lacks a read model | P1 | Added `attention_items` / `today_actions` contract. |
| Partial failure semantics too soft | P1 | Added response taxonomy and payload requirements. |
| Hub same-origin write guard is not auth | P1 | Added production auth boundary hard rule. |
| Open webhook mode not constrained to local | P1 | Added production refusal rule. |
| No behavioral test runner | P1 | Test plan artifact and TODO now require behavioral tests. |
| Dedup has nil-key gaps | P2 | Added idempotency key requirement to TODOs. |
| Supabase read failures erase observability | P2 | Added degraded/live read semantics. |
| Repair loop lacks data model | P2 | Added `repair_items` / `incident_groups` model target. |
| AI brief lacks boundary policy | P2 | Added AI boundary section. |
| Content variant code/schema mismatch | P2 | Added content variant source-of-truth requirement. |

#### Error & Rescue Registry

| Codepath | What can go wrong | Current behavior | Required plan |
| --- | --- | --- | --- |
| `fetchSupabaseRows` | missing config, non-OK, network error | returns `null` | Hub must show preview/degraded, not mix live/mock. |
| `insertSupabaseRecord` | duplicate, 4xx, 5xx, network error | classified as reason string | Add retry for transient 5xx/network where safe. |
| `handleProjectWebhook` | duplicate event | returns `duplicate` | Keep. |
| `handleProjectWebhook` | partial ledger write | returns `partial` | Hub must render partial distinctly. |
| `runTelegramUpdate` | duplicate update | ignored | Keep. |
| `runTelegramUpdate` | command failure | logs and persists failed run | Add tests for failure persistence. |
| `generateGeminiText` | empty/malformed provider output | can return ok with empty text | Add explicit empty-output failure classification. |
| `sendEmail` | provider not configured | returns preview | Keep, but expose in Hub as preview not sent. |

#### Failure Modes Registry

| Codepath | Failure mode | Rescued? | Test? | User sees? | Logged? |
| --- | --- | --- | --- | --- | --- |
| Project webhook | duplicate provider event | Y | Contract only | duplicate response | Y |
| Project webhook | Supabase partial write | Y | Contract only | partial response | Y |
| Telegram webhook | bad secret | Y | Contract only | 401 | Y |
| Telegram command | cardnews Supabase write fails | Partial | No | response includes persistence | Y |
| Content autosave | Supabase unavailable | Y | No | preview/error/local mirror | Partial |
| Email send | provider missing | Y | No | preview | Y |
| AI brief | provider empty output | N | No | generated with empty text risk | Partial |

Critical gap: tests are not yet deep enough for 2am confidence.

#### Test Coverage Diagram

```text
CODE PATH COVERAGE
==================
[+] apps/engine/lib/project-webhook.ts
    ├── [GAP] accepted write path
    ├── [GAP] duplicate provider_event_id path
    ├── [GAP] partial persistence path
    └── [GAP] missing workspace path

[+] apps/engine/lib/run.ts
    ├── [GAP] Telegram duplicate reservation
    ├── [GAP] /cardnews content_items + content_variants persistence
    ├── [GAP] unsupported command ignored path
    └── [GAP] command error -> failed automation_runs

[+] apps/hub/app/api/hub/content/route.js
    ├── [GAP] POST preview when workspace missing
    ├── [GAP] POST saved when both records persist
    ├── [GAP] PATCH missing ids -> 400
    └── [GAP] PATCH partial persistence -> preview

USER FLOW COVERAGE
==================
[+] Content Studio autosave
    ├── [GAP] cloud save succeeds
    ├── [GAP] cloud fails but IndexedDB mirror succeeds
    ├── [GAP] restore local draft
    └── [GAP] load existing item via query param

[+] Project webhook smoke test
    ├── [GAP] Hub sends shared secret to Engine
    ├── [GAP] Engine returns partial distinctly
    └── [GAP] Hub shows success/error without pretending persisted live data

No test framework detected. Contract checks exist but are not enough for behavioral coverage.

Test plan artifact:

`/Users/bigmac_moon/.gstack/projects/Muuuuoouuun-moonlight_pro/bigmac_moon-codex-moonlight-p0-hardening-eng-review-test-plan-20260502-135104.md`
```

#### Performance

Current risk is not raw scale yet. It is dashboard over-fetch and repeated client fetches once Today-first aggregation grows. Keep the P0 implementation capped:

- fetch only top actions,
- paginate event logs,
- avoid loading all variants/assets for the first screen,
- add indexes for any new status/date/workspace filters.

#### Parallelization Strategy

```text
Lane A: Docs + strategy alignment
Lane B: Engine tests and failure classifications
Lane C: Hub Today/action UI planning

Launch A immediately. B and C can run in parallel after the plan is approved. Merge B before shipping provider-heavy changes.
```

### Cross-Phase Themes

Theme: action gravity. CEO and Eng both point to the same risk: Moonlight can become a polished dashboard unless every record produces a next action or clear waiting state.

Theme: trust boundary. CEO flagged autonomous patching as dangerous theatre. Eng found the same issue in test and failure coverage: guided repair needs logs, owner, tests, and approval before automation.

Theme: stale docs. Strategy, roadmap, and directive docs must stop contradicting README/DESIGN/code reality.

## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
| --- | --- | --- | --- | --- | --- |
| 1 | CEO | Reframe Moonlight as universal signals-to-actions command loop | P1 completeness | User confirmed the product covers all projects, businesses, and information streams. | Three-project integration frame |
| 2 | CEO | Retire public landing as active layer | P3 pragmatic | Public web is detached from active workspace and would distract from private loop proof. | Rebuild public app now |
| 3 | CEO | Replace self-patching with guided repair | P5 explicit over clever | Automatic code patching lacks trust boundary, tests, rollout, and rollback. | Autonomous patching premise |
| 4 | CEO | Retire classinkr green design premise | P4 DRY | DESIGN.md already defines Moonlight Pro moonstone tokens. | Maintaining conflicting design direction |
| 5 | CEO | Choose Approach B, action-loop reframe | P2 boil lake | Fixes active docs and strategy without boiling the whole historical-doc ocean. | Minimal cleanup, full product rewrite |
| 6 | Eng | Treat missing behavioral tests as critical planning gap | P1 completeness | Contract checks do not cover route branches, UI flows, or provider failures. | Ship with contract checks only |
| 7 | Eng | Defer public proof engine to TODO | P3 pragmatic | Valuable later, but blocked on private loop gravity. | Build public proof now |
| 8 | Eng | Keep provider expansion as staged channel backlog | P5 explicit over clever | Each channel must prove auth, dedupe, status, and action value. | Integrate all providers at once |
| 9 | Eng | Require Today-first read model before adding dashboard panels | P5 explicit over clever | Ranking must be a contract, not duplicated page logic. | Let each page invent priority |
| 10 | Eng | Define route response taxonomy | P1 completeness | `preview`, `partial`, `failed`, and `degraded` must mean different things. | Treat failed live writes as preview |
| 11 | Eng | Treat Hub same-origin write checks as insufficient for production auth | P3 pragmatic | Same-origin is a CSRF signal, not operator authorization. | Rely on origin/referer only |
| 12 | Eng | Require production guard for open webhook mode | P1 completeness | Local smoke-test mode cannot be possible in production by env accident. | `COM_MOON_ALLOW_OPEN_WEBHOOKS` alone |
| 13 | Eng | Add AI prompt/data boundary to plan | P5 explicit over clever | AI briefs send ledger context to a provider and must be proposal-only. | Treat AI brief as ordinary trusted text |
| 14 | Eng | Make content variant types schema-backed | P4 DRY | Code accepts variants that base schema may reject. One source of truth needed. | Divergent constants and constraints |

## Completion Summary

```text
+====================================================================+
|            AUTOPLAN REVIEW - COMPLETION SUMMARY                    |
+====================================================================+
| Mode selected        | SELECTIVE EXPANSION                         |
| System Audit         | Active repo already Hub/Engine/Supabase      |
| Step 0               | Reframed around universal action loop        |
| CEO Voice            | Subagent-only, 10 strategic findings         |
| Codex Voice          | Blocked by private-data safety review        |
| Design Review        | Skipped, no specific UI scope in plan file   |
| Eng Scope            | Code supports new frame, tests are gap       |
| Architecture         | Boundary diagram written                     |
| Errors               | 8 failure paths mapped                       |
| Tests                | Coverage diagram written, framework missing  |
| Performance          | Over-fetch risk noted for Today stack        |
| NOT in scope         | written                                      |
| What already exists  | written                                      |
| Dream state delta    | written                                      |
| TODOs                | written to TODOS.md                          |
| Test plan            | written to gstack project artifact           |
| Lake Score           | 8/8 recommendations chose complete option    |
+====================================================================+
```
