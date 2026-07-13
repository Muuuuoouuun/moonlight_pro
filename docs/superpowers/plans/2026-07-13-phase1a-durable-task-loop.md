# Moonlight Phase 1A Durable Task Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task.

**Goal:** 문득 적은 할 일을 실제 Task로 저장하고, Today와 Projects에서 같은 서버 행을 완료·수정한 뒤 새로고침해도 정확히 유지되는 개인 운영 루프를 완성한다.

**Architecture:** 브라우저는 HttpOnly 개인 세션으로 Hub BFF만 호출하고, Hub는 서버 환경의 기본 workspace와 shared secret으로 Engine에 전달한다. Engine은 입력을 검증한 뒤 service-role 전용 Postgres RPC를 호출하며, RPC가 idempotency receipt, workspace 경계, 낙관적 동시성, 상태 전이를 한 트랜잭션에서 보장한다. Hub read model은 실제 Task 행만 `missed/today/waiting/inbox`로 분류하며, UI는 성공 응답 또는 재조회 전에는 완료를 확정하지 않는다.

**Tech Stack:** Next.js App Router, React, TypeScript/JavaScript, Supabase Postgres/REST RPC, Node `node:test`, CSS tokens

---

## 고정 계약

- 브라우저 요청의 `workspaceId`, `ownerId`, `actorId`는 신뢰하지 않는다. Hub는 `COM_MOON_DEFAULT_WORKSPACE_ID`를 서버에서 주입하고, RPC는 workspace owner와 active membership을 검증한다.
- production 쓰기는 `COM_MOON_HUB_WRITE_SECRET` 원문 또는 유효한 `moonlight_operator_session` HttpOnly 쿠키만 허용한다. 쿠키 인증은 허용 Origin/Referer까지 일치해야 하며, same-origin만으로는 허용하지 않는다.
- Task/create/update와 Inbox capture마다 `Idempotency-Key`가 필요하다. workspace 전체에서 동일 키+동일 destination/payload는 기존 결과를 반환하고, 같은 키의 destination 또는 payload가 다르면 `409 idempotency_conflict`다.
- update는 `expectedUpdatedAt`을 요구한다. 오래된 값이면 덮어쓰지 않고 `409 stale_task`와 현재 서버 Task를 반환한다.
- 상태 전이는 `inbox→todo|done`, `todo→doing|blocked|done`, `doing→todo|blocked|done`, `blocked→todo|doing|done`, `done→todo`만 허용한다.
- lane 우선순위는 `done 제외 → overdue=missed → blocked/doing=waiting → 오늘 due=today → inbox=inbox → 그 외 제외`다. date-only due는 선택일 다음날 workspace 자정부터 overdue다.
- 성공 상태는 create `201`, duplicate `200`, update `200`; validation `400`, auth `401/403`, entity `404`, conflict `409`, degraded `503`, timeout `504`다. Hub BFF는 Engine status/body/correlation id를 재분류하지 않는다.
- UI는 저장 실패 시 원문과 idempotency key를 유지한다. 충돌/실패 시 서버 행을 재조회해 복구하며, 로컬 상태를 성공처럼 보이지 않는다.

### Task 1: 개인 쓰기 세션 경계를 RED→GREEN으로 고정

**Files:**
- Modify: `apps/hub/lib/hub-write-guard.js`
- Modify: `apps/hub/lib/hub-write-guard.test.mjs`
- Create: `apps/hub/app/api/hub/session/route.js`
- Modify: `apps/hub/lib/write-route-contract.test.mjs`

- [x] **Step 1: 실패 테스트 작성**

`hub-write-guard.test.mjs`에 다음 행위를 추가한다.

```js
test("production accepts a valid signed operator session", async () => {
  const token = await createOperatorSessionToken({ secret: "operator-secret", now: 1_000 });
  const request = requestWithCookie(`moonlight_operator_session=${token}`);
  await assert.doesNotReject(() => assertHubWriteAllowed(request, env, { now: 1_001 }));
});

test("production rejects expired or tampered sessions and same-origin alone", async () => {
  await assert.rejects(() => assertHubWriteAllowed(tamperedRequest, env), /unauthorized/i);
  await assert.rejects(() => assertHubWriteAllowed(sameOriginRequest, env), /unauthorized/i);
});
```

세션 route 계약은 `POST`가 secret을 JSON으로 받아 성공 시 HttpOnly/Secure/SameSite=Strict 쿠키를 설정하고, `GET`은 `{ unlocked: boolean }`, `DELETE`는 쿠키를 만료시키는지 검사한다.

