# Integration Cleanup & Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the five operator decisions of 2026-09-11 (spec §7): delete Telegram/n8n, OpenClaw, Gmail, Resend, and Notion code; wire Slack failure alerts; encrypt OAuth tokens; register the Moonlight MCP; connect Threads/Instagram with basic scopes only; plus the security fixes the audit found (OAuth state TTL, Vision apiKey leak).

**Architecture:** Deletions come first so later tasks touch fewer files. Every deletion removes code + env templates + seeds + tests together and leaves Supabase ledger rows untouched. Activation tasks add one small module each (`failure-alert.ts`, `oauth-state.js`, `connection-secrets.js`) that existing provider files call, instead of editing provider internals in four places. Verification after every task is `npm test` (baseline 784/784) and `npm run check:contracts`.

**Tech Stack:** Next.js App Router (hub = JS, engine = TS), Node `node:test`, Supabase PostgREST via `@com-moon/supabase-rest`, Node `crypto` (HMAC, AES-256-GCM), MCP stdio server (`@modelcontextprotocol/sdk`).

**Spec:** `docs/superpowers/specs/2026-09-11-integration-utilization-audit-and-plan.md`

---

## Ground rules for every task

- Branch: `git switch -c feat/integration-cleanup-0911` from `09-mac1` before Task 1. The working tree already has unrelated uncommitted edits (memo/project files). **Never `git add -A` or `git add .`** — stage only the paths listed in each task's commit step.
- Ledger data stays. No `DELETE` against Supabase. Seeds and schema comments are code and may change.
- `.env.local` files are the operator's; the plan tells you which **names** to remove, you edit them locally and never commit them.
- Never print secret values. Env var names only.
- Baseline before Task 1: `npm test` → `pass 784, fail 0`; `npm run check:contracts` → all PASS.
- Commit message trailer (required):
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XisWyo68y53dULNxjGY5t8
  ```

---

## File structure (what is created / deleted / edited)

**Created**
- `apps/engine/lib/failure-alert.ts` + `failure-alert.test.mjs` — one place that decides "should this failure page Slack?"
- `apps/hub/lib/oauth-state.js` + `oauth-state.test.mjs` — provider-neutral signed state with TTL + provider binding
- `apps/hub/lib/connection-secrets.js` + `connection-secrets.test.mjs` — AES-256-GCM seal/open for `integration_connections` tokens
- `supabase/migrations/20260911_0026_integration_connection_secrets.sql`
- `scripts/seal-connection-secrets.mjs` — one-off backfill (dry-run by default)

**Deleted**
- Telegram: `apps/engine/app/api/webhook/telegram/`, `apps/engine/lib/run.ts`, `apps/engine/lib/telegram.ts`
- Gmail/Resend/email: `apps/hub/lib/google-gmail.js`, `apps/hub/lib/repositories/gmail-intake.js`, `apps/hub/lib/email-lead-classifier.js`, `apps/hub/app/api/email/` (whole dir), `apps/hub/app/api/hub/email/`, `apps/engine/lib/email/` (whole dir), `apps/engine/app/api/email/`
- Notion: `apps/engine/lib/notion-sync.ts`
- Dead script: `scripts/fill-crm-intake.mjs`

**Edited** (listed per task)

---

## Task 1: Delete Telegram inbound + n8n fan-out

**Files:**
- Delete: `apps/engine/app/api/webhook/telegram/route.ts`, `apps/engine/lib/run.ts`, `apps/engine/lib/telegram.ts`
- Modify: `apps/engine/app/api/health/route.ts:30-35`, `apps/hub/components/hub/pages/automations.jsx:272-276,358`, `scripts/check-contracts.mjs:87-101,212-227`, `.env.example:20-22`, `apps/engine/.env.example:14-18`, `supabase/seed.sql:234-358`, `supabase/setup/03_seed_dev_workspace.sql:149-151`
- Modify (dependency cleanup): `apps/engine/package.json:18`, `apps/engine/next.config.mjs:3`

- [ ] **Step 1: Confirm nothing else imports the three files**

Run:
```bash
grep -rn "lib/run\b\|lib/telegram\|runTelegramUpdate\|forwardToN8n" apps packages scripts --include=*.ts --include=*.js --include=*.mjs --include=*.jsx | grep -v node_modules
```
Expected: only hits inside the three files being deleted.

- [ ] **Step 2: Delete the files**

```bash
git rm -r apps/engine/app/api/webhook/telegram apps/engine/lib/run.ts apps/engine/lib/telegram.ts
```

- [ ] **Step 3: Edit Engine health route**

In `apps/engine/app/api/health/route.ts` remove these three lines (line numbers approximate):
```ts
    telegramSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
```
```ts
    commands: ["/cardnews", "/status", "/ping", "/projects", "/pms", "/webhooks"],
```
```ts
      { method: "POST", path: "/api/webhook/telegram" },
