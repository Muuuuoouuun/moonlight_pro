# Project Fast Create 1-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved project quick-create drawer with a required flat Area classification, optional Brand and Lead/Customer context, durable same-workspace relations, and a saved-project detail handoff.

**Architecture:** Extend the existing Project record instead of introducing a new work graph. Supabase stores typed nullable customer references; Engine normalizes and validates all project references; the Hub read adapter supplies raw project fields and selector catalogs; a page-specific `ProjectCreateDrawer` composes the shared `Drawer` shell while existing edit flows remain on `EditDrawer`.

**Tech Stack:** Next.js App Router, React 18, TypeScript/JavaScript, Node test runner, Supabase PostgreSQL/REST, Moonlight Hub primitives.

---

## File map

- `supabase/migrations/20260717_0019_project_context_links.sql`: typed Project→Lead/Customer links, indexes, canonical Area seeds.
- `supabase/setup/00_live_schema.sql`: fresh-environment schema parity for the relation columns and indexes.
- `supabase/schema.sql`: compact schema parity.
- `apps/engine/lib/pms-command.ts`: normalize Area, nullable Brand, entityRef, and create-time immutable orgScope.
- `apps/engine/lib/pms-command.test.mjs`: command red/green contract.
- `apps/engine/lib/pms-command-service.ts`: same-workspace reference validation before persistence.
- `apps/engine/lib/pms-command-service.test.mjs`: negative and positive relation integrity tests.
- `apps/hub/lib/repositories/operating-ledger.js`: Area/CRM catalogs and lossless project relation/raw-field projection.
- `apps/hub/lib/pms-ui.js`: pure draft/payload/entity helpers.
- `apps/hub/lib/pms-ui.test.mjs`: quick-create draft and payload tests.
- `apps/hub/components/hub/pages/project-create-drawer.jsx`: create-only drawer form and interaction state.
- `apps/hub/lib/project-create-drawer-contract.test.mjs`: accessible structure/copy/source contract.
- `apps/hub/components/hub/pages/projects.jsx`: creation context, payload persistence, and saved-project detail handoff.

### Task 1: Add typed Project context relations and Engine validation

**Files:**
- Create: `supabase/migrations/20260717_0019_project_context_links.sql`
- Modify: `supabase/setup/00_live_schema.sql`
- Modify: `supabase/schema.sql`
- Modify: `apps/engine/lib/pms-command.test.mjs`
- Modify: `apps/engine/lib/pms-command.ts`
- Modify: `apps/engine/lib/pms-command-service.test.mjs`
- Modify: `apps/engine/lib/pms-command-service.ts`

- [ ] **Step 1: Write the failing command tests**

Add tests that expect a brand-null project with Area, Lead, and orgScope to normalize exactly, and reject an unsupported entity type.

```js
test("normalizes project area, optional brand, lead context, and org scope", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "갈무리 첫결제 SW",
    areaId: "22222222-2222-4222-8222-222222222222",
    brandId: "",
    entityRef: { type: "lead", id: "55555555-5555-4555-8555-555555555555" },
    orgScope: "classin",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.record.area_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(result.record.brand_id, null);
  assert.equal(result.record.lead_id, "55555555-5555-4555-8555-555555555555");
  assert.equal(result.record.customer_account_id, null);
  assert.equal(result.record.meta.org_scope, "classin");
});

test("rejects unsupported project entity references", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "잘못된 연결",
    areaId: "22222222-2222-4222-8222-222222222222",
    entityRef: { type: "deal", id: "55555555-5555-4555-8555-555555555555" },
  }, { workspaceId: "33333333-3333-4333-8333-333333333333" });
  assert.deepEqual(result, { ok: false, reason: "invalid-entity-ref" });
});

test("rejects project org scope updates because creation context is immutable", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "update_project",
    id: "11111111-1111-4111-8111-111111111111",
    orgScope: "personal",
  }, { workspaceId: "33333333-3333-4333-8333-333333333333" });
  assert.deepEqual(result, { ok: false, reason: "unsupported-org-scope-update" });
});
```