- [x] **Step 2: RED 확인**

Run: `node --test apps/hub/lib/hub-write-guard.test.mjs apps/hub/lib/write-route-contract.test.mjs`

Expected: session token exports와 `/api/hub/session` 계약이 없어 FAIL.

- [x] **Step 3: 최소 구현**

발급에는 Web Crypto HMAC-SHA256을 사용하고, 기존 26개 동기 guard 호출부를 보존하기 위해 검증에는 Node HMAC-SHA256을 사용한다. 양쪽 encoding 교차 호환을 테스트로 고정한다. token payload는 `v=1`, `exp`, nonce만 포함하고 secret 원문은 포함하지 않는다. 비교는 constant-time byte comparison을 사용한다. 세션 쿠키로 인증할 때만 허용 Origin/Referer를 추가 검증하고 secret header/Bearer 자동화는 origin 검사에서 제외한다.

```js
export async function createHubOperatorSession(candidateSecret, options = {}) {
  if (!safeEquals(resolveHubWriteSecret(), candidateSecret)) return null;
  const payload = encodeSessionPayload(options);
  return { token: `${payload}.${await signWithWebCrypto(payload)}` };
}

export function assertHubWriteAllowed(req, options = {}) {
  const expectedSecret = resolveHubWriteSecret();
  if (isHubWriteAllowedBySecret(req, expectedSecret)) return null;
  if (hasValidHubOperatorSession(req, options) && isHubRequestOriginAllowed(req)) return null;
  if (!isProductionRuntime() && isHubRequestOriginAllowed(req)) return null;
  return unauthorizedOrUnconfiguredResponse(expectedSecret);
}
```

- [x] **Step 4: GREEN 확인**

Run: `node --test apps/hub/lib/hub-write-guard.test.mjs apps/hub/lib/write-route-contract.test.mjs`

Expected: PASS. 기존 production same-origin 거부 테스트도 유지.

### Task 2: 원자적 Task 저장 RPC와 receipt 구현

**Files:**
- Create: `supabase/migrations/20260713_0015_durable_task_loop.sql`
- Modify: `supabase/apply-pending.sql`
- Modify: `supabase/setup/00_live_schema.sql`
- Modify: `supabase/setup/99_smoke_checks.sql`
- Modify: `supabase/schema.sql`
- Create: `scripts/check-durable-task-contract.test.mjs`

- [x] **Step 1: SQL 계약 실패 테스트 작성**

테스트는 migration과 apply bundle 양쪽에 다음이 있는지 검사한다.

```js
for (const sql of [migrationSql, applyPendingSql]) {
  assert.match(sql, /create table[^;]+mutation_receipts/is);
  assert.match(sql, /create or replace function public\.create_task_v1/is);
  assert.match(sql, /create or replace function public\.update_task_v1/is);
  assert.match(sql, /create or replace function public\.capture_quick_input_v1/is);
  assert.match(sql, /for update/is);
  assert.match(sql, /revoke all[^;]+from public/is);
  assert.match(sql, /grant execute[^;]+to service_role/is);
}
```

- [x] **Step 2: RED 확인**

Run: `node --test scripts/check-durable-task-contract.test.mjs`

Expected: migration/RPC가 없어 FAIL.

- [x] **Step 3: receipt와 RPC 구현**

```sql
create table if not exists public.mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null,
  destination text not null check (destination in ('task','inbox')),
  action text not null check (action in ('create','update','capture')),
  payload_hash text not null,
  task_id uuid references public.tasks(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete restrict,
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);
```

`create_task_v1(workspace, key, payload)`는 receipt claim과 Task insert를 같은 함수 트랜잭션에서 실행한다. `update_task_v1(workspace, task, key, expected_updated_at, payload)`는 Task를 `FOR UPDATE`하고 timestamp와 transition을 확인한 뒤 update한다. `capture_quick_input_v1(workspace, key, payload)`는 기존 classifier가 만든 kind/persona/summary와 raw 원문을 받아 proposed work order를 같은 트랜잭션에서 만든다. project/entityRef/owner는 같은 workspace인지 검사한다. `done`은 `completed_at`, 최초 `doing`은 `started_at`, reopen은 `completed_at=null`을 적용한다. 세 RPC는 canonical entity JSON과 `saved|duplicate|conflict` 결과를 반환한다.

- [x] **Step 4: setup/schema/apply bundle 동기화 및 GREEN**

Run: `node --test scripts/check-durable-task-contract.test.mjs && npm run check:contracts`

Expected: PASS.

