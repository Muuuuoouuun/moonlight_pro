# Business Card Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload a business-card photo and have it auto-extracted (Gemini vision) and added to the leads list (company + contact + lead) with dedup, no typing.

**Architecture:** Hub-native. New `lib/google-vision.js` (Gemini multimodal, raw fetch) extracts fields; `lib/repositories/card-intake.js` normalizes (reusing `sheets-normalize`) and decides disposition; `/api/hub/cards` orchestrates → writes `lead_intake_raw` (source `business_card`) → reuses `promoteStagedLeads` (extended for contacts) to create/link companies+contacts+leads with match-key dedup. Leads page gets a "명함 추가" upload surface.

**Tech Stack:** Next.js (Hub, JS/JSX), Supabase REST, Gemini `generativelanguage` v1beta (raw fetch), node self-test scripts (no unit-test framework in repo).

**Testing reality:** No jest/vitest. Pure logic (`card-intake.js`) is tested via `scripts/check-card-intake.mjs` (`npm run check:cards`), mirroring `check-sheets-normalize.mjs`. Vision helper / API route / UI are verified via `npm run build` + preview.

---

### Task 1: Migration — allow `business_card` source

**Files:**
- Create: `supabase/migrations/20260618_0008_business_card_source.sql`
- Modify: `supabase/schema.sql` (lead_intake_raw source check — sync)

- [ ] **Step 1: Write the migration**

```sql
-- Allow business-card intake as a lead_intake_raw source (Sales OS).
-- Additive: widens the source check constraint. Safe after 0005.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.lead_intake_raw'::regclass
     and pg_get_constraintdef(oid) like '%source%';
  if c is not null then execute format('alter table public.lead_intake_raw drop constraint %I', c); end if;
end $$;

alter table public.lead_intake_raw
  add constraint lead_intake_raw_source_check
  check (source in ('google_sheets', 'csv', 'manual', 'naver', 'business_card'));
```