```

- [ ] **Step 4: Edit Hub automations page**

In `apps/hub/components/hub/pages/automations.jsx`:
- Remove `telegram: 'engine /api/webhook/telegram',` from `ENGINE_INGEST_PATHS`.
- Replace the empty-state copy
  `'Project webhook smoke test나 Telegram webhook이 들어오면 endpoint별 활동이 집계됩니다.'`
  with `'Project webhook smoke test가 들어오면 endpoint별 활동이 집계됩니다.'`.

- [ ] **Step 5: Edit contract check**

In `scripts/check-contracts.mjs`:
- Remove `"TELEGRAM_WEBHOOK_SECRET",` from the `.env.example` key list.
- Remove `"TELEGRAM_BOT_TOKEN",`, `"TELEGRAM_WEBHOOK_SECRET",`, `"N8N_WEBHOOK_URL",` from the `apps/engine/.env.example` key list.
- Delete the whole `assert(readText("apps/engine/app/api/webhook/telegram/route.ts")...` block ("telegram webhook open mode").
- Replace the production-guard block with:
```js
const sharedWebhookText = readText("apps/engine/lib/shared-webhook.ts");
assert(
  sharedWebhookText.includes("isLocalOpenWebhookModeAllowed") &&
    sharedWebhookText.includes('process.env.NODE_ENV !== "production"') &&
    sharedWebhookText.includes('process.env.VERCEL_ENV !== "production"'),
  "webhook open mode production guard",
  "shared open mode is local-only",
);
```

- [ ] **Step 6: Edit env templates**

- `.env.example`: delete `TELEGRAM_BOT_TOKEN=`, `TELEGRAM_WEBHOOK_SECRET=`, `N8N_WEBHOOK_URL=` lines.
- `apps/engine/.env.example`: delete the same three lines and their two comment lines (`# Telegram webhook secret...`, `# Optional Telegram fan-out...`).
- Operator-local (do not commit): remove `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` from `apps/engine/.env.local`.

- [ ] **Step 7: Edit seeds**

`supabase/seed.sql`:
- Delete the `insert into automations (...) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', ... 'Telegram command intake' ...)` statement.
- Delete the `insert into automation_runs (...)` statement (both rows reference the deleted automation).
- In `insert into webhook_endpoints`, delete only the `cccccccc-cccc-cccc-cccc-ccccccccccc1` ("Telegram Bot Intake") tuple; keep `...ccc2` and `...ccc3`. Fix the trailing comma.
- In `insert into webhook_events`, delete only the tuple with `endpoint_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'` / `'telegram.cardnews'`.
- In `insert into error_logs`, delete only the `'telegram-command'` tuple.

`supabase/setup/03_seed_dev_workspace.sql`: delete the `('...', 'Telegram webhook', 'telegram', '/api/webhook/telegram', 'active')` row and fix the trailing comma on the row above. (The OpenClaw row on line 149 is removed in Task 2.)

- [ ] **Step 8: Drop the orphaned content-manager dependency from Engine**

Run:
```bash
grep -rn "@com-moon/content-manager\|content-manager" apps/engine --include=*.ts --include=*.js --include=*.mjs --include=*.json | grep -v node_modules
```
Expected: only `apps/engine/package.json` and `apps/engine/next.config.mjs`. If any other hit exists, **stop and keep the dependency**. Otherwise remove `"@com-moon/content-manager"` from `apps/engine/package.json` dependencies and from `transpilePackages` in `apps/engine/next.config.mjs`, then run `npm install` so the lockfile updates.

- [ ] **Step 9: Verify**

Run: `npm test && npm run check:contracts && npm --workspace @com-moon/engine run typecheck`
Expected: `pass 784, fail 0`; contracts all PASS; tsc clean.

- [ ] **Step 10: Commit**

```bash
git add apps/engine/app/api/health/route.ts apps/hub/components/hub/pages/automations.jsx scripts/check-contracts.mjs .env.example apps/engine/.env.example supabase/seed.sql supabase/setup/03_seed_dev_workspace.sql apps/engine/package.json apps/engine/next.config.mjs package-lock.json
git commit -m "chore(engine): remove Telegram webhook and n8n fan-out (operator decision Q2)"
```

---

## Task 2: Delete OpenClaw references

**Files:**
- Modify: `apps/hub/lib/integration-readiness.js:121,141,211-219`, `apps/hub/lib/integration-readiness.test.mjs:148-184`, `apps/hub/app/api/health/route.js:73,84`, `scripts/check-connections.mjs:8,252-300,383-427,471-473`, `scripts/connection-status.mjs`, `scripts/connection-status.test.mjs:33-66`, `apps/hub/.env.example:25-32`, `supabase/setup/03_seed_dev_workspace.sql:149`

- [ ] **Step 1: Update the readiness test first (red)**

In `apps/hub/lib/integration-readiness.test.mjs`:
- Test "probes Engine and OpenClaw health instead of trusting URL presence": rename to `"probes Engine health instead of trusting URL presence"`, remove `OPENCLAW_LOCAL_URL` from the env input, delete the `assert.deepEqual(result.openclawRelay, ...)` block.
- Test "marks an unreachable configured endpoint as degraded": remove `OPENCLAW_LOCAL_URL` input and `assert.equal(result.openclawRelay.reachable, false);`.
- Add:
```js
test("control plane readiness no longer reports an OpenClaw relay", async () => {
  const result = await readiness.resolveControlPlaneReadiness({ COM_MOON_ENGINE_URL: "" }, { timeoutMs: 200 });
  assert.equal("openclawRelay" in result, false);
});
```
Run: `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/integration-readiness.test.mjs`
Expected: the new test FAILS (`openclawRelay` still present).

- [ ] **Step 2: Edit integration-readiness.js**

- In `resolveSecretReadiness`: delete `openclawSync: String(env.OPENCLAW_SYNC_SECRET || "").trim(),` and `openclawSync: { configured: Boolean(values.openclawSync) },`.
- In `resolveControlPlaneReadiness`: change the `Promise.all` to only resolve the engine endpoint and return `{ engine }` without `openclawRelay`.

- [ ] **Step 3: Edit Hub health route**

Delete `openClawSyncSecretConfigured: secrets.openclawSync.configured,` and `openclawRelay: controlPlane.openclawRelay,`.

- [ ] **Step 4: Edit check-connections + connection-status**

`scripts/check-connections.mjs`:
- Delete `async function checkOpenClawIntegration(...)` entirely and its two call sites.
- Delete `async function checkLocalWorkspaceMcp()` (the `~/.openclaw/workspace/config/mcporter.json` probe) and its call site — it belongs to the OpenClaw workspace the operator removed.
- Remove the now-unused imports: `resolveControlPlaneReadiness` and `classifyWorkspaceGoogleMcp`.

`scripts/connection-status.mjs`: delete `export function classifyWorkspaceGoogleMcp(...)`.
`scripts/connection-status.test.mjs`: delete the `classifyWorkspaceGoogleMcp` test block (lines 33-66) and its import.

- [ ] **Step 5: Env + seed**

- `apps/hub/.env.example`: delete the `# OpenClaw sync...` comment and all seven `OPENCLAW_*` lines.
- `supabase/setup/03_seed_dev_workspace.sql`: delete the `('...', 'OpenClaw project webhook', 'openclaw', '/api/webhook/project/openclaw', 'active'),` row.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run check:contracts && node scripts/check-connections.mjs`
Expected: tests pass (count may drop by the removed `classifyWorkspaceGoogleMcp` cases, plus one new test); check-connections prints no OpenClaw rows.

```bash
git add apps/hub/lib/integration-readiness.js apps/hub/lib/integration-readiness.test.mjs apps/hub/app/api/health/route.js scripts/check-connections.mjs scripts/connection-status.mjs scripts/connection-status.test.mjs apps/hub/.env.example supabase/setup/03_seed_dev_workspace.sql
git commit -m "chore(hub): remove OpenClaw relay wiring (operator decision Q2)"
```

---

## Task 3: Delete Gmail, Resend, and the email send surface

**Files:**
- Delete: `apps/hub/lib/google-gmail.js`, `apps/hub/lib/repositories/gmail-intake.js`, `apps/hub/lib/email-lead-classifier.js`, `apps/hub/app/api/email/` (gmail/*, resend/*, send/*), `apps/hub/app/api/hub/email/`, `apps/engine/lib/email/`, `apps/engine/app/api/email/`, `scripts/fill-crm-intake.mjs`
- Modify: `apps/hub/components/hub/pages/automations.jsx:152-267`, `apps/hub/components/hub/hub-app.jsx:83,210`, `apps/hub/components/hub/hub-data.js:80`, `apps/hub/lib/sales-os/work-order-executor.js:4,74-90,137-160`, `apps/hub/lib/integration-readiness.js:6-12`, `apps/hub/lib/integration-readiness.test.mjs:41-52,64-88`, `apps/engine/app/api/health/route.ts:36`, `apps/hub/app/api/health/route.js:92-93`, `apps/hub/lib/repositories/repo-utils.js:2`, `scripts/connection-status.mjs:3`, `scripts/connection-status.test.mjs:19,26`, `package.json` (`crm:fill`), env templates

- [ ] **Step 1: Update readiness tests (red)**

In `apps/hub/lib/integration-readiness.test.mjs`:
- In "enables only explicitly registered Google OAuth providers": replace the two `result.gmail...` assertions with `assert.equal(result.gmail, undefined);`.
- In "builds provider status from the allowlist...": replace the `buildGoogleProviderStatus("gmail", ...)` deepEqual with:
```js
  assert.deepEqual(buildGoogleProviderStatus("gmail", {}, env), {
    status: "disabled",
    reason: "unknown-provider",
    callbackPath: null,
    scopes: [],
  });
```
(`env` is the object the test already defines; signature is `buildGoogleProviderStatus(provider, runtime = {}, env = process.env)`. If the actual `unknown-provider` object has extra keys, assert on `status` and `reason` only.)
Run the file. Expected: FAIL until Step 4.

- [ ] **Step 2: Delete files**

```bash
git rm apps/hub/lib/google-gmail.js apps/hub/lib/repositories/gmail-intake.js apps/hub/lib/email-lead-classifier.js scripts/fill-crm-intake.mjs
git rm -r apps/hub/app/api/email apps/hub/app/api/hub/email apps/engine/lib/email apps/engine/app/api/email
```

- [ ] **Step 3: Remove the Email automation surface**

- `automations.jsx`: delete `EMPTY_EMAIL_STATUS`, `useEmailIntegrationStatus`, `emailStatusBadge`, and the exported `EmailAutomation` component.
- `hub-app.jsx`: delete the `EmailAutomation` lazy import and the `'dashboard/automations/email'` PAGE_MAP entry.
- `hub-data.js`: delete the `{ key: 'email', label: 'Email', ... path: 'dashboard/automations/email' }` NAV_TREE child.

- [ ] **Step 4: Remove Gmail from readiness definitions**

In `apps/hub/lib/integration-readiness.js` delete the `gmail:` entry from `GOOGLE_PROVIDER_DEFINITIONS`. Keep `calendar` and `sheets`.

- [ ] **Step 5: Work-order executor**

In `apps/hub/lib/sales-os/work-order-executor.js`:
- `EXTERNAL_ACTION_KINDS = new Set(["content_handoff", "content_export"])`.
- Delete `emailPayloadFor(order)`.
- Delete the `if (order.kind === "email_send") { ... }` branch. (Note: `followup`/`followup-draft` never used it; approving those already just marks `executed`.)

- [ ] **Step 6: Health routes, comments, connection-status, package script**

- `apps/engine/app/api/health/route.ts`: remove `{ method: "POST", path: "/api/email/send" }`.
- `apps/hub/app/api/health/route.js`: remove the `/api/email/gmail/connect` and `/api/email/send` route entries.
- `apps/hub/lib/repositories/repo-utils.js:2`: drop the `gmail-intake.js` mention from the comment.
- `scripts/connection-status.mjs`: `GOOGLE_PROVIDERS` → keep only `["calendar", "Calendar"]` and `["sheets", "Sheets"]`.
- `scripts/connection-status.test.mjs`: remove the `gmail` row from the input and expected arrays of the Google OAuth summary test.
- `package.json`: delete the `"crm:fill"` script.
- `apps/hub/lib/sales-os/work-orders.test.mjs`: change fixture `kind: "email_send"` → `"content_export"` and `channel: "resend"` → `"manual"` so tests stop referencing a retired kind.

- [ ] **Step 7: Env templates**

- `.env.example`: delete `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO_ADDRESS`, `GOOGLE_REFRESH_TOKEN_BOSS`, `GMAIL_SENDER_EMAIL`.
- `apps/engine/.env.example`: delete the same six plus `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Engine no longer makes any Google OAuth call; verify with `grep -rn GOOGLE_CLIENT apps/engine --include=*.ts` → expected no hits).
- `apps/hub/.env.example`: delete `GOOGLE_REFRESH_TOKEN_BOSS`, `GMAIL_SENDER_EMAIL` and their comment; change the comment `# Do not list gmail or sheets until...` to `# Do not list sheets until its callback has been verified end to end.`
- `apps/hub/.env.local.example:51`: drop "Gmail" from the guard comment.
- Operator-local (do not commit): remove `RESEND_API_KEY`, `EMAIL_FROM_*`, `EMAIL_REPLY_TO_ADDRESS`, `GOOGLE_REFRESH_TOKEN_BOSS`, `GMAIL_SENDER_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` from `apps/engine/.env.local`; remove `GOOGLE_REFRESH_TOKEN_BOSS`, `GMAIL_SENDER_EMAIL` from `apps/hub/.env.local`.