### Task 3: Engine Task command와 guarded API 구현

**Files:**
- Modify: `apps/engine/lib/supabase-rest.ts`
- Create: `apps/engine/lib/commands/task-command.ts`
- Create: `apps/engine/app/api/tasks/route.ts`
- Create: `apps/engine/app/api/tasks/[id]/route.ts`
- Create: `apps/engine/app/api/intake/quick-capture/route.ts`
- Create: `apps/engine/lib/task-command.test.mjs`
- Create: `apps/engine/lib/task-route.test.mjs`
- Modify: `scripts/check-connections.mjs`

- [x] **Step 1: command/route behavioral tests 작성**

RPC transport를 주입해 payload와 HTTP mapping을 검사한다.

```js
const result = await executeCreateTaskCommand({
  workspaceId: WORKSPACE_ID,
  idempotencyKey: "task:one",
  input: { title: "견적 후속 연락", status: "inbox" },
  callRpc: async (name, args) => ({ result: "saved", task: canonicalTask })
});
assert.equal(result.httpStatus, 201);
assert.equal(result.body.task.id, canonicalTask.id);
```

duplicate=200, payload mismatch/stale=409, invalid=400, missing entity=404, config=503, timeout=504도 각각 검사한다. Engine route 계약은 `validateSharedWebhookRequest`를 통과해야만 command를 호출하고 body의 workspace/owner를 무시하는지 확인한다.

- [x] **Step 2: RED 확인**

Run: `node --test apps/engine/lib/task-command.test.mjs apps/engine/lib/task-route.test.mjs`

Expected: command/routes/RPC client가 없어 FAIL.

- [x] **Step 3: RPC transport와 command 구현**

```ts
export async function callSupabaseRpc<T>(name: string, args: unknown): Promise<T> {
  return fetchSupabaseJson<T>(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(args)
  });
}
```

`task-command.ts`는 입력 크기/필드/status/priority/date/entityRef를 검증하고 server context의 workspace만 RPC에 전달한다. route는 correlation id와 `retryable`을 포함한 command 응답을 그대로 반환한다. quick-capture는 명시적 `destination=task|inbox`를 받고 task는 같은 command, inbox는 Engine 안의 durable work-order sink를 사용한다.

- [x] **Step 4: GREEN 확인**

Run: `node --test apps/engine/lib/task-command.test.mjs apps/engine/lib/task-route.test.mjs && npm --workspace @com-moon/engine run typecheck && npm --workspace @com-moon/engine run build`

Expected: focused 15/15, typecheck와 build PASS. `check:connections`는 로컬 필수 환경 변수 미설정 시 명시적 FAIL이며 코드 성공으로 오인하지 않는다.

### Task 4: Hub Engine client와 Task BFF 구현

**Files:**
- Create: `apps/hub/lib/engine-write-client.js`
- Create: `apps/hub/lib/engine-write-client.test.mjs`
- Create: `apps/hub/app/api/hub/tasks/route.js`
- Create: `apps/hub/app/api/hub/tasks/[id]/route.js`
- Modify: `apps/hub/app/api/hub/inbox/route.js`
- Modify: `apps/hub/lib/write-route-contract.test.mjs`
- Modify: `scripts/check-inbox-router.mjs`

- [x] **Step 1: forwarding 실패 테스트 작성**

```js
test("forwards server workspace and preserves engine response", async () => {
  const response = await sendEngineWrite("/api/tasks", {
    method: "POST",
    idempotencyKey: "task:one",
    body: { title: "Call", workspaceId: "browser-forged" },
    fetchImpl
  });
  assert.equal(sent.headers.get("x-com-moon-secret"), "shared-secret");
  assert.equal(sent.body.workspaceId, DEFAULT_WORKSPACE_ID);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), engineConflict);
});
```

timeout은 504/retryable, Engine 비가용은 503, body size 초과는 413을 검사한다.

기존 Inbox 분류 회귀도 고정한다. `destination=task` 또는 명시적 task hint만 Task로 보내며, 기존 lead/dm/outcome/idea/note 분류와 persona/summary를 유지한다. 모든 destination에서 raw 원문은 RPC payload에 포함되고 Approval Queue가 읽는 proposed work-order shape는 바뀌지 않는다.

- [x] **Step 2: RED 확인**

Run: `node --test apps/hub/lib/engine-write-client.test.mjs apps/hub/lib/write-route-contract.test.mjs && npm run check:inbox`

Expected: client/BFF route가 없어 FAIL.

- [x] **Step 3: client와 BFF 구현**

