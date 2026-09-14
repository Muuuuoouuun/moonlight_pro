# Content Workflow Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded server tasks and independent reviews. Steps use checkbox syntax. The operator approved proceeding; continue implementation and verification without another planning gate.

**Goal:** Preserve source notes and a shared brief, edit Threads and existing formats, and generate/review/apply/restore AI changes and channel variants in Content Studio.

**Architecture:** Reuse content_items/content_variants and the Hub→Engine write boundary. Add transactional workflow mutations, immutable content revisions, and idempotent transform runs. A focused Studio component consumes the existing brand ledger plus an exact item detail endpoint. Keep journal ingestion and period retrospectives in their separately planned subsystem.

**Tech Stack:** Next.js 16, React 18, plain JavaScript/TypeScript, Supabase REST/PostgreSQL RPC, existing Gemini adapter, node:test, Playwright.

**Status (2026-09-12):** Studio 1차 구현과 독립 리뷰·로컬 검증을 마치고 기존 작업 폴더에 반영했다. 기능 브랜치를 보존하고 전용 worktree·검증 서버 정리를 마쳤다. 운영 DB 적용·배포·유료 Gemini 호출은 수행하지 않았다.

**후속 검증:** [운영 적용 준비 기록](2026-09-12-content-release.md)에서 기존 JSX 테스트 로딩 오류를 해결했다. 통합 테스트는 817개 통과·실패 0개·선택 실행 DB 테스트 3개 제외다. 운영 적용은 Supabase 관리 토큰과 Vercel 로그인 갱신을 기다린다.

## Scope and worktree

- Worktree: `/Users/bigmac_moon/dev/moonlight_pro-content-workflow`, branch `codex/content-workflow-20260912`, clean base `5c93122`.
- Preserve original workspace edits. Integrate only the diff created in this worktree; do not stage or commit existing user changes.
- Use the approved design sections 4–8 and 10–14 for this content-production slice. Section 4 journal ingestion and section 15 unresolved journal navigation remain separate.
- Run base `npm test` before implementation. Test data persistence with a disposable local PostgreSQL cluster; never point verification at the user's production database.

## Wire contracts

All Hub writes use the same-origin/write-secret guard and inject server workspaceId; all Engine writes validate the shared secret. Body limit 256KB in UTF-8 bytes. Reject unsupported actions and malformed IDs. Read failures are HTTP 200 with status:error.

### POST /api/hub/content/workflow → /api/content/workflow

```js
{
  action: 'save', requestId: 'uuid', contentId: null, variantId: null,
  expectedItemUpdatedAt: null, expectedVariantUpdatedAt: null,
  item: { title, sourceIdea, brandId, brief: {audience,purpose,message,angle,evidence,ending}, nextAction, blocker },
  variant: { title, body, variantType: 'x_thread', channel: 'threads' },
  checkpoint: true
}
```

Existing IDs require expected modification timestamps. Absent item fields remain unchanged; title must never become sourceIdea implicitly. The response uses raw DB row shapes:

```js
{ status:'saved', contentId, variantId, item, variant, revisionId }
```

Other actions:

```js
{ action:'create_variant', requestId, contentId, variantId, expectedItemUpdatedAt, expectedVariantUpdatedAt,
  variant:{title,body,variantType,channel} }
{ action:'apply_candidate', requestId, contentId, variantId, expectedItemUpdatedAt, expectedVariantUpdatedAt,
  runId, candidateId, mode:'replace' /* or new_variant */ }
{ action:'restore_revision', requestId, contentId, variantId, expectedItemUpdatedAt, expectedVariantUpdatedAt, revisionId }
```

Restore restores only the variant snapshot, not private source or shared brief. Create/apply/restore update receipts and version records atomically. Conflict preserves the caller's draft and includes a recoverable message. Repeating a successful request returns duplicate with the original response.

### GET /api/hub/content/workflow?item=<uuid>

```js
{status:'live', item: /*raw content_items row*/, variants:[], revisions:[]}
```

Filter every query by server workspace. Revisions contain snapshot, reason, and timestamp. Limit history and detect partial truncation. Missing item is an explicit not-found state, not an empty new editor.

### POST /api/hub/content/transform → /api/content/transform

```js
{requestId, contentId, variantId, expectedVariantUpdatedAt,
 operation:'polish' /*shorten|hooks|draft|repurpose*/,
 selection:{start,end}, tone:'brand', target:{variantType,channel}}
```

The server fetches saved item/variant/brand. Validate selection offsets against saved body in JS. Capture prefix and suffix strings so PostgreSQL never confuses UTF-16 offsets with Unicode character positions.

```js
source_snapshot: { contentId, variantId, itemUpdatedAt, variantUpdatedAt, body, prefix, suffix, selectionText, target, tone }
result: { candidates:[{id,title,body,variantType,channel,summary,missing:[]} ] }
```