- [ ] **Step 8: Verify**

```bash
grep -rn "gmail\|resend\|email/send\|email_send" apps packages scripts --include=*.js --include=*.jsx --include=*.ts --include=*.mjs -i | grep -v node_modules | grep -v "channels\|@slack.com"
```
Expected: no hits (the `packages/mcp-server` `"email"` channel enum and generic words may remain — inspect and confirm they are not integration code).
Run: `npm test && npm run check:contracts && npm --workspace @com-moon/engine run typecheck`
Expected: pass, fail 0.

- [ ] **Step 9: Commit**

```bash
git add -u apps/hub apps/engine scripts package.json .env.example apps/engine/.env.example apps/hub/.env.example apps/hub/.env.local.example
git status --short   # confirm only intended paths are staged; unstage anything from the memo/project WIP
git commit -m "chore: remove Gmail, Resend, and email send surfaces (operator decision Q4)"
```

---

## Task 4: Delete the Notion sync module

**Files:**
- Delete: `apps/engine/lib/notion-sync.ts`

- [ ] **Step 1: Confirm zero importers**

Run: `grep -rn "notion-sync\|syncNotionReadOnly\|getNotionIntegrationStatus" apps packages scripts | grep -v node_modules`
Expected: only the file itself.

- [ ] **Step 2: Delete, verify, commit**

```bash
git rm apps/engine/lib/notion-sync.ts
npm --workspace @com-moon/engine run typecheck && npm test
git commit -m "chore(engine): remove unwired Notion sync module (operator decision Q3)"
```

---

## Task 5: Remove dead env contract `AI_DEFAULT_PROVIDER`

**Files:**
- Modify: `apps/engine/.env.example`, `apps/hub/.env.example`, `apps/hub/.env.local.example`

- [ ] **Step 1: Confirm it is never read**

Run: `grep -rn "AI_DEFAULT_PROVIDER" apps packages scripts | grep -v node_modules | grep -v "\.env"`
Expected: no hits.

- [ ] **Step 2: Delete the `AI_DEFAULT_PROVIDER=` line from the three templates and commit**

```bash
git add apps/engine/.env.example apps/hub/.env.example apps/hub/.env.local.example
git commit -m "chore(env): drop unused AI_DEFAULT_PROVIDER from templates"
```

---

## Task 6: Threads/Instagram connect with basic scopes only

**Files:**
- Modify: `apps/hub/lib/meta-threads.js:13`, `apps/hub/lib/instagram-api.js:13-16`, `.env.example:43,47`, `apps/hub/.env.example:65,71`, `apps/hub/.env.local.example:63,69`
- Test: `apps/hub/lib/meta-scopes.test.mjs` (create)

- [ ] **Step 1: Write the failing test**

`apps/hub/lib/meta-scopes.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveInstagramApiConfig } from "./instagram-api.js";
import { resolveMetaThreadsConfig } from "./meta-threads.js";

function withEnv(patch, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(patch)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Threads default scope is basic only (publishing stays hard-gated)", () => {
  withEnv({ COM_MOON_META_THREADS_SCOPES: undefined }, () => {
    assert.deepEqual(resolveMetaThreadsConfig().scopes, ["threads_basic"]);
  });
});

test("Instagram default scope is basic only (publishing stays hard-gated)", () => {
  withEnv({ COM_MOON_INSTAGRAM_SCOPES: undefined }, () => {
    assert.deepEqual(resolveInstagramApiConfig().scopes, ["instagram_business_basic"]);
  });
});

test("scope env override still parses comma or whitespace lists", () => {
  withEnv({ COM_MOON_META_THREADS_SCOPES: "threads_basic, threads_manage_insights" }, () => {
    assert.deepEqual(resolveMetaThreadsConfig().scopes, ["threads_basic", "threads_manage_insights"]);
  });
});
```

- [ ] **Step 2: Run it (red)**

Run: `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/meta-scopes.test.mjs`
Expected: first two tests FAIL (publish scope present).

- [ ] **Step 3: Change the defaults**

`meta-threads.js`: `const DEFAULT_SCOPES = ["threads_basic"];`
`instagram-api.js`: `const DEFAULT_SCOPES = ["instagram_business_basic"];`

- [ ] **Step 4: Env templates**

Replace the scope lines in `.env.example`, `apps/hub/.env.example`, `apps/hub/.env.local.example` with:
```
# Connect-only scopes. Publishing scopes (threads_content_publish / instagram_business_content_publish)
# require the "direct publishing" hard gate in the deep-design spec §21 to be lifted first.
COM_MOON_META_THREADS_SCOPES=threads_basic
COM_MOON_INSTAGRAM_SCOPES=instagram_business_basic
```

- [ ] **Step 5: Run tests (green), commit**

Run: `npm test` → pass.
```bash
git add apps/hub/lib/meta-threads.js apps/hub/lib/instagram-api.js apps/hub/lib/meta-scopes.test.mjs .env.example apps/hub/.env.example apps/hub/.env.local.example
git commit -m "feat(social): connect Threads/Instagram with basic scopes only (operator decision Q1)"
```

- [ ] **Step 6: Operator hand-off (not code)**

The operator creates the Meta app for `moon.classin`, copies Threads App ID/Secret and Instagram App ID/Secret into `apps/hub/.env.local` (`COM_MOON_META_THREADS_APP_ID`, `COM_MOON_META_THREADS_APP_SECRET`, `COM_MOON_INSTAGRAM_APP_ID`, `COM_MOON_INSTAGRAM_APP_SECRET`), registers the redirect URIs printed by `GET /api/social/meta/threads/status` and `GET /api/social/instagram/status`, then clicks Connect on `dashboard/settings`. Record the result in the spec §2 table.