각 route는 먼저 `assertHubWriteAllowed`, 다음 `readHubWriteJson`, 마지막 `sendEngineWrite` 순으로 실행한다. `sendEngineWrite`는 body의 workspace/owner를 제거하고 server workspace를 주입하며 Engine의 status/body/correlation header를 그대로 반환한다. inbox route의 Hub direct Supabase write는 제거하고 Engine `/api/intake/quick-capture`로 전환한다.

- [x] **Step 4: GREEN 확인**

Run: `node --test apps/hub/lib/engine-write-client.test.mjs apps/hub/lib/write-route-contract.test.mjs && npm run check:inbox`

Expected: PASS.

### Task 5: canonical Task read model과 attention lanes 구현

**Files:**
- Modify: `apps/hub/lib/repositories/operating-ledger.js`
- Modify: `apps/hub/lib/server-read.js`
- Create: `apps/hub/lib/task-attention.js`
- Create: `apps/hub/lib/task-attention.test.mjs`
- Modify: `apps/hub/app/api/hub/daily-brief/route.js`
- Modify: `apps/hub/app/api/hub/projects/route.js`

- [x] **Step 1: timezone/lane 실패 테스트 작성**

```js
assert.equal(resolveTaskLane(overdueTimed, seoulNow), "missed");
assert.equal(resolveTaskLane(blockedFuture, seoulNow), "waiting");
assert.equal(resolveTaskLane(todayDateOnly, seoulNow), "today");
assert.equal(resolveTaskLane(undatedInbox, seoulNow), "inbox");
assert.equal(resolveTaskLane(doneTask, seoulNow), null);
```

정렬은 lane, priority, dueAt, createdAt, id 순으로 deterministic해야 한다.

- [x] **Step 2: RED 확인**

Run: `node --test apps/hub/lib/task-attention.test.mjs`

Expected: helper/canonical fields가 없어 FAIL.

- [x] **Step 3: 실제 Task만 반환하도록 구현**

`mapTodos`는 기존 호환 필드와 함께 `status`, `priority`, `dueAt`, `duePrecision`, `updatedAt`, `nextAction`, `meta`, `projectId`, `projectName`을 보존한다. daily-brief API는 가짜 09:00/14:00 `blocks` 대신 `taskLanes`와 `taskSource: live|preview|empty|error`를 반환한다. Projects read API도 같은 canonical shape를 사용한다.

기존 repository 동작을 바꾸지 않도록 `server-read.js`에 별도 discriminated helper를 추가한다.

```js
export async function fetchSupabaseRowsWithState(path, options) {
  if (!hasSupabaseReadConfig()) return { state: "preview", rows: [] };
  try {
    return { state: "live", rows: await fetchSupabaseRows(path, options) ?? [] };
  } catch (error) {
    return { state: "error", rows: [], errorCode: normalizeReadError(error) };
  }
}
```

- [x] **Step 4: GREEN 확인**

Run: `node --test apps/hub/lib/task-attention.test.mjs && npm run test`

Expected: PASS.

### Task 6: Quick Capture와 정직한 저장 상태 구현

**Files:**
- Create: `apps/hub/components/hub/quick-capture.jsx`
- Create: `apps/hub/lib/durable-task-client.js`
- Create: `apps/hub/lib/durable-task-client.test.mjs`
- Modify: `apps/hub/components/hub/hub-tokens.css`
- Modify: `apps/hub/components/hub/pages/daily-brief.jsx`
- Modify: `scripts/check-honest-ui.test.mjs`

- [x] **Step 1: 실패/재시도 상태 테스트 작성**

client adapter에서 최초 생성한 key를 saved/duplicate 전까지 유지하는지 검사한다.

```js
const first = createTaskMutation({ fetchImpl: failingFetch, keyFactory: () => "stable-key" });
await assert.rejects(() => first.save({ title: "후속 연락" }));
assert.equal(first.snapshot().idempotencyKey, "stable-key");
await first.retry();
assert.equal(lastRequest.headers.get("Idempotency-Key"), "stable-key");
```

honest UI 계약은 role=alert/aria-live, 실패 원문 유지, pending disabled, task/inbox destination, 세션 잠금 해제 surface를 검사한다.

- [x] **Step 2: RED 확인**

Run: `node --test apps/hub/lib/durable-task-client.test.mjs scripts/check-honest-ui.test.mjs`

Expected: capture/client가 없어 FAIL.

- [x] **Step 3: Quick Capture 구현**