- [ ] **Step 2: Run the Engine tests and verify RED**

Run:

```bash
node --test apps/engine/lib/pms-command.test.mjs
```

Expected: the new tests fail because `area_id`, typed customer references, and `org_scope` are not normalized.

- [ ] **Step 3: Implement the migration and minimal command normalization**

The migration must add nullable typed FKs, enforce at most one customer context, add reverse indexes, and idempotently seed canonical Areas per workspace without altering legacy Areas.

```sql
alter table public.projects
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists customer_account_id uuid references public.customer_accounts(id) on delete set null;

alter table public.projects drop constraint if exists projects_single_customer_context;
alter table public.projects add constraint projects_single_customer_context
  check (num_nonnulls(lead_id, customer_account_id) <= 1);

create index if not exists idx_projects_workspace_lead_updated
  on public.projects (workspace_id, lead_id, updated_at desc) where lead_id is not null;
create index if not exists idx_projects_workspace_customer_updated
  on public.projects (workspace_id, customer_account_id, updated_at desc) where customer_account_id is not null;
```

Implement an Engine helper that accepts only `lead` and `customer_account`, emits mutually exclusive columns, allows `entityRef: null` on update, accepts nullable brand, requires a valid Area on create, and writes only `classin | personal` to `meta.org_scope` during creation. In 1-1, orgScope is immutable creation context: `update_project` must reject either orgScope alias explicitly and must not read/merge/write project metadata. Moving an existing project between Hub lanes is out of scope.

- [ ] **Step 4: Run the command tests and verify GREEN**

Run:

```bash
node --test apps/engine/lib/pms-command.test.mjs
```

Expected: all command tests pass.

- [ ] **Step 5: Write failing same-workspace service tests**

Add positive and negative tests. An empty reference result must prove `insert` is never called when the selected Lead is missing or belongs to another workspace. A `null` lookup result must be classified as `{status:"error", error:"reference-lookup-unavailable"}` with no mutation rather than as invalid user input.

```js
test("rejects a cross-workspace project lead before insert", async () => {
  let insertCalls = 0;
  const result = await pmsService.executePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "갈무리 첫결제 SW",
    areaId: "22222222-2222-4222-8222-222222222222",
    entityRef: { type: "lead", id: "55555555-5555-4555-8555-555555555555" },
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
  }, {
    insert: async () => { insertCalls += 1; return { persisted: true, reason: "ok" }; },
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async (table) => table === "areas"
      ? [{ id: "22222222-2222-4222-8222-222222222222" }]
      : [],
  });
  assert.equal(insertCalls, 0);
  assert.deepEqual(result, { status: "invalid-input", error: "invalid-reference" });
});
```

- [ ] **Step 6: Run the service tests and verify RED**

Run:

```bash
node --test apps/engine/lib/pms-command-service.test.mjs
```

Expected: the cross-workspace test fails because persistence currently runs without validating references.

- [ ] **Step 7: Implement same-workspace reference validation**

Before insert/update, inspect normalized `area_id`, `brand_id`, `lead_id`, and `customer_account_id`. For each non-null value, fetch exactly one row using both `id` and `workspace_id`. Use a discriminated validation outcome: an empty row set returns `{status:"invalid-input", error:"invalid-reference"}`, while an unavailable/null lookup returns `{status:"error", error:"reference-lookup-unavailable"}` before mutation. Do not validate null references and do not infer a replacement.

- [ ] **Step 8: Run focused and full tests**

Run:

```bash
node --test apps/engine/lib/pms-command.test.mjs apps/engine/lib/pms-command-service.test.mjs
npm test
```

Expected: focused tests pass and the full suite reports zero failures.

- [ ] **Step 9: Commit Task 1**

```bash
git add supabase/migrations/20260717_0019_project_context_links.sql supabase/setup/00_live_schema.sql supabase/schema.sql apps/engine/lib/pms-command.ts apps/engine/lib/pms-command.test.mjs apps/engine/lib/pms-command-service.ts apps/engine/lib/pms-command-service.test.mjs
git commit -m "feat(pms): add project context relations"
```