---

## Task 7: Slack failure alerts

**Files:**
- Create: `apps/engine/lib/failure-alert.ts`, `apps/engine/lib/failure-alert.test.mjs`
- Modify: `apps/engine/lib/integration-state.ts:121-146`, `apps/engine/lib/project-webhook.ts:408-422`, `apps/engine/.env.example`, `.env.example`, `scripts/check-contracts.mjs` (engine env keys)

- [ ] **Step 1: Write the failing test**

`apps/engine/lib/failure-alert.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";

let mod = null;
try {
  mod = await import("./failure-alert.ts");
} catch {
  // red phase: module missing
}

test("failure-alert module exists", () => {
  assert.ok(mod, "apps/engine/lib/failure-alert.ts must exist");
});

test("only real failures from non-slack providers page Slack, and only when Slack is configured", () => {
  const should = mod.shouldAlertSyncFailure;
  assert.equal(should({ provider: "github", status: "failure" }, true), true);
  assert.equal(should({ provider: "github", status: "success" }, true), false);
  assert.equal(should({ provider: "slack", status: "failure" }, true), false, "never recurse on slack's own run");
  assert.equal(should({ provider: "github", status: "failure" }, false), false, "preview transport is silent");
});
```
Run: `node --import ./scripts/register-hub-alias.mjs --test apps/engine/lib/failure-alert.test.mjs` → FAIL (module missing).

- [ ] **Step 2: Create the module**

`apps/engine/lib/failure-alert.ts`:
```ts
import { getSlackAlertIntegrationStatus, sendSlackFailureAlert } from "./slack-alert";

export interface FailureAlertInput {
  provider: string;
  status: string;
  errorMessage?: string | null;
  payload?: Record<string, unknown> | null;
}

export function shouldAlertSyncFailure(input: { provider: string; status: string }, slackConfigured: boolean) {
  return slackConfigured && input.status === "failure" && input.provider !== "slack";
}

// Fire-and-forget. Alerting must never break the ledger write that triggered it.
export async function notifySyncFailure(input: FailureAlertInput) {
  if (!shouldAlertSyncFailure(input, getSlackAlertIntegrationStatus().configured)) {
    return { skipped: true, reason: "not-applicable" };
  }
  try {
    await sendSlackFailureAlert({
      source: input.provider,
      severity: "error",
      message: input.errorMessage || `${input.provider} sync failed`,
      payload: input.payload ?? null,
    });
    return { skipped: false, reason: "sent" };
  } catch (error) {
    return { skipped: true, reason: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 3: Hook the sync-run ledger**

In `apps/engine/lib/integration-state.ts`, change `insertIntegrationSyncRun` to alert after the insert (dynamic import avoids the `slack-alert → integration-state` import cycle):
```ts
export async function insertIntegrationSyncRun(input: SyncRunInput) {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return { persisted: false, reason: "missing-workspace" };
  }

  const result = await insertSupabaseRecord("sync_runs", {
    workspace_id: workspaceId,
    connection_id: input.connectionId || null,
    status: input.status,
    payload: { provider: input.provider, ...(input.payload || {}) },
    error_message: input.errorMessage || null,
    started_at: new Date().toISOString(),
    finished_at: input.status === "queued" || input.status === "running" ? null : new Date().toISOString(),
  });

  if (input.status === "failure" && input.provider !== "slack") {
    void import("./failure-alert").then(({ notifySyncFailure }) =>
      notifySyncFailure({
        provider: input.provider,
        status: input.status,
        errorMessage: input.errorMessage,
        payload: input.payload,
      }),
    ).catch(() => undefined);
  }

  return result;
}
```
This covers GitHub sync failures and all three Gemini AI routes without touching them.

- [ ] **Step 4: Hook project-webhook failures**

In `apps/engine/lib/project-webhook.ts`, at the end of `failProjectWebhook`, after `await logError({...})`, add:
```ts
  void import("./failure-alert").then(({ notifySyncFailure }) =>
    notifySyncFailure({
      provider: "project-webhook",
      status: "failure",
      errorMessage: error instanceof Error ? error.message : String(error),
      payload,
    }),
  ).catch(() => undefined);
```

- [ ] **Step 5: Env contract**

Add to `apps/engine/.env.example` and `.env.example`:
```
# Slack failure alerts (Engine). Either an incoming webhook URL or bot token + channel.
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/alert/webhook
# SLACK_BOT_TOKEN=xoxb-your-bot-token
# SLACK_ALERT_CHANNEL_ID=C0123456789
```
In `scripts/check-contracts.mjs` add `"SLACK_WEBHOOK_URL"` to the `apps/engine/.env.example` key list.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run check:contracts && npm --workspace @com-moon/engine run typecheck` → pass.
```bash
git add apps/engine/lib/failure-alert.ts apps/engine/lib/failure-alert.test.mjs apps/engine/lib/integration-state.ts apps/engine/lib/project-webhook.ts apps/engine/.env.example .env.example scripts/check-contracts.mjs
git commit -m "feat(engine): page Slack on sync and webhook failures (operator decision Q3)"
```

- [ ] **Step 7: Operator hand-off**

Operator sets `SLACK_WEBHOOK_URL` in `apps/engine/.env.local`. Smoke: `POST /api/integrations/github/sync` with an invalid `GITHUB_REPOSITORIES` value produces one Slack message and one `sync_runs` row with `payload.provider = "slack"`.

---

## Task 8: Provider-neutral OAuth state with TTL

**Files:**
- Create: `apps/hub/lib/oauth-state.js`, `apps/hub/lib/oauth-state.test.mjs`
- Modify: `apps/hub/lib/google-oauth.js:31-75`, `apps/hub/lib/google-calendar.js:91-143`, `apps/hub/lib/meta-threads.js:111-181`, `apps/hub/lib/instagram-api.js:119-180`

- [ ] **Step 1: Write the failing test**

`apps/hub/lib/oauth-state.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";

import { createOAuthState, verifyOAuthState, OAUTH_STATE_TTL_MS } from "./oauth-state.js";

const secret = "test-state-secret";

test("round-trips a payload bound to its provider", () => {
  const state = createOAuthState({ provider: "google_calendar", payload: { returnPath: "/dashboard" }, secret, now: 1000 });
  const decoded = verifyOAuthState({ provider: "google_calendar", value: state, secret, now: 2000 });
  assert.equal(decoded.invalid, undefined);
  assert.equal(decoded.returnPath, "/dashboard");
  assert.equal(decoded.p, "google_calendar");
});

test("rejects a state presented to a different provider", () => {
  const state = createOAuthState({ provider: "meta_threads", payload: {}, secret, now: 1000 });
  const decoded = verifyOAuthState({ provider: "instagram_api", value: state, secret, now: 2000 });
  assert.deepEqual(decoded, { invalid: true, reason: "provider-mismatch" });
});

test("rejects an expired state", () => {
  const state = createOAuthState({ provider: "google_sheets", payload: {}, secret, now: 1000 });
  const decoded = verifyOAuthState({ provider: "google_sheets", value: state, secret, now: 1000 + OAUTH_STATE_TTL_MS + 1 });
  assert.deepEqual(decoded, { invalid: true, reason: "expired" });
});

test("rejects a tampered signature", () => {
  const state = createOAuthState({ provider: "google_sheets", payload: {}, secret, now: 1000 });
  const decoded = verifyOAuthState({ provider: "google_sheets", value: `${state}x`, secret, now: 2000 });
  assert.deepEqual(decoded, { invalid: true, reason: "bad-signature" });
});

test("empty state decodes to an empty object (callers treat it as unauthenticated)", () => {
  assert.deepEqual(verifyOAuthState({ provider: "google_sheets", value: "", secret }), {});
});
```
Run → FAIL (module missing).

- [ ] **Step 2: Create the module**