`content_transform_runs`: id=requestId, workspace_id, content_id, variant_id, request_hash, operation, source_snapshot jsonb, result jsonb, status running|succeeded|failed|unknown, usage jsonb, model, error, created_at, updated_at. Unique workspace/id. Insert to claim before model call. Return saved candidates for a repeated hash; different input for same key conflicts. No automatic provider retry. If persistence fails, return generated candidates as unsaved and support retrying persistence without another generation.

A running claim older than two minutes becomes unknown when checked again; it never triggers another model call. A signed, scoped recovery token permits persistence-only recovery of generated output. Apply also checks the shared item's timestamp so a changed brief invalidates an older candidate.

Studio stores pending save/mutation receipts in IndexedDB before sending a request. A stable `?new=draft&draft=<uuid>` address and document-specific mirror preserve unsaved content and uncertain receipts across reloads. Retrying an uncertain operation reuses its original request ID; document epochs prevent late responses from changing a newly opened document.

No client-supplied body is trusted by apply_candidate: read run/result in the mutation RPC. For replace, assert saved source body/version match and set body=prefix+candidate.body+suffix. Repurpose creates a new variant. Revision and applied metadata must be saved in the same transaction.

Structured output bodies:

```js
// x_thread/blog_insight: plain text (blank lines separate thread blocks)
// card_news:
JSON.stringify({slides:[{id:'slide-1',title:'...',sub:'...'}]})
// reels_script:
JSON.stringify({scenes:[{id:'scene-1',visual:'...',spoken:'...',subtitle:'...',duration:10,notes:''}]})
```

## Task 1 — Baseline and durable workflow (server implementer)

Files: new `apps/engine/lib/content-workflow.ts`, `apps/engine/app/api/content/workflow/route.ts`, `apps/hub/app/api/hub/content/workflow/route.js`, `apps/hub/lib/repositories/content-workflow-ledger.js`, migration `supabase/migrations/20260912_0026_content_workflow.sql`; tests alongside services/routes. Update `content-ledger.js` projections to honor stored channel, sourceIdea, brief, nextAction and metadata.

- [x] Add failing behavioral tests: original source survives title save; explicit empty clears while absent preserves; stale expected version conflicts; foreign workspace/parent rejected; duplicate request doesn't create another variant; restore doesn't modify source; malformed action fails.
- [x] Add content_revisions, content_workflow_receipts, content_transform_runs with RLS and service-only access.
- [x] Implement `content_workflow_v1` with row locks, all-or-nothing save/variant/apply/restore, request hash receipts, source preservation and version snapshots. Restrict execute grants.
- [x] Implement scoped read endpoint and guarded Engine forwarder. Match exact wire shapes above.
- [x] Run targeted tests and local PostgreSQL integration scenarios. Return changed files and results for independent review; do not touch Studio or Gemini implementation.

## Task 2 — Studio data flow and editing (root)

Files: new `apps/hub/lib/content-workflow-client.js`, `apps/hub/lib/content-workflow-client.test.mjs`, `apps/hub/components/hub/pages/content-studio.jsx`, `apps/hub/components/hub/pages/content-studio.css`; update `content.jsx` to delegate its Studio export, preserve Queue/Campaigns and the shared ledger hook.

- [x] Write failing pure behavior tests for exact item/variant resolution, duplicate text selection, stale response checks, channel/format mapping, source and brief round-trip, local mirror key isolation, candidate replacement and export formatting.
- [x] Build source/brief collapsible panel and a primary editor with Threads, blog, card slides, Shorts scenes. All labels Korean, existing primitives and tokens.
- [x] Handle serialized autosave, stable requestId per retry payload, in-flight edits, honest preview/error/conflict, explicit browser restore and version navigation.
- [x] Add next action/blocker, exact variant deep link and variant selection. Preserve source on all edits.
- [x] Exercise manual save/reload/variant switching against the actual local server and fixture network boundary before AI.

## Task 3 — AI transform service (fresh bounded implementer)

Files: new `apps/engine/lib/content-transform.ts`, `apps/engine/app/api/content/transform/route.ts`, `apps/hub/app/api/hub/content/transform/route.js`, tests; reuse Gemini helper and Task 1 run table.

- [x] Write failing tests for saved-body selection, source ownership, unsupported operation, strict candidate shape, schema failure, one claim per request, duplicate success, timeout unknown, no implicit retry and save-only recovery.
- [x] Implement server context assembly from exact selected item, variant and brand rules. No unrelated workspace corpus; treat source instructions as data.
- [x] Generate polish/shorten/hooks/draft/repurpose candidates; hook count exactly 3, others 1. Validate formats and keep missing facts in a separate array.
- [x] Persist output and usage before claiming success. Return clear setup/read/provider/storage error states.
- [x] Run targeted tests, then independent specification and quality review.

## Task 4 — Candidate review and channel reuse (root)