Daily Brief 첫 fold의 첫 surface에 Quick Capture를 둔다. 바로 뒤의 `Missed/Today` durable attention surface는 Task 7에서 연결한다. capture는 짧은 원문, `할 일|정리 전` 목적지를 명시하며 기본값은 `할 일`이다. Enter 저장, pending 중 disabled, 16px 이상 input, 44px hit target, label과 `aria-live`를 제공한다. 401이면 같은 화면에서 write secret을 한 번 입력해 `/api/hub/session`을 열고 secret은 메모리에서도 즉시 비운다.

- [x] **Step 4: GREEN 확인**

Run: `node --test apps/hub/lib/durable-task-client.test.mjs scripts/check-honest-ui.test.mjs`

Expected: PASS.

### Task 7: Today와 Projects를 같은 durable Task에 연결

**Files:**
- Modify: `apps/hub/components/hub/pages/daily-brief.jsx`
- Modify: `apps/hub/components/hub/pages/projects.jsx`
- Modify: `apps/hub/components/hub/hub-primitives.jsx`
- Modify: `apps/hub/components/hub/hub-tokens.css`
- Create: `scripts/check-durable-task-ui.test.mjs`

- [x] **Step 1: UI route/identity 계약 실패 테스트 작성**

테스트는 index key/local-only toggle/fake time을 금지하고, task id+updatedAt PATCH와 mutation 후 refetch를 요구한다.

```js
assert.doesNotMatch(dailySource, /09:00|14:00|toggle\(i\)/);
assert.match(dailySource, /Idempotency-Key/);
assert.match(projectsSource, /expectedUpdatedAt/);
assert.match(projectsSource, /refetch|reloadLedger/);
```

- [x] **Step 2: RED 확인**

Run: `node --test scripts/check-durable-task-ui.test.mjs`

Expected: 기존 로컬 Today/read-only Projects 때문에 FAIL.

- [x] **Step 3: durable interaction 구현**

Today는 실제 `missed/today/waiting/inbox` Task만 표시하고 labeled Checkbox 완료 시 PATCH한다. 행별 pending만 잠그고 성공 시 refetch한다. stale/실패면 응답의 current task 또는 GET 재조회로 원복하고 retry 안내를 남긴다. Projects에는 `+ Task`, empty CTA, project-linked composer, 완료 Checkbox, EditDrawer(title/status/priority/due/nextAction)를 추가하되 Project 자체 create는 계속 read-only다.

- [x] **Step 4: GREEN 확인**

Run: `node --test scripts/check-durable-task-ui.test.mjs scripts/check-honest-ui.test.mjs && npm run test`

Expected: PASS.