`apps/hub/lib/oauth-state.js`:
```js
// Provider-neutral signed OAuth state: HMAC-SHA256, 10-minute TTL, provider binding.
// Stateless by design — single-use (nonce) protection would need a ledger table and is out of scope.
import { createHmac, timingSafeEqual } from "crypto";

import { resolveOAuthStateSecret } from "@/lib/integration-readiness";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEquals(a, b) {
  const aBuffer = Buffer.from(String(a || ""));
  const bBuffer = Buffer.from(String(b || ""));
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function createOAuthState({ provider, payload = {}, secret = resolveOAuthStateSecret(), now = Date.now() }) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, p: provider, iat: now }), "utf8").toString("base64url");
  return secret ? `${encoded}.${sign(encoded, secret)}` : encoded;
}

export function verifyOAuthState({
  provider,
  value,
  secret = resolveOAuthStateSecret(),
  now = Date.now(),
  ttlMs = OAUTH_STATE_TTL_MS,
}) {
  if (!value) return {};

  try {
    const [encoded, signature] = String(value).split(".");
    if (!secret || !signature || !safeEquals(sign(encoded, secret), signature)) {
      return { invalid: true, reason: "bad-signature" };
    }
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.p !== provider) return { invalid: true, reason: "provider-mismatch" };
    if (typeof payload.iat !== "number" || now - payload.iat > ttlMs) return { invalid: true, reason: "expired" };
    return payload;
  } catch {
    return { invalid: true, reason: "bad-signature" };
  }
}
```
Run the test → PASS.

- [ ] **Step 3: Adopt in google-oauth.js (Sheets)**

Replace `signStatePayload`, `safeEquals`, `encodeState`, `decodeState` in `apps/hub/lib/google-oauth.js` with:
```js
import { createOAuthState, verifyOAuthState } from "@/lib/oauth-state";

export function encodeState(value, provider = "google_sheets") {
  return createOAuthState({ provider, payload: value });
}

export function decodeState(value, provider = "google_sheets") {
  return verifyOAuthState({ provider, value });
}
```
Remove the now-unused `createHmac, timingSafeEqual` import. Update the header comment (drop the `google-gmail.js` sentences).

- [ ] **Step 4: Adopt in google-calendar.js**

Delete the local `signStatePayload`, `safeEquals`, `encodeState`, and the body of `decodeGoogleCalendarState`; replace with:
```js
import { createOAuthState, verifyOAuthState } from "@/lib/oauth-state";

function encodeState(value) {
  return createOAuthState({ provider: GOOGLE_CALENDAR_PROVIDER, payload: value });
}

export function decodeGoogleCalendarState(value) {
  return verifyOAuthState({ provider: GOOGLE_CALENDAR_PROVIDER, value });
}
```
Remove unused `createHmac`/`timingSafeEqual` imports if nothing else in the file uses them.

- [ ] **Step 5: Adopt in meta-threads.js and instagram-api.js**

In each file:
- Delete the local `resolveOAuthStateSecret` (it wrongly fell back to `COM_MOON_SHARED_WEBHOOK_SECRET`), `signStatePayload`, `safeEquals`, `encodeState`, and the body of `decodeMetaThreadsState` / `decodeInstagramApiState`.
- Add `import { resolveOAuthStateSecret } from "@/lib/integration-readiness";` (used by `hasMetaThreadsOAuthStateSecret` / `hasInstagramApiOAuthStateSecret`) and:
```js
import { createOAuthState, verifyOAuthState } from "@/lib/oauth-state";

function encodeState(value) {
  return createOAuthState({ provider: META_THREADS_PROVIDER, payload: value });
}

export function decodeMetaThreadsState(value) {
  return verifyOAuthState({ provider: META_THREADS_PROVIDER, value });
}
```
(Instagram: `INSTAGRAM_API_PROVIDER`, `decodeInstagramApiState`.)
- Keep `safeBufferEquals` and `decodeBase64Url` in meta-threads.js — `parseMetaThreadsSignedRequest` still needs them.

- [ ] **Step 6: Verify and commit**

Run: `npm test` → pass. Manual: `GET /api/calendar/google/connect` still redirects; a callback with `state=` from another provider lands on `?calendar=invalid-state`.
```bash
git add apps/hub/lib/oauth-state.js apps/hub/lib/oauth-state.test.mjs apps/hub/lib/google-oauth.js apps/hub/lib/google-calendar.js apps/hub/lib/meta-threads.js apps/hub/lib/instagram-api.js
git commit -m "fix(hub): single OAuth state module with TTL and provider binding"
```

---

## Task 9: Encrypt OAuth tokens at rest

**Files:**
- Create: `apps/hub/lib/connection-secrets.js`, `apps/hub/lib/connection-secrets.test.mjs`, `supabase/migrations/20260911_0026_integration_connection_secrets.sql`, `scripts/seal-connection-secrets.mjs`
- Modify: `supabase/schema.sql:390-398`, `apps/hub/lib/google-calendar.js` (save 274-322, refresh 342-384, fetch 261-272), `apps/hub/lib/google-sheets.js` (64-74, 126-158, 220-250), `apps/hub/lib/meta-threads.js` (429-445, 473-515, 517-582), `apps/hub/lib/instagram-api.js` (362-378, 380-450), `apps/hub/app/api/health/route.js`, `apps/hub/.env.example`, `.env.example`, `apps/hub/.env.local.example`, `scripts/check-contracts.mjs`

Design: application-level AES-256-GCM with `COM_MOON_TOKEN_ENCRYPTION_KEY` (32 bytes, base64). Chosen over pgsodium/Vault because Hub talks to Postgres only through PostgREST and Vault is not exposed there; the ciphertext lives in a new `secret_config text` column, `config jsonb` keeps non-secret keys. Rows written before backfill keep working (plaintext fallback) until `scripts/seal-connection-secrets.mjs --apply` runs.

- [ ] **Step 1: Write the failing test**

`apps/hub/lib/connection-secrets.test.mjs`:
```js
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import {
  openConnectionRow,
  resolveTokenEncryptionKey,
  sealConnectionRecord,
} from "./connection-secrets.js";

const key = randomBytes(32);

test("resolveTokenEncryptionKey requires a 32-byte base64 key", () => {
  assert.equal(resolveTokenEncryptionKey({}), null);
  assert.equal(resolveTokenEncryptionKey({ COM_MOON_TOKEN_ENCRYPTION_KEY: "short" }), null);
  assert.equal(resolveTokenEncryptionKey({ COM_MOON_TOKEN_ENCRYPTION_KEY: key.toString("base64") })?.length, 32);
});

test("seal strips tokens from config and open restores them", () => {
  const record = { provider: "google_calendar", config: { calendarId: "primary", accessToken: "a1", refreshToken: "r1" } };
  const sealed = sealConnectionRecord(record, key);
  assert.deepEqual(sealed.config, { calendarId: "primary" });
  assert.match(sealed.secret_config, /^v1\./);

  const opened = openConnectionRow({ id: "x", ...sealed }, key);
  assert.deepEqual(opened.config, { calendarId: "primary", accessToken: "a1", refreshToken: "r1" });
});

test("without a key the record is left as-is (legacy plaintext, secret_config null)", () => {
  const record = { config: { accessToken: "a1" } };
  assert.deepEqual(sealConnectionRecord(record, null), { config: { accessToken: "a1" }, secret_config: null });
});

test("open leaves legacy plaintext rows untouched and flags undecryptable rows", () => {
  const legacy = { id: "l", config: { refreshToken: "r" }, secret_config: null };
  assert.deepEqual(openConnectionRow(legacy, key), legacy);

  const wrongKey = randomBytes(32);
  const sealed = sealConnectionRecord({ config: { refreshToken: "r" } }, key);
  const opened = openConnectionRow({ id: "s", ...sealed }, wrongKey);
  assert.equal(opened.secretsUnavailable, true);
  assert.equal(opened.config.refreshToken, undefined);
});
```
Run → FAIL.

- [ ] **Step 2: Create the module**