- [ ] **Step 2: Sync schema.sql** — find the `lead_intake_raw` source check (it lives in migration 0005; if schema.sql does not define `lead_intake_raw`, skip — 0005 tables aren't in schema.sql per repo precedent). Verify with `grep -n "lead_intake_raw" supabase/schema.sql`. If absent, no schema.sql change.

- [ ] **Step 3: Verify contracts**

Run: `npm run check:contracts`
Expected: `[PASS] Contract checks passed`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618_0008_business_card_source.sql supabase/schema.sql
git commit -m "feat(db): allow business_card source in lead_intake_raw (migration 0008)"
```

---

### Task 2: `card-intake.js` pure logic + self-test (TDD)

Pure, testable: takes Gemini's extracted fields → normalized intake record + disposition (promote/review/rejected) + match_key. Reuses `sheets-normalize`.

**Files:**
- Create: `apps/hub/lib/repositories/card-intake.js`
- Create: `scripts/check-card-intake.mjs`
- Modify: `package.json` (add `check:cards` script)

- [ ] **Step 1: Write the failing self-test** (`scripts/check-card-intake.mjs`, mirror `check-sheets-normalize.mjs` structure: import, run cases, print PASS/FAIL, exit 1 on fail)

```js
import { buildCardIntake } from "../apps/hub/lib/card-intake-core.js";

let failed = 0;
const ok = (name, cond) => { console.log(`[${cond ? "PASS" : "FAIL"}] ${name}`); if (!cond) failed++; };

// full card -> promoted, phone match_key
const a = buildCardIntake({ name: "김원장", company: "클래스인학원", phone: "010-1234-5678", email: "k@a.com", title: "원장", address: "서울" });
ok("full card disposition=promote", a.disposition === "promote");
ok("phone normalized in match_key", a.matchKey === "phone:01012345678");
ok("normalized.contact_name", a.normalized.contact_name === "김원장");
ok("normalized.name=company", a.normalized.name === "클래스인학원");
ok("normalized.email", a.normalized.email === "k@a.com");
ok("normalized.title", a.normalized.title === "원장");

// 2 of {name,company,phone} -> promote (email/title optional)
const b = buildCardIntake({ name: "이실장", company: "햇살학원", phone: null, email: null, title: null, address: null });
ok("name+company (2 fields) disposition=promote", b.disposition === "promote");
ok("no phone -> name+address match_key or name", b.matchKey?.startsWith("name:"));

// only 1 field -> review
const c = buildCardIntake({ name: "박대표", company: null, phone: null, email: null, title: null, address: null });
ok("single field disposition=review", c.disposition === "review");

// no name & no phone -> rejected
const d = buildCardIntake({ name: null, company: "어딘가", phone: null, email: "x@y.com", title: null, address: null });
ok("no name/phone disposition=rejected", d.disposition === "rejected");

// unknown/garbage strings trimmed to null
const e = buildCardIntake({ name: "  ", company: "클래스인", phone: "02-555-1212", email: null, title: null, address: "강남" });
ok("blank name trimmed", e.normalized.contact_name === null);
ok("landline phone normalized", e.normalized.phone === "025551212");

console.log(`\n[${failed ? "FAIL" : "PASS"}] card-intake: ${failed ? failed + " failed" : "all checks passed"}`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Add `check:cards` to package.json scripts** (next to `check:sheets`)

```json
"check:cards": "node ./scripts/check-card-intake.mjs",
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run check:cards`
Expected: FAIL — `Cannot find module '.../card-intake-core.js'`

- [ ] **Step 4: Implement `apps/hub/lib/card-intake-core.js`** (pure core, no Supabase import — so the node script and the Next route both import it; `card-intake.js` repository wraps it with DB writes).

```js
// Pure business-card → intake normalization + disposition. No I/O.
import { normalizePhone, computeMatchKey } from "@/lib/sheets-normalize";

function clean(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }

// Disposition: promote if >=2 of {name(company), company, phone}; reject if no name & no phone; else review.
export function buildCardIntake(extracted = {}) {
  const name = clean(extracted.company);          // intake.name = institution
  const contact = clean(extracted.name);          // person
  const phone = normalizePhone(extracted.phone);
  const email = clean(extracted.email);
  const title = clean(extracted.title);
  const address = clean(extracted.address);

  const normalized = {
    name, contact_name: contact, phone, email, title, address,
    status: "new", source: "business_card",
  };
  const matchKey = computeMatchKey({ phone: extracted.phone, name, address });

  const present = [name, contact, phone].filter(Boolean).length;
  let disposition;
  if (!contact && !phone) disposition = "rejected";        // can't identify a person/number
  else if (present >= 2) disposition = "promote";
  else disposition = "review";

  return { normalized, matchKey, disposition };
}
```

  Note: `@/lib/sheets-normalize` must export `normalizePhone` and `computeMatchKey` (verify with `grep -n "export" apps/hub/lib/sheets-normalize.js`). The node script imports via relative path `../apps/hub/lib/card-intake-core.js`; since that file uses the `@/` alias, the node self-test cannot resolve `@/`. **Resolution:** the node script imports `sheets-normalize` helpers are pure — to keep the self-test runnable, `card-intake-core.js` imports from a relative path `./sheets-normalize.js` (same dir) instead of `@/lib/...`. Update the import to `import { normalizePhone, computeMatchKey } from "./sheets-normalize.js";`.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run check:cards`
Expected: PASS — all checks pass.

- [ ] **Step 6: Create `apps/hub/lib/repositories/card-intake.js`** (DB wrapper around the core — insert staging row, return ids). Uses `@/lib/server-write`.

```js
import { randomUUID } from "crypto";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { buildCardIntake } from "@/lib/card-intake-core";

export function buildCardIntakeRecord(extracted = {}, { imageRef = null } = {}) {
  const workspaceId = resolveDefaultWorkspaceId();
  const { normalized, matchKey, disposition } = buildCardIntake(extracted);
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    workspace_id: workspaceId || null,
    source: "business_card",
    source_ref: `card:${now}`,
    raw: { extracted, image_ref: imageRef },
    normalized,
    match_key: matchKey,
    status: disposition === "promote" ? "pending" : disposition === "review" ? "review" : "ignored",
    note: disposition === "rejected" ? "식별 불가 (이름·전화 없음)" : null,
    created_at: now,
  };
  return { workspaceId, record, disposition, matchKey, normalized };
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/hub/lib/card-intake-core.js apps/hub/lib/repositories/card-intake.js scripts/check-card-intake.mjs package.json
git commit -m "feat(hub): business-card intake normalization + disposition (check:cards)"
```

---

### Task 3: `google-vision.js` — Gemini vision extraction

**Files:**
- Create: `apps/hub/lib/google-vision.js`

- [ ] **Step 1: Read the existing Gemini helper** for env + endpoint shape: `cat apps/engine/lib/gemini.ts` (note `GEMINI_API_KEY`, `GEMINI_MODEL`, base `https://generativelanguage.googleapis.com/v1beta`, `:generateContent`).

- [ ] **Step 2: Implement `extractBusinessCard`** (raw fetch, `inlineData` image part + strict JSON prompt; unknown fields null).

```js
// Gemini vision: business card image -> structured fields. Raw fetch, no SDK.
const BASE = (process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

const PROMPT = `이 명함 이미지에서 아래 필드를 추출해 JSON만 출력해. 불확실하면 null. 추측 금지.
{"name": 사람 이름, "company": 회사/학원/기관명, "phone": 전화번호, "email": 이메일, "title": 직책, "address": 주소}`;

export function getVisionStatus() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";
  return { configured: Boolean(apiKey), apiKey, model: MODEL, base: BASE };
}

export async function extractBusinessCard(imageBase64, mimeType = "image/jpeg") {
  const { configured, apiKey } = getVisionStatus();
  if (!configured) return { ok: false, error: "GEMINI_API_KEY not configured", fields: null };

  let response;
  try {
    response = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType, data: imageBase64 } }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });
  } catch (e) {
    return { ok: false, error: `vision request failed: ${e instanceof Error ? e.message : e}`, fields: null };
  }
  if (!response.ok) return { ok: false, error: `vision HTTP ${response.status}`, fields: null };

  const data = await response.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { ok: false, error: "empty vision response", fields: null };

  let fields;
  try { fields = JSON.parse(text); } catch { return { ok: false, error: "vision JSON parse failed", fields: null, raw: text }; }
  return { ok: true, fields, model: MODEL };
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: `Tasks: 2 successful` (hub compiles the new module on import in Task 5; standalone it just needs valid syntax — confirmed by Task 5 build).

- [ ] **Step 4: Commit**

```bash
git add apps/hub/lib/google-vision.js
git commit -m "feat(hub): Gemini vision business-card extraction helper"
```

---

### Task 4: Extend promote to create contacts

`promoteStagedLeads` in `sheets-sync.js` creates companies + leads. Business cards carry a person (title/email) → also create/link a `contact` and set `leads.contact_id`.

**Files:**
- Modify: `apps/hub/lib/repositories/sheets-sync.js` (promote path)

- [ ] **Step 1: Read the promote function** `sed -n '209,300p' apps/hub/lib/repositories/sheets-sync.js` to see `promoteStagedLeads` exact shape (company create/link, lead insert, the `insertReturning` helper, the `now` var, the `normalized` fields available).

- [ ] **Step 2: Add contact create/link inside the per-row promote**, after the company is resolved and before the lead insert. Use `normalized.contact_name`/`email`/`title`:

```js
// after companyId resolved, before lead insert:
let contactId = null;
const contactName = normalized.contact_name;
if (contactName) {
  const existingContact = await fetchSupabaseRows("contacts", {
    limit: 1,
    filters: withWorkspaceFilter([["company_id", eqFilter(companyId)], ["name", eqFilter(contactName)]]),
  });
  if (Array.isArray(existingContact) && existingContact[0]) {
    contactId = existingContact[0].id;
  } else {
    const createdContact = await insertReturning("contacts", {
      workspace_id: workspaceId, company_id: companyId,
      name: contactName, email: normalized.email || null, title: normalized.title || null,
    });
    contactId = createdContact?.id || null;
  }
}
// include contact_id in the lead insert payload:
//   contact_id: contactId,
```

  (Exact variable names — `companyId`, `workspaceId`, `normalized`, `insertReturning`, `fetchSupabaseRows`, `withWorkspaceFilter`, `eqFilter` — confirm against the file in Step 1; adapt if different. Add the `contact_id: contactId` field to the existing `insertReturning("leads", {...})` payload.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `Tasks: 2 successful`.

- [ ] **Step 4: Commit**

```bash
git add apps/hub/lib/repositories/sheets-sync.js
git commit -m "feat(hub): promote staged leads also creates/links contacts"
```

---

### Task 5: `/api/hub/cards` route

**Files:**
- Create: `apps/hub/app/api/hub/cards/route.js`

- [ ] **Step 1: Read the content route** for the guard/pattern: `sed -n '1,60p' apps/hub/app/api/hub/content/route.js` (note `assertHubWriteAllowed`, `readHubWriteJson`, `insertSupabaseRecord`, runtime/dynamic exports).

- [ ] **Step 2: Implement POST** — accept `{ imageBase64, mimeType }` → extract → buildCardIntakeRecord → insert staging → if disposition `promote`, call the promote path for this one row → return result.

```js
import { NextResponse } from "next/server";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { insertSupabaseRecord } from "@/lib/server-write";
import { extractBusinessCard } from "@/lib/google-vision";
import { buildCardIntakeRecord } from "@/lib/repositories/card-intake";
import { promoteStagedLeads } from "@/lib/repositories/sheets-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req, { maxBytes: 8 * 1024 * 1024 }); // 8MB for base64 image
  if (parsed.error) return parsed.error;

  const { imageBase64, mimeType } = parsed.data || {};
  if (!imageBase64) {
    return NextResponse.json({ status: "error", error: "imageBase64 is required" }, { status: 400 });
  }

  const vision = await extractBusinessCard(imageBase64, mimeType);
  if (!vision.ok) {
    return NextResponse.json({ status: "error", error: vision.error }, { status: 502 });
  }

  const { workspaceId, record, disposition } = buildCardIntakeRecord(vision.fields);
  if (!workspaceId) {
    return NextResponse.json({ status: "preview", disposition, fields: vision.fields }, { status: 200 });
  }

  await insertSupabaseRecord("lead_intake_raw", record);

  if (disposition !== "promote") {
    return NextResponse.json({ status: disposition, fields: vision.fields, intakeId: record.id }, { status: 200 });
  }

  const result = await promoteStagedLeads({ workspaceId, intakeIds: [record.id] }).catch((e) => ({ error: String(e) }));
  return NextResponse.json({ status: "promoted", fields: vision.fields, intakeId: record.id, promote: result }, { status: 200 });
}
```

  Note: confirm `promoteStagedLeads` signature in Task 4 Step 1 — if it does not accept an `intakeIds` filter, add an optional `{ intakeIds }` param that scopes the staged-rows query to those ids (it currently promotes all `pending`; a single-row scope keeps the card flow immediate). Adapt the call accordingly.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `Tasks: 2 successful` (compiles google-vision, card-intake, the route).

- [ ] **Step 4: Commit**

```bash
git add apps/hub/app/api/hub/cards/route.js apps/hub/lib/repositories/sheets-sync.js
git commit -m "feat(hub): /api/hub/cards — vision extract -> staging -> promote"
```

---

### Task 6: Leads UI — "명함 추가" upload

**Files:**
- Modify: the Leads page component (find: `grep -rn "export function Leads" apps/hub/components/hub/pages/`)

- [ ] **Step 1: Locate Leads** and read its header/toolbar area to place a primary "명함 추가" button matching existing button patterns.

- [ ] **Step 2: Add a card-upload control** — a `<input type="file" accept="image/*" capture="environment">` (hidden, triggered by the button), read file → base64 → POST `/api/hub/cards` → show status (extracting / 추가됨 / 확인 필요 / 식별 불가). Use `hub-primitives` (Button, Badge, Card) and tokens only. Minimal inline state (no new lib). On `promoted`, show the new lead summary + refresh the leads list (re-fetch or optimistic).

```jsx
// sketch — adapt to the Leads component's existing data hook/layout:
const [cardState, setCardState] = React.useState(null); // null | 'reading' | result
const fileRef = React.useRef(null);
async function onCardFile(e) {
  const file = e.target.files?.[0]; if (!file) return;
  setCardState({ phase: "reading" });
  const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  const [, mime] = /data:(.*?);base64,/.exec(dataUrl) || [];
  const imageBase64 = String(dataUrl).split(",")[1];
  try {
    const resp = await fetch("/api/hub/cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageBase64, mimeType: mime || "image/jpeg" }) });
    const data = await resp.json().catch(() => ({}));
    setCardState({ phase: "done", status: data.status, fields: data.fields, error: data.error });
  } catch (err) { setCardState({ phase: "done", status: "error", error: String(err) }); }
  e.target.value = "";
}
// button: <Button variant="primary" icon="plus" onClick={() => fileRef.current?.click()}>명함 추가</Button>
// hidden: <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onCardFile} />
// status chip: tone success(promoted)/warning(review)/danger(rejected|error), show fields.company · fields.name · fields.phone
```

- [ ] **Step 3: Verify build + preview**

Run: `npm run build` → `Tasks: 2 successful`.
Then preview: start `hub-dev`, open `/dashboard/revenue/leads`, confirm the "명함 추가" button renders, console error-free. (Full upload needs a real image + live Gemini; verify the control renders and posts.)

- [ ] **Step 4: Commit**

```bash
git add apps/hub/components/hub/pages/<leads-file>
git commit -m "feat(hub): 명함 추가 upload control on Leads"
```

---

### Task 7: Final verify + merge

- [ ] **Step 1:** `npm run typecheck && npm run check:contracts && npm run check:cards && npm run build` — all pass.
- [ ] **Step 2:** Preview sanity: Leads renders the button, no console errors.
- [ ] **Step 3:** Local fast-forward merge to `main` (no push, per user preference): `git checkout main && git merge --ff-only codex/moonlight-p0-hardening && git checkout codex/moonlight-p0-hardening`.
- [ ] **Step 4:** Note: migration 0008 is file-only; apply to live DB with `npm run db:migrate` after user approval.

---

## Notes / risks

- **`promoteStagedLeads` scoping:** it currently promotes all `pending` rows. The card flow inserts one row then promotes; scoping by `intakeIds` (Task 5 note) avoids promoting unrelated pending rows. If scoping is non-trivial, fall back to: insert with `status='pending'`, call promote (promotes this + any other pending — acceptable since pending should be transient), or set the row and promote inline in the route.
- **`card-intake-core.js` import path:** uses relative `./sheets-normalize.js` (not `@/`) so the node self-test resolves. The repository wrapper uses `@/`.
- **No image storage in v1** — `raw.image_ref` is a placeholder (null); Supabase Storage upload is vNext.
- **Live Gemini cost** — each card = 1 vision call (`gemini-3-flash-preview`, cheap). No batching in v1.