### Task 8: 통합 검증, 실제 화면 QA, 문서 동기화

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`
- Modify: `docs/status/current-state.md`
- Modify: `TODOS.md`
- Modify: `docs/README.md`
- Modify: `package.json`

- [x] **Step 1: 정적/단위/계약 전체 검증**

Run:

```bash
npm run test
npm run check:contracts
npm run check:connections
npm run check:inbox
npm run typecheck
npm run lint
npm run build
```

Expected: 코드·정적 명령은 exit 0. `check:connections`는 별도 활성화 진단이며, 환경 변수가 없으면 명시적으로 실패하고 live DB 검증을 실행하지 않는다.

결과: test 174/174, contracts, Inbox, typecheck, build는 통과. lint는 exit 0이지만 실행 task 0개. `check:connections`는 Hub/Engine/Supabase URL 미설정으로 예상된 exit 1이며 활성화 게이트로 이관.

루트 `test` script는 신규 Engine behavioral test를 누락하지 않게 다음 glob을 포함한다.

```json
"test": "node --test scripts/*.test.mjs apps/hub/lib/*.test.mjs apps/engine/lib/*.test.mjs"
```

- [ ] **Step 2: DB 적용 가능한 환경에서 원자성 smoke**

Run: `npm run db:migrate -- 20260713_0015_durable_task_loop.sql`

Verify: create→reload, same-key retry→한 행 duplicate, same-key/different-payload→409, stale updatedAt→409+current, complete→reload, destination 실패→receipt와 Task 모두 rollback.

상태: 환경 미설정으로 미실행. 코드 완료와 live 활성화를 분리하기 위해 체크를 유지한다.

- [x] **Step 3: 브라우저 QA**

390×844와 desktop에서 Daily Brief 첫 fold, 세션 잠금 해제, task/inbox capture, retry, Today complete, Projects create/edit/complete, keyboard focus, dark/light contrast를 확인한다. loading/empty/preview/error 상태를 각각 캡처하고 console error가 0인지 확인한다.

결과: local production build에서 targeted QA 21 final-run screenshots PASS. desktop/mobile preview·live·loading·empty·error, task/inbox saved·duplicate capture, create/editor/completion 401 unlock, delayed busy, 409 conflict, 503 retained state, keyboard navigation, breakpoint focus·44px target, saved-capture focus, dark/light theme descendant transitions를 검증했다. 확장 QA와 독립 리뷰에서 찾은 responsive navigation focus/semantics/target-size, theme transition contrast, capture focus 문제는 수정 후 강화된 matrix로 재검증했다. `/favicon.ico` 404 1건만 Low로 남음. 보존된 범위는 [`../../status/phase1a-browser-qa.md`](../../status/phase1a-browser-qa.md)를 따른다.

- [x] **Step 4: 문서 상태 갱신**

deep design의 stale 문구인 “기존 local task create/complete 연결”을 “Phase 0 read-only surface에 durable interaction 추가”로 고친다. current-state와 TODOS에 실제 완료/보류 범위, migration 적용 여부, Phase 1B(자동 attention/proposal)는 미구현임을 명시한다.

- [ ] **Step 5: 최종 diff 감사와 커밋**

Run: `git diff --check && git status --short && git diff --stat`

Expected: whitespace error 없음, 의도한 파일만 변경. 검증 증거를 확인한 뒤 범위별 커밋으로 현재 branch를 push한다.

상태: source commits는 완료됐고 documentation reconciliation과 최종 독립 리뷰를 진행 중이다. live migration/smoke는 Step 2의 환경 게이트로 의도적으로 열린 상태다.

## 실행 구조 리뷰

### What already exists

| 기존 자산 | 이번 단계의 사용 방식 |
|---|---|
| `tasks` ledger, status check, `updated_at` trigger, workspace indexes | 새 Task 테이블을 만들지 않고 그대로 확장한다. |
| `validateSharedWebhookRequest()` | 모든 신규 Engine route의 shared-secret 경계로 재사용한다. |
| `hub-write-guard.js`, `readHubWriteJson()` | 기존 production same-origin 거부와 64KB body cap을 보존하고 signed session만 추가한다. |
| `approve_content_draft_work_order()` | `FOR UPDATE`, 단일 트랜잭션, service-role-only grant의 SQL 선례로 사용한다. |
| `inbox-classify.js`, `inbox-router.js` | 기존 lead/dm/outcome/idea/note 분류 결과를 보존하고 destination write만 Engine으로 옮긴다. |
| `Card`, `Checkbox`, `SegmentedControl`, `EmptyState`, `SyncBadge`, `EditDrawer` | Quick Capture와 Task 행을 새 primitive로 복제하지 않고 조합한다. |
| `DESIGN.md` Moonstone tokens와 `.hub-row` | 페이지 안 색상/hover/두꺼운 border를 새로 만들지 않는다. |

### Data flow

```text
[Browser]
  | POST /api/hub/session (secret once)
  | Set-Cookie: HttpOnly + Secure + SameSite=Strict
  v
[Hub BFF: session + body cap]
  | strips browser workspace/owner
  | injects server workspace + shared secret + correlation id
  v
[Engine: shared-secret guard]
  | validate + normalize command
  v
[Postgres RPC, one transaction]
  |-- claim mutation_receipt by workspace + key
  |-- verify owner/membership + same-workspace refs
  |-- create/update task OR create proposed inbox work_order
  |-- store canonical response
  `-- rollback everything on any error
  v
[Hub response passthrough] -> [refetch canonical read] -> [honest UI]
```

```text
TASK STATE MACHINE

inbox  -> todo | done
todo   -> doing | blocked | done
doing  -> todo | blocked | done
blocked-> todo | doing | done
done   -> todo

Any other edge = 409/invalid_transition, no row mutation.
```

### Screen hierarchy

```text
Daily Brief, first fold
1. Page title + source state
2. Quick Capture [raw input] [할 일 | 정리 전] [저장]
3. 지금 할 일
   a. 기한 지남
   b. 오늘
   c. 진행/대기
   d. 정리 전
4. Existing brief context, approvals, metrics

Projects
1. Existing page title + project navigation
2. Selected project context
3. + Task / empty CTA
4. Canonical task rows with complete + edit
5. Project creation remains read-only
```

### Interaction state coverage