`apps/hub/lib/connection-secrets.js`:
```js
// AES-256-GCM seal/open for integration_connections tokens.
// config jsonb keeps non-secret keys; secret_config text holds "v1.<iv>.<tag>.<ciphertext>".
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const SECRET_KEYS = ["accessToken", "refreshToken"];
const VERSION = "v1";

export function resolveTokenEncryptionKey(env = process.env) {
  const raw = env.COM_MOON_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function isTokenEncryptionConfigured(env = process.env) {
  return Boolean(resolveTokenEncryptionKey(env));
}

export function encryptSecrets(secrets, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(secrets), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecrets(sealed, key) {
  const [version, iv, tag, ciphertext] = String(sealed || "").split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) return null;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

// record: { ..., config } → { ..., config (no tokens), secret_config }
export function sealConnectionRecord(record, key = resolveTokenEncryptionKey()) {
  const config = { ...(record.config || {}) };
  if (!key) return { ...record, config, secret_config: null };

  const secrets = {};
  for (const name of SECRET_KEYS) {
    if (config[name]) secrets[name] = config[name];
    delete config[name];
  }
  return {
    ...record,
    config,
    secret_config: Object.keys(secrets).length ? encryptSecrets(secrets, key) : null,
  };
}

// row from Supabase → same row with tokens merged back into config
export function openConnectionRow(row, key = resolveTokenEncryptionKey()) {
  if (!row || !row.secret_config) return row;
  if (!key) return { ...row, secretsUnavailable: true };
  try {
    const secrets = decryptSecrets(row.secret_config, key) || {};
    return { ...row, config: { ...(row.config || {}), ...secrets } };
  } catch {
    return { ...row, secretsUnavailable: true };
  }
}
```
Run the test → PASS.

- [ ] **Step 3: Migration + schema**

`supabase/migrations/20260911_0026_integration_connection_secrets.sql`:
```sql
-- Sealed OAuth tokens. See apps/hub/lib/connection-secrets.js.
alter table integration_connections
  add column if not exists secret_config text;

comment on column integration_connections.secret_config is
  'AES-256-GCM sealed accessToken/refreshToken (v1.<iv>.<tag>.<ct>). config jsonb must not hold tokens after backfill.';
```
Add the same column to the `integration_connections` definition in `supabase/schema.sql`.
Apply: `node scripts/apply-migrations.mjs supabase/migrations/20260911_0026_integration_connection_secrets.sql` (requires `SUPABASE_ACCESS_TOKEN` in `apps/hub/.env.local`; see the memory note on migrations — pass the full filename).

- [ ] **Step 4: Adopt in the four provider files**

Rule: every `insertSupabaseRecord("integration_connections", record)` / `updateSupabaseRecord("integration_connections", ..., record)` passes `sealConnectionRecord(record)`; every `fetchSupabaseRows("integration_connections", ...)` result is mapped through `openConnectionRow`. Concretely:

`google-calendar.js`
```js
import { openConnectionRow, sealConnectionRecord } from "@/lib/connection-secrets";
```
- `fetchLatestGoogleCalendarConnection`: `return openConnectionRow(rows[0] || null);` (whatever the current return expression is, wrap it).
- `saveGoogleCalendarConnection`: `const record = sealConnectionRecord({ workspace_id, provider, status, external_account_id, config, last_synced_at })`. Keep returning the plaintext `config` object to the caller.
- `refreshConnectionAccessToken`: the `updateSupabaseRecord("integration_connections", [...], { config: nextConfig, ... })` call becomes `sealConnectionRecord({ config: nextConfig, ... })`.

`google-sheets.js`
- `fetchLatestGoogleSheetsConnection`: wrap the returned row with `openConnectionRow`.
- `saveGoogleSheetsConnection`: `const record = sealConnectionRecord({...})`.
- `getValidAccessToken`: the persistence of refreshed tokens (`updateSupabaseRecord("integration_connections", ...)` around lines 232-247) passes `sealConnectionRecord({ config: { ...connection.config, accessToken, expiresAt }, ... })`.

`meta-threads.js`
- `fetchLatestMetaThreadsConnection` and `fetchMetaThreadsConnectionsByUserId`: map rows through `openConnectionRow`.
- `disableMetaThreadsConnectionsForUser`: the update record passes through `sealConnectionRecord` (it blanks `accessToken`; sealing an empty token yields `secret_config: null`, which is correct).
- `saveMetaThreadsConnection`: `const record = sealConnectionRecord({...})`.

`instagram-api.js`
- `fetchLatestInstagramApiConnection`: wrap with `openConnectionRow`.
- `saveInstagramApiConnection`: `const record = sealConnectionRecord({...})`.

Check with: `grep -n 'integration_connections' apps/hub/lib/google-calendar.js apps/hub/lib/google-sheets.js apps/hub/lib/meta-threads.js apps/hub/lib/instagram-api.js` — every hit must be a fetch (opened) or a write (sealed).

- [ ] **Step 5: Health flag + env contract**

- `apps/hub/app/api/health/route.js`: add `tokenEncryption: { configured: isTokenEncryptionConfigured() }` under `integrations` (import from `@/lib/connection-secrets`).
- Add to `apps/hub/.env.example`, `.env.example`, `apps/hub/.env.local.example`:
```
# 32-byte base64 key that seals OAuth tokens in integration_connections.secret_config.
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
COM_MOON_TOKEN_ENCRYPTION_KEY=your-32-byte-base64-key
```
- `scripts/check-contracts.mjs`: add `"COM_MOON_TOKEN_ENCRYPTION_KEY"` to the `apps/hub/.env.example` key list.

- [ ] **Step 6: Backfill script**

`scripts/seal-connection-secrets.mjs`:
```js
#!/usr/bin/env node
// Moves plaintext accessToken/refreshToken out of integration_connections.config into
// secret_config (sealed). Dry-run by default; pass --apply to write.
import { readFileSync } from "node:fs";
import path from "node:path";

import { openConnectionRow, resolveTokenEncryptionKey, sealConnectionRecord } from "../apps/hub/lib/connection-secrets.js";

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // file optional
  }
}

loadEnv(path.resolve("apps/hub/.env.local"));

const apply = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = resolveTokenEncryptionKey();

if (!url || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
if (!key) throw new Error("COM_MOON_TOKEN_ENCRYPTION_KEY missing or not 32 bytes");

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
const rows = await (await fetch(`${url}/rest/v1/integration_connections?select=id,provider,config,secret_config`, { headers })).json();

let changed = 0;
for (const row of rows) {
  const hasPlaintext = Boolean(row.config?.accessToken || row.config?.refreshToken);
  if (!hasPlaintext) continue;
  const opened = openConnectionRow(row, key);
  const sealed = sealConnectionRecord({ config: opened.config }, key);
  changed += 1;
  console.log(`${apply ? "seal" : "would seal"} ${row.provider} ${row.id}`);
  if (!apply) continue;
  const response = await fetch(`${url}/rest/v1/integration_connections?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ config: sealed.config, secret_config: sealed.secret_config }),
  });
  if (!response.ok) throw new Error(`PATCH failed for ${row.id}: ${response.status}`);
}
console.log(`${changed} row(s) ${apply ? "sealed" : "pending (dry-run)"}`);
```
Add to root `package.json` scripts: `"db:seal-secrets": "node ./scripts/seal-connection-secrets.mjs"`.

- [ ] **Step 7: Verify end to end**

1. `npm test && npm run check:contracts` → pass.
2. Operator adds `COM_MOON_TOKEN_ENCRYPTION_KEY` to `apps/hub/.env.local`, restarts hub.
3. `npm run db:seal-secrets` → prints `would seal google_calendar <id>`; then `npm run db:seal-secrets -- --apply`.
4. `GET /api/calendar/google/status` → `hasRefreshToken: true`; Calendar page still lists events (token refresh works from sealed storage).
5. Read-only check: `select config from integration_connections where provider='google_calendar'` contains no `accessToken`/`refreshToken` keys.

- [ ] **Step 8: Commit**

```bash
git add apps/hub/lib/connection-secrets.js apps/hub/lib/connection-secrets.test.mjs supabase/migrations/20260911_0026_integration_connection_secrets.sql supabase/schema.sql scripts/seal-connection-secrets.mjs package.json apps/hub/lib/google-calendar.js apps/hub/lib/google-sheets.js apps/hub/lib/meta-threads.js apps/hub/lib/instagram-api.js apps/hub/app/api/health/route.js apps/hub/.env.example .env.example apps/hub/.env.local.example scripts/check-contracts.mjs
git commit -m "feat(hub): seal OAuth tokens with AES-256-GCM in integration_connections.secret_config (operator decision Q5)"
```

---

## Task 10: Stop returning the Gemini API key from `getVisionStatus()`

**Files:**
- Modify: `apps/hub/lib/google-vision.js:10-13,22`
- Test: `apps/hub/lib/google-vision.test.mjs` (create)

- [ ] **Step 1: Failing test**

```js
import assert from "node:assert/strict";
import { test } from "node:test";