### Task 2: Expose lossless Project catalogs and pure quick-create helpers

**Files:**
- Modify: `apps/hub/lib/repositories/operating-ledger.js`
- Modify: `apps/hub/lib/pms-ui.test.mjs`
- Modify: `apps/hub/lib/pms-ui.js`

- [ ] **Step 1: Write the failing Hub helper tests**

Replace the old `새 프로젝트` expectation and add payload/entity cases.

```js
test("builds an empty project draft with required area context", () => {
  assert.deepEqual(pmsUi.buildProjectDraft({
    areaId: "area-1",
    orgScope: "classin",
  }), {
    kind: "project",
    isNew: true,
    title: "",
    areaId: "area-1",
    brandId: null,
    brandKey: "all",
    entityKey: "",
    summary: "",
    status: "draft",
    priority: "medium",
    progress: 0,
    nextAction: "",
    dueAt: "",
    orgScope: "classin",
  });
});

test("builds a typed project create payload", () => {
  const payload = pmsUi.buildProjectCreatePayload({
    id: "project-1",
    title: "갈무리 첫결제 SW",
    areaId: "area-1",
    brandId: "",
    entityKey: "lead:lead-1",
    status: "draft",
    priority: "medium",
    summary: "첫 결제 완료",
    nextAction: "결제 링크 발송",
    dueAt: "",
    orgScope: "classin",
  });
  assert.deepEqual(payload.entityRef, { type: "lead", id: "lead-1" });
  assert.equal(payload.brandId, null);
  assert.equal(payload.progress, 0);
});
```

- [ ] **Step 2: Run the Hub helper tests and verify RED**

Run:

```bash
node --test apps/hub/lib/pms-ui.test.mjs
```

Expected: tests fail because the draft title is still prefilled and payload/entity helpers do not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Add `parseProjectEntityKey`, `buildProjectCreatePayload`, and the revised `buildProjectDraft`. Invalid entity keys must parse to `null`; do not silently turn a Deal key into a Lead.

- [ ] **Step 4: Extend the operating ledger read projection**

Fetch Areas, Leads, and Customer Accounts in the existing parallel read. Return selector catalogs shaped as:

```js
areas: [{ id, name, slug, canonical }]
projectEntities: [{ key: `lead:${id}`, type: "lead", id, label: `리드 · ${name}` }]
```

Project rows must expose raw `areaId`, `brandId`, `entityRef`, `orgScope`, `workspace`, `statusKey`, `priority`, `projectSummary`, `projectProgress`, and `projectNextAction` while preserving existing derived display fields.

- [ ] **Step 5: Run focused and full tests**

Run:

```bash
node --test apps/hub/lib/pms-ui.test.mjs
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/hub/lib/repositories/operating-ledger.js apps/hub/lib/pms-ui.js apps/hub/lib/pms-ui.test.mjs
git commit -m "feat(hub): expose project creation context"
```

### Task 3: Build and integrate ProjectCreateDrawer

**Files:**
- Create: `apps/hub/components/hub/pages/project-create-drawer.jsx`
- Create: `apps/hub/lib/project-create-drawer-contract.test.mjs`
- Modify: `apps/hub/components/hub/pages/projects.jsx`

- [ ] **Step 1: Write the failing drawer source contract test**

```js
test("project create drawer exposes the approved accessible flow", () => {
  const source = readFileSync(new URL("../components/hub/pages/project-create-drawer.jsx", import.meta.url), "utf8");
  for (const copy of [
    "프로젝트 만들기",
    "큰 결과와 첫 행동부터 기록하세요.",
    "프로젝트명",
    "목표 결과",
    "다음 행동",
    "업무 분야",
    "상세 설정",
    "만드는 중…",
  ]) assert.match(source, new RegExp(copy));
  assert.match(source, /aria-expanded/);
  assert.match(source, /aria-live/);
  assert.match(source, /metaKey\s*\|\|\s*event\.ctrlKey/);
});
```