| Feature | Loading | Empty | Error | Success | Partial/conflict |
|---|---|---|---|---|---|
| Operator session | button pending, secret input disabled | locked 안내와 “쓰기 잠금 해제” | secret 유지 없이 다시 입력, 원래 capture 원문 유지 | 짧은 “잠금 해제됨”, capture로 focus 복귀 | expired session은 같은 inline unlock으로 복귀 |
| Quick Capture | 저장 버튼 spinner, input/destination disabled | 빈 문자열 제출 금지, placeholder는 실제 예시 | 원문+key 유지, `role=alert`, 재시도 | saved/duplicate에서만 input clear | 409는 “같은 요청 키 충돌”, 새 key로 명시적 재시도 |
| Today tasks | 고정 높이 skeleton 2행 | “지금 급한 할 일이 없습니다” + `N 새 할 일` | source error, mock 없음, 다시 불러오기 | 실제 lane/Task ID 렌더 | row pending만 잠금, stale이면 current row 복구 |
| Projects tasks | selected project 영역 skeleton | “이 프로젝트의 첫 할 일을 추가” CTA | 기존 task 유지 + retry | create/edit/complete 뒤 canonical refetch | stale drawer 값을 서버 current로 바꾸고 안내 |
| Preview | spinner 없음 | 설정 전이라는 설명 + disabled write | live처럼 보이는 fixture 금지 | 환경 연결 후 reload CTA | live-empty와 별도 badge |

### Responsive and accessibility contract

- `390×844`: 제목 아래 12px 간격으로 capture와 첫 Task를 같은 viewport에 둔다. capture destination은 가로 2분할, 입력/저장은 다음 행으로 갈 수 있으나 16px input과 44px action 높이를 유지한다.
- `sm`: capture를 `input | destination | save` 한 행으로 전환하고 lane heading과 count를 같은 baseline에 둔다.
- `lg`: Daily Brief의 기존 보조 맥락은 Task stack 아래 2열로 돌아가지만 Quick Capture와 Task stack은 읽기 폭을 유지한다.
- 모든 Task Checkbox는 제목을 accessible label로 사용한다. pending은 `aria-busy`, 상태 안내는 `aria-live=polite`, 실패는 `role=alert`다.
- `N`은 input/textarea/select/contentEditable 또는 drawer focus 중에는 동작하지 않는다. Enter는 capture 저장, Space/Enter는 Task row/Checkbox, Esc는 drawer를 닫는다.
- focus는 기존 `--moon-300` 1px/2px offset을 사용하고, status 색상만으로 상태를 구분하지 않는다.

### User journey

| Step | Operator action | Intended feeling | UI support |
|---|---|---|---|
| 1 | 앱을 열고 문득 든 일을 입력 | “기억에서 내려놨다” | 첫 fold capture, 한 문장 입력 |
| 2 | 저장 상태 확인 | “진짜 남았다” | saved/duplicate와 durable ID, preview와 분리 |
| 3 | Today에서 지금 할 일을 스캔 | “무엇부터 할지 안다” | missed/today/waiting/inbox 순서와 이유 |
| 4 | 완료 체크 | “한 건 닫혔다” | 서버 성공 후 제거, 실패 시 행 유지 |
| 5 | 새로고침 | “시스템을 믿을 수 있다” | 같은 Task 원장을 재조회해 결과 유지 |

### Test coverage diagram

```text
CODE PATH COVERAGE TARGET

Session
├── valid secret -> signed cookie -> valid cookie       [unit + route contract]
├── wrong/tampered/expired cookie                       [unit]
└── production same-origin only remains denied          [CRITICAL regression]

Hub BFF
├── body cap/auth/server workspace injection             [unit]
├── Engine status/body/correlation exact passthrough     [unit]
└── timeout/unconfigured Engine -> 504/503, retryable    [unit]

Engine command
├── create/update/capture validation                     [unit]
├── shared-secret failure                                [route contract]
└── RPC saved/duplicate/conflict/not-found/degraded      [unit]

Postgres RPC
├── receipt + destination atomic commit                  [SQL contract + live smoke]
├── same key same payload -> one row                     [live smoke]
├── same key different destination/payload -> conflict  [live smoke]
├── stale expectedUpdatedAt -> current task              [live smoke]
├── invalid state / foreign workspace refs               [live smoke]
└── injected destination failure -> full rollback        [live smoke]

Read model
├── live / live-empty / preview / error                  [unit]
├── timed/date-only Asia/Seoul boundaries                [unit]
└── lane precedence + deterministic sort                 [unit]

USER FLOW COVERAGE TARGET

capture -> reload -> complete -> reload                  [E2E/live smoke]
failed capture -> retry with same key                    [adapter + E2E]
two tabs -> stale complete/edit -> current row recovery  [adapter + live smoke]
session expires mid-capture -> unlock -> same raw retry  [E2E]
double click -> one row                                  [adapter + live smoke]
Inbox lead/dm/idea -> Approval Queue shape unchanged     [CRITICAL regression]
```