import { getVisionStatus } from "./google-vision.js";

test("vision status never serializes the API key", () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "AIza-test";
  try {
    const status = getVisionStatus();
    assert.equal(status.configured, true);
    assert.equal("apiKey" in status, false);
    assert.equal(JSON.stringify(status).includes("AIza-test"), false);
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});
```
Run → FAIL.

- [ ] **Step 2: Fix**

```js
function resolveVisionApiKey() {
  return process.env.GEMINI_API_KEY?.trim() || "";
}

export function getVisionStatus() {
  return { configured: Boolean(resolveVisionApiKey()), model: MODEL, base: BASE };
}
```
In `extractBusinessCard`, replace `const { configured, apiKey } = getVisionStatus();` with `const apiKey = resolveVisionApiKey(); const configured = Boolean(apiKey);`.

- [ ] **Step 3: Verify, commit**

`npm test` → pass.
```bash
git add apps/hub/lib/google-vision.js apps/hub/lib/google-vision.test.mjs
git commit -m "fix(hub): keep the Gemini key out of vision status"
```

---

## Task 11: Register the Moonlight MCP and rewire the commands

**Files:**
- Modify: `packages/mcp-server/src/tools.js:314-327`, `packages/mcp-server/src/tools.test.mjs`, `.mcp.json`, `.claude/settings.local.json`, `.claude/commands/morning.md`, `.claude/commands/team.md`, `.claude/commands/inbox.md`, `packages/mcp-server/README.md`
- Operator-local: `~/.codex/config.toml`

- [ ] **Step 1: Test the duplicate is gone (red)**

Add to `packages/mcp-server/src/tools.test.mjs`:
```js
test("get_content is the single Content OS read tool", () => {
  const tools = registeredTools();
  assert.equal(tools.has("get_content"), true);
  assert.equal(tools.has("get_content_queue"), false, "duplicate tool must be removed");
});
```
Also change `"get_content_queue"` → `"get_content"` in the registration list test and rename the "get_content_queue reuses the Hub content read route" test to exercise `get_content`.
Run: `node --test packages/mcp-server/src/tools.test.mjs` → FAIL.

- [ ] **Step 2: Remove `get_content_queue`**

Delete the `server.registerTool("get_content_queue", ...)` block in `tools.js`. Keep `get_content` and widen its description to: `"Read the Content OS state: publish queue, pipeline, attention items, summary, campaigns, idea queue, and cadence. Read-only."`. Update `packages/mcp-server/README.md` tool list (16 tools). Run test → PASS.

- [ ] **Step 3: Register in `.mcp.json`**

```json
{
  "mcpServers": {
    "eeoCRM": {
      "type": "sse",
      "url": "http://localhost:3010/sse"
    },
    "moonlight": {
      "command": "node",
      "args": ["packages/mcp-server/src/index.js"],
      "env": {
        "COM_MOON_HUB_URL": "http://localhost:3000",
        "COM_MOON_HUB_WRITE_SECRET": "${COM_MOON_HUB_WRITE_SECRET}"
      }
    }
  }
}
```
`${COM_MOON_HUB_WRITE_SECRET}` expands from the shell; unset → read-only tools only (server logs `writes=disabled (read-only)`). Add `"moonlight"` to `enabledMcpjsonServers` in `.claude/settings.local.json`.

- [ ] **Step 4: Register in Codex (operator-local, not committed)**

Append to `~/.codex/config.toml`:
```toml
[mcp_servers.moonlight]
command = "node"
args = ["/Users/clmagi/Desktop/Projects/moonlight_proj/packages/mcp-server/src/index.js"]

[mcp_servers.moonlight.env]
COM_MOON_HUB_URL = "http://localhost:3000"
```

- [ ] **Step 5: Rewire the commands**

Insert after the "대상 건수/기관" line in `.claude/commands/morning.md` and after the "아래를 순서대로 실행한다" line in `.claude/commands/team.md`:
```markdown
## 0. 도구 (Moonlight MCP — 등록됨)
- 기록 읽기: `get_daily_brief`(긴급 KA·정체 딜·오늘 일정), `list_work_orders`, `list_tasks`, `list_projects`, `get_revenue`, `get_content`
- 기록 쓰기(승인 큐 경유만): `create_task`, `decide_work_order`. 고객 발송·외부 실행 도구는 없다.
- `moonlight` MCP가 미연결이면 `/api/hub/*`를 직접 호출하지 말고 "도구 미연결"을 결과 맨 위에 적고 조회 단계만 수행한다.
- 자문 생성(`request_council`, `request_sales_mentor`)은 반복 판단에만 쓴다. 같은 건에 이전 `runId`가 있으면 재생성 전에 `list_agent_runs`로 먼저 읽는다.
```
In `morning.md` §1 replace `Supabase \`leads\`/\`deals\`의 최근 변경을 본다.` with `\`get_daily_brief\`의 정체 딜 신호와 \`/api/hub/sheets\` 동기화 상태를 본다.`
In `inbox.md` §1 add a bullet: `- 라우팅 결과가 태스크이면 \`create_task\`(Moonlight MCP)로 만든다. 그 외 테이블은 기존 경로 유지.`

- [ ] **Step 6: Verify and commit**

Restart Claude Code in the repo; `/mcp` shows `moonlight` connected with 16 tools; `get_daily_brief` returns the live brief.
```bash
git add packages/mcp-server/src/tools.js packages/mcp-server/src/tools.test.mjs packages/mcp-server/README.md .mcp.json .claude/settings.local.json .claude/commands/morning.md .claude/commands/team.md .claude/commands/inbox.md
git commit -m "feat(mcp): register Moonlight MCP, drop duplicate content tool, rewire daily commands"
```

---

## Task 12: Connection truth probe in `check:connections`

**Files:**
- Modify: `scripts/check-connections.mjs`, `scripts/connection-status.mjs`, `scripts/connection-status.test.mjs`

- [ ] **Step 1: Failing test for the classifier**

Add to `scripts/connection-status.test.mjs`:
```js
import { classifyConnectionTruth } from "./connection-status.mjs";

test("classifies provider status payloads into live / expired / missing / error", () => {
  const now = Date.parse("2026-09-11T00:00:00Z");
  assert.equal(classifyConnectionTruth({ connected: true, hasRefreshToken: true, expiresAt: "2026-09-11T01:00:00Z" }, now), "live");
  assert.equal(classifyConnectionTruth({ connected: true, hasRefreshToken: true, expiresAt: "2026-09-10T00:00:00Z" }, now), "live");
  assert.equal(classifyConnectionTruth({ connected: true, hasRefreshToken: false, expiresAt: "2026-09-10T00:00:00Z" }, now), "expired");
  assert.equal(classifyConnectionTruth({ connected: false }, now), "missing");
  assert.equal(classifyConnectionTruth(null, now), "error");
});
```
(Access-token expiry with a refresh token on file is still `live`; without a refresh token it is `expired`.)

- [ ] **Step 2: Implement classifier**