- [ ] **Step 2: Run the drawer contract test and verify RED**

Run:

```bash
node --test apps/hub/lib/project-create-drawer-contract.test.mjs
```

Expected: test fails because the component file does not exist.

- [ ] **Step 3: Implement the create-only drawer**

Compose shared `Drawer`, `Button`, and `Iconed` primitives. Use labeled controlled inputs, a textarea for summary, a required Area select, and an `aria-expanded` detailed settings disclosure. Use Moonlight tokens only. Keep a local `saving | error` state, block double submit, and bind Cmd/Ctrl+Enter only while the component is mounted.

The `onSubmit` contract is:

```js
const result = await onSubmit(record);
if (result?.ok) onClose();
else setSaveState(result?.status === "preview" ? "preview" : "error");
```

Do not close or clear the form on preview/error.

- [ ] **Step 4: Integrate the drawer into Projects**

Load `areas` and `projectEntities` from `/api/hub/projects`, seed `areaId` and `orgScope`, and keep Brand optional. Use `buildProjectCreatePayload` for POST. After `saved` or `duplicate`:

```js
const createdId = data.project?.id || projectDraft.id;
await loadLedger();
setView("tree");
setExpanded((current) => new Set([...current, createdId]));
setOpenDetail(createdId);
```

Do not change the content-pipeline project seed flow. Keep existing project edits on `EditDrawer` and use raw read-model fields.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --test apps/hub/lib/project-create-drawer-contract.test.mjs apps/hub/lib/pms-ui.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 6: Run full test, lint, and build**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit 0. Existing warnings must be recorded; new warnings are failures.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/hub/components/hub/pages/project-create-drawer.jsx apps/hub/lib/project-create-drawer-contract.test.mjs apps/hub/components/hub/pages/projects.jsx
git commit -m "feat(hub): add fast project create drawer"
```

### Task 4: Review and browser verification

**Files:**
- Modify only files required by review findings.

- [ ] **Step 1: Run spec compliance review**

Check every requirement in `docs/superpowers/specs/2026-07-17-project-create-drawer-design.md`. Required outcomes: Area required, Brand optional, one typed Lead/Customer, no Deal UI, error retention, no duplicate submit, and exact detail handoff.

- [ ] **Step 2: Run code quality review**

Inspect mutation security, same-workspace validation, raw/derived read fields, React re-render boundaries, drawer keyboard behavior, and mobile form accessibility. Fix every Important or Critical finding and re-run focused tests.

- [ ] **Step 3: Start isolated Hub/Engine servers**

Use non-conflicting ports and existing local environment without writing QA records to the live workspace. Intercept Project POST in the browser or use a dedicated preview response.

```bash
npm --workspace @com-moon/engine exec next dev -p 3101
npm --workspace @com-moon/hub exec next dev -p 3100
```

- [ ] **Step 4: Verify the desktop workflow**

At 1440px: open the drawer, confirm initial focus, validate empty title, expand settings, select Area and Lead, submit an intercepted saved response, and confirm the returned project ID opens in the detail panel.

- [ ] **Step 5: Verify mobile and keyboard behavior**

At 390×844: confirm no horizontal overflow, 16px form controls, 44px targets, one-column details, Tab/Shift+Tab focus trap, Escape/overlay close, focus restoration, and Cmd/Ctrl+Enter double-submit protection.

- [ ] **Step 6: Capture and inspect visual evidence**

Capture desktop and mobile screenshots. Use `view_image` on the accepted companion concept and the latest browser screenshot. Compare copy, hierarchy, palette, border/surface treatment, spacing, drawer width, responsive collapse, focus/error state, and icon treatment. Fix every material mismatch.

- [ ] **Step 7: Run final fresh verification**

```bash
npm test
npm run lint
npm run build
git status --short
git log --oneline -4
```

Expected: tests/lint/build exit 0 and only intentional tracked changes are present.