- [x] Add generation actions with selection preview, named operation, comparison cards, apply/new-variant/discard and persistence-retry controls.
- [x] On apply, use runId/candidateId + latest expected timestamps. Never directly autosave unaccepted AI text.
- [x] Show revisions and durable restore; preserve source and sibling variants.
- [x] Add copy/export of the selected variant only; never include source notes or brief in export. Maintain published status of existing siblings.
- [x] Verify a source→Threads→AI edit→restore→card candidate chain in the browser, including a request while editing, a save failure and exact duplicate text selection. Verify Shorts scene schema and parsing helpers with automated tests.

## Task 5 — Verification, review, integration

- [x] Independent spec review and then code quality review; fix every material finding.
- [x] `npm test`, `npm run check:contracts`, `npm run typecheck`, `npm run build`.
- [x] Disposable PostgreSQL validates transactions, scoping, receipts, snapshots and concurrent claims with actual SQL.
- [x] Playwright: desktop 1440×1000 and mobile 390×844, meaningful page, no framework overlay or relevant console error, manual and AI candidate interactions. Browser plugin unavailable; use bundled Playwright without adding project dependencies.
- [x] Verify no pre-existing workspace changes are overwritten. Apply only the worktree feature diff, preserving user's Queue celebration patch. Update documentation status to actual delivered slice.
- [x] Report exact verification and any untested live provider/production migration state; remove the worktree only after integration and retain the feature branch.

## Verification record — 2026-09-12

- Baseline: `npm test` passed 700/700 tests before the feature changes.
- Final worktree suite: 761 tests, 758 passed, 0 failed, 3 opt-in PostgreSQL tests skipped in the default run. The same 3 PostgreSQL tests passed separately against a disposable local cluster.
- `npm run check:contracts`, `npm run typecheck`, and `npm run build` passed. Hub and Engine both built successfully. `git diff --check` passed.
- Local PostgreSQL used the repository's actual live-schema bootstrap, existing channel migration, and complete `20260912_0026_content_workflow.sql`. Tests executed atomic save/apply/restore, ownership, unchanged source and lifecycle states, duplicate receipts, simultaneous requests, and service-only grants. No production database was used.
- Playwright exercised the rendered Hub and Engine against that PostgreSQL database. The Gemini/network fixture returned deterministic candidates; this validates the app workflow, not live model quality. Browser checks covered source/brief round-trip, exact variant reload, card editing, accepted-result-only copy/export, selection of the second repeated phrase after an emoji, AI apply and revision restore, editing during generation, persistence-only recovery without a second model call, and repurposing into a separate variant.
- Recovery checks covered a committed creation whose response was lost, reload with the same draft address and request ID, an HTTP 200 read-error envelope with local recovery, the new-document hotkey lock, navigation before a mutation response, and resuming a pending variant creation without duplication.
- Desktop and fresh 390px mobile views were visually inspected. No relevant page errors or horizontal overflow were observed; mobile inputs met the 16px floor.
- Independent persistence specification review passed; transform re-review passed 29 targeted tests. Final Studio quality re-review passed all six corrected findings, 27 targeted tests, and two additional race probes.

## Local integration record

- Feature commit: `09feff5`; integration numbering correction: `aea8981`. Preserve branch `codex/content-workflow-20260912` as the feature history.
- Applied the reviewed feature diff to `/Users/bigmac_moon/dev/moonlight_pro` without staging or committing the user's unrelated changes. The concurrently integrated daily-review commit `0d34aa2` remains intact. Queue/Campaigns matched their prior contents exactly; other existing edited files and documentation sections were preserved.
- Renamed the content migration to `20260912_0026_content_workflow.sql` because the concurrent daily-review feature claimed `0025`. The SQL contents are unchanged from the migration tested locally.
- Integrated Hub build passed using a separate `.next.content-verify` directory. Contract checks and whitespace checks for the feature-owned diff passed.
- Integrated default test run: **812 tests; 808 passed, 1 failed, 3 skipped**. The sole failure is the pre-existing, unmodified `apps/hub/components/hub/celebration-fx.test.mjs`: Node cannot import `celebration-fx.jsx` (`ERR_UNKNOWN_FILE_EXTENSION`). That test is outside this feature branch. The worktree suite and separate PostgreSQL suite above passed; the combined workspace test suite is therefore not claimed to be fully green.
- The combined workspace also has a pre-existing trailing blank line warning in `apps/hub/lib/task-today.test.mjs`; this unrelated file was preserved.

## Release boundary

운영에서 새 저장·변형 API를 사용하려면 `supabase/migrations/20260912_0026_content_workflow.sql`을 먼저 적용한 뒤 Hub와 Engine을 배포해야 한다. 이 작업은 로컬 코드·스키마·흐름 검증까지다. 일지 신설, 여러 메모 묶기, 기간 회고, 자동 콘텐츠 크론 복구, 외부 채널 직접 발행은 이번 구현 범위에 포함하지 않는다.