In `scripts/connection-status.mjs`:
```js
export function classifyConnectionTruth(status, now = Date.now()) {
  if (!status || typeof status !== "object") return "error";
  if (!status.connected) return "missing";
  const expiresAt = status.expiresAt ? Date.parse(status.expiresAt) : NaN;
  const accessFresh = Number.isFinite(expiresAt) && expiresAt > now;
  if (status.hasRefreshToken || accessFresh) return "live";
  return "expired";
}
```

- [ ] **Step 3: Probe the five status routes**

In `scripts/check-connections.mjs` add and call after the Hub health check:
```js
// Response shapes (verified 2026-09-11):
//  calendar/status  → { connected, connection: { status, expiresAt, hasRefreshToken, ... } | null }
//  hub/sheets       → { connected, source: "connection" | "env" | null | "error", ... }  (no token fields; env path has no expiry)
//  threads/status   → { status: "connected" | ..., connection: summarizeMetaThreadsConnection(row) | null }
//  instagram/status → same shape as threads
const CONNECTION_STATUS_ROUTES = [
  ["google_calendar", "/api/calendar/google/status", (body) => ({
    connected: Boolean(body?.connected),
    hasRefreshToken: Boolean(body?.connection?.hasRefreshToken),
    expiresAt: body?.connection?.expiresAt || null,
  })],
  ["google_sheets", "/api/hub/sheets", (body) => ({
    connected: Boolean(body?.connected),
    hasRefreshToken: body?.source === "connection" || body?.source === "env",
    expiresAt: null,
  })],
  ["meta_threads", "/api/social/meta/threads/status", (body) => ({
    connected: body?.status === "connected",
    hasRefreshToken: false, // Meta uses long-lived tokens; expiry is the only freshness signal
    expiresAt: body?.connection?.expiresAt || null,
  })],
  ["instagram_api", "/api/social/instagram/status", (body) => ({
    connected: body?.status === "connected",
    hasRefreshToken: false,
    expiresAt: body?.connection?.expiresAt || null,
  })],
];

async function checkConnectionTruth(hubUrl, failures) {
  for (const [provider, route, pick] of CONNECTION_STATUS_ROUTES) {
    const result = await fetchJson(`${hubUrl}${route}`);
    const truth = classifyConnectionTruth(result.ok ? pick(result.data) : null);
    const level = truth === "live" ? "PASS" : truth === "missing" ? "INFO" : "WARN";
    printResult(level, `connection ${provider}`, `${truth} via ${route}`);
    if (truth === "error") failures.push(`connection ${provider}: ${route} unreadable`);
  }
}
```
`printResult(level, label, detail)` and `fetchJson(url)` already exist in the file (lines 85 and 107). Before relying on `summarizeMetaThreadsConnection`'s field names, open `apps/hub/lib/meta-threads.js:605` and confirm it exposes `expiresAt`.

- [ ] **Step 4: Verify, commit**

`npm test` → pass; `npm run check:connections` prints four `connection <provider>` rows.
```bash
git add scripts/check-connections.mjs scripts/connection-status.mjs scripts/connection-status.test.mjs
git commit -m "feat(scripts): report live/expired/missing per OAuth connection in check:connections"
```

---

## Task 13: Docs — make the inventory tell the truth

**Files:**
- Modify: `docs/integration-inventory.md`, `docs/superpowers/specs/2026-09-11-integration-utilization-audit-and-plan.md` (§2 statuses), `docs/README.md` (§3 row), `README.md`, `packages/mcp-server/README.md`

- [ ] **Step 1: Replace the catalog in `docs/integration-inventory.md`**

Replace everything from `## 현재 코드에 이미 있는 통합 뼈대` through the end of the `### 권장 순서` table with:
```markdown
## 현재 연결 (2026-09-11 실측 기준, 4축)

| 연결 | 코드 준비 | 로컬 설정 | 라이브 검증 | 최근 사용 |
| --- | --- | --- | --- | --- |
| Supabase REST | 완결 | 있음 | `npm run check:connections` | 매일 |
| Google Calendar OAuth | 완결 (state TTL·토큰 암호화 적용) | `GOOGLE_CLIENT_*`, `COM_MOON_TOKEN_ENCRYPTION_KEY` | `/api/calendar/google/status` | 2026-09 |
| Google Sheets OAuth | 완결 | env 토큰 경로 | `/api/hub/sheets` | 2026-07 |
| Gemini (Engine AI routes) | 완결 | `GEMINI_API_KEY` | `/api/health` | 2026-07 |
| Meta Threads OAuth | 완결, basic scope | Meta 앱 ID 필요 | `/api/social/meta/threads/status` | 미연결 |
| Instagram OAuth | 완결, basic scope | Meta 앱 ID 필요 | `/api/social/instagram/status` | 미연결 |
| GitHub read sync | 완결 | `GITHUB_TOKEN` 없음 | `/api/integrations/github/sync` GET | 2026-06 |
| Slack failure alert | 완결, `sync_runs`·webhook 실패에 배선 | `SLACK_WEBHOOK_URL` | 실패 1건 유발 후 Slack 확인 | 신규 |
| Moonlight MCP (stdio, 16 tools) | 완결 | `.mcp.json` 등록 | `/mcp` | 신규 |
| eeoCRM MCP (localhost:3010) | 외부 서버 | `.mcp.json` | 서버 기동 시 | 2026-07 |
| classin-dash MCP | 외부 (별도 Supabase) | `~/.claude.json` | — | 세션별 |

## 제거된 연결 (2026-09-11 운영자 결정)

Telegram(수신·n8n), OpenClaw, Gmail(OAuth·scan·send), Resend, Engine `/api/email/send`, Notion sync.
코드·env·시드에서 제거했고 기록 행(`webhook_events` 108건, `openclaw`·`notion`·`slack` pending 행 등)은 이력으로 남긴다.
```
Delete the later per-integration sections for Telegram, OpenClaw, Gmail/Email, Resend, Notion, and update the "현재 공개된 엔진 라우트" list (remove `/api/webhook/telegram`, `/api/email/send`).

- [ ] **Step 2: Spec + index + READMEs**

- Spec §2 table: set Telegram/OpenClaw/Gmail/Resend/Notion rows to `제거(2026-09-11)`, Slack to `작동(배선)`, Moonlight MCP to `등록됨`, Threads/Instagram to `basic scope, 앱 등록 대기`.
- `docs/README.md` §3: add a row `통합 정리·활성화 (2026-09-11) | 완료 | plans/2026-09-11-integration-cleanup-and-activation.md`.
- Root `README.md`: remove Telegram mentions (2). `packages/mcp-server/README.md`: 16 tools, `.mcp.json` registration snippet.

- [ ] **Step 3: Contracts and commit**

`npm run check:contracts` → PASS (it scans master docs for retired premises; none of the edited text should trip it).
```bash
git add docs/integration-inventory.md docs/superpowers/specs/2026-09-11-integration-utilization-audit-and-plan.md docs/README.md README.md packages/mcp-server/README.md
git commit -m "docs: integration inventory reflects 2026-09-11 cleanup and activation"
```

---

## Final verification

- [ ] `npm test` → `fail 0` (expected count ≈ 784 − removed OpenClaw MCP classifier cases + new tests from Tasks 2, 6, 7, 8, 9, 10, 11, 12).
- [ ] `npm run check:contracts` → all PASS.
- [ ] `npm --workspace @com-moon/engine run typecheck` → clean.
- [ ] `npm run build` → hub and engine build.
- [ ] `npm run check:connections` → Supabase PASS, Gemini PASS, four `connection <provider>` rows, no Telegram/OpenClaw/Gmail rows.
- [ ] Live: Calendar page lists events after token sealing; `/mcp` shows `moonlight`; one forced GitHub sync failure reaches Slack.
- [ ] Do not push. Merge into local `main` only after the operator reviews (memory: local merge, no auto-push).

## Not in this plan (deliberately)

- C4 (자문→실행 루프 실측) is operational work, not code.
- Nonce single-use OAuth state needs a ledger table; TTL + provider binding ships now.
- A refresh-attempt probe per provider (spec C1 wording) is deferred; Task 12 classifies from status payloads.
- Publishing scopes for Threads/Instagram stay behind the deep-design §21 hard gate.