### Failure modes

| Production failure | Test | Handling | Operator sees |
|---|---|---|---|
| Hub→Engine timeout | transport unit | AbortController, 504 retryable | 원문 유지 + 다시 시도 |
| service-role key 없음 | command unit | mutation 호출 중단, 503 | “저장소 연결 필요”, saved 금지 |
| duplicate requests race | live RPC smoke | unique receipt + ON CONFLICT/lock | duplicate success, 한 행 |
| stale Task in two tabs | live RPC + adapter | expectedUpdatedAt compare | current row 복구 안내 |
| Supabase read network failure | repository unit | discriminated `error` | mock 없는 error/retry |
| receipt 뒤 destination insert 실패 | live RPC smoke | transaction rollback | 실패, 같은 key 재시도 가능 |
| 기존 Inbox classifier 손실 | regression test | 분류는 Hub에서 보존 | Approval Queue 그대로 |
| expired operator session | guard/UI test | 401 후 unlock flow | capture 원문은 그대로 |

Silent failure 허용 건수는 0이다.

### Parallel execution lanes

| Lane | Modules | Depends on |
|---|---|---|
| A | `supabase/`, `apps/engine/` | fixed API/SQL contract |
| B | Hub guard/session/BFF | fixed API contract |
| C | Hub repository/components/pages | task response/read shape |
| Root | cross-lane integration, docs, verification | A + B + C |

Lane A와 B는 병렬 시작한다. Lane C는 pure lane/read/client adapter RED tests를 먼저 만들고, canonical response shape가 고정되면 UI를 연결한다. `apps/hub/app/api/hub/inbox/route.js`는 B만, `daily-brief.jsx`/`projects.jsx`는 C만 소유해 충돌을 피한다.

### NOT in scope

- Phase 1B cross-lane `AttentionItem`/ranking engine: Phase 1A Task-only loop가 실사용 신뢰를 증명한 뒤 추가한다.
- Follow-up/Calendar/KA 자동 우선순위: 현재 Task loop를 막지 않으며 owner verification이 먼저다.
- atomic contact outcome + next task/review: Phase 1C 별도 transaction contract다.
- ClassIn 양방향 sync와 owner import: 초기 개인 원장 이후의 integration 단계다.
- 음성 STT/미팅 분석과 API 비용 기능: 중요한 미팅 우선의 후속 부가 기능이다.
- 자동 70/30 프로젝트 진척률과 PMS 병목 score: 데이터가 쌓인 뒤 검증한다.
- Project 자체 생성/삭제: 이번 단계는 Task interaction만 durable하게 만든다.
- 새 디자인 mockup: gstack designer binary가 현재 설치되지 않았고, 기존 DESIGN.md/primitive로 UI 방향이 충분히 고정됐다. 구현 후 실제 화면 `/design-review`로 보완한다.

## Review completion summary

- Step 0 Scope Challenge: Phase 1A vertical slice로 이미 축소됨. 파일 수는 많지만 Browser→Hub→Engine→DB→reload의 신뢰 경계를 생략할 수 없어 범위 유지.
- Architecture Review: session 없는 production 401, non-atomic write, honest read 손실, Inbox 회귀 4건을 계획에 반영.
- Code Quality Review: shared Engine transport, generic receipt, discriminated Task read, canonical client adapter로 중복 경계를 제한.
- Test Review: unit/contract/live smoke/E2E 경로와 2개 CRITICAL regression을 명시.
- Performance Review: Task query는 workspace/status/due index를 재사용하고 첫 fold 최대 5개만 렌더. N+1 신규 쿼리 없음.
- Failure modes: 8개, silent critical gap 0.
- Parallelization: 3 lanes + root integration.
- Design Review: 7/10 → 9/10. hierarchy, states, journey, tokens, 390×844, keyboard/SR 계약을 추가. mockup binary 부재만 후속 실제 화면 QA로 남김.
- Unresolved decisions: 0. 기존 승인된 전제와 “전체 진행” 지시에 따라 complete option을 채택.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | Approach B와 Phase 1A 우선순위가 기존 design doc에 승인됨 |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | CLEAR | 4 architecture gaps fixed in plan, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 7/10 → 9/10, 6 explicit design decisions |

**VERDICT:** ENG + DESIGN CLEARED. Phase 1A 구현 가능.
