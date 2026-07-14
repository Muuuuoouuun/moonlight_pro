// Inverse mappers + persistence for the Leads/Deals/Cases/Accounts detail drawer.
//
// The Hub Revenue surface edits a *denormalized display model* (stage as a Korean-facing
// label, value as a "₩1.2M" string, type as personal/company). Persisting an edit means
// reversing that projection back onto the Supabase `leads` / `deals` / `operation_cases` /
// `customer_accounts` rows. Fields that the display model can't faithfully reverse (owner_id,
// expected_close_at from a free-text close label) are intentionally left untouched —
// best-effort, never clobbered.

import { eqFilter, fetchSupabaseRows } from "../server-read.js";
import {
  deleteSupabaseRecord,
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  updateSupabaseRecord,
} from "../server-write.js";

// Display stage label (mapLead in revenue-ledger) → DB `leads.status`.
const LEAD_STATUS_BY_STAGE = {
  New: "new",
  Contact: "nurturing",
  Qualified: "qualified",
  Customer: "won",
  Lost: "lost",
};

// Canonical deal stage keys (mapDeal normalizes DB aliases down to these).
const DEAL_STAGE_KEYS = new Set(["lead", "qual", "prop", "neg", "won", "lost"]);

// Reverse of mapDeal's normalization: display key → DB `deals.stage` value. Writing the raw
// display key (lead/qual/prop/neg) would fail the CHECK constraint and silently downgrade to
// preview, so we map to canonical DB stage values that round-trip back through the read-side
// STAGE_ALIASES.
//
// NOTE (schema fork): this branch's `deals.stage` CHECK allows only
// prospect/proposal/negotiation/won/lost — it does NOT yet include 'qualified' (the CHECK
// widening lives in a later migration that has not landed here). So the `qual` display stage
// maps to 'qualified' but will be *rejected* by the live CHECK and surface as `preview` (the
// optimistic local card stands, the drawer footer says preview). Every other stage persists.
// Keeping the forward-compatible value here means qual round-trips automatically once the
// stage-CHECK migration is applied — no code change needed then.
const STAGE_KEY_TO_DB = {
  lead: "prospect",
  qual: "qualified",
  prop: "proposal",
  neg: "negotiation",
  won: "won",
  lost: "lost",
};

// "₩1.2M" / "₩900K" / "₩0" / "—" / 1200000 → number. Tolerates raw numbers and commas.
export function parseMoneyLabel(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : 0;
  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return 0;
  const cleaned = raw.replace(/[₩,\s]/g, "");
  const match = /^(-?\d*\.?\d+)([mMkK]?)$/.exec(cleaned);
  if (!match) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  let n = Number(match[1]);
  if (!Number.isFinite(n)) return 0;
  const unit = match[2].toLowerCase();
  if (unit === "m") n *= 1_000_000;
  else if (unit === "k") n *= 1_000;
  return Math.round(n);
}

function normalizeType(value) {
  return value === "personal" || value === "company" ? value : null;
}

// Returns { columns, metaPatch } — top-level columns to PATCH/INSERT, and a *partial* meta
// patch that the route merges into the existing jsonb so intake provenance survives.
export function buildLeadWrite(payload = {}) {
  const columns = {};
  const metaPatch = {};

  if (typeof payload.name === "string" && payload.name.trim()) {
    columns.name = payload.name.trim();
  }
  if (payload.source != null) {
    columns.source = String(payload.source).trim() || null;
  }
  const status = LEAD_STATUS_BY_STAGE[String(payload.stage)];
  if (status) {
    columns.status = status;
  }

  const type = normalizeType(payload.type);
  if (type) metaPatch.account_kind = type;
  if (payload.value != null) metaPatch.value = parseMoneyLabel(payload.value);
  if (payload.workspace) metaPatch.workspace = payload.workspace;

  // Lightweight lead tags — 지역·규모·현재 상황·도입 댓수. Live in meta so no schema churn;
  // 유입경로 stays on the `source` column above. `undefined` means "untouched" (skip); an
  // explicit "" clears the tag. units is a positive integer or null.
  if (payload.region !== undefined) metaPatch.region = String(payload.region).trim() || null;
  if (payload.scale !== undefined) metaPatch.scale = String(payload.scale).trim() || null;
  if (payload.situation !== undefined) metaPatch.situation = String(payload.situation).trim() || null;
  if (payload.units !== undefined) {
    const n = Number(payload.units);
    metaPatch.units = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  return { columns, metaPatch };
}

export function buildDealWrite(payload = {}) {
  const columns = {};
  const metaPatch = {};

  if (typeof payload.name === "string" && payload.name.trim()) {
    columns.title = payload.name.trim();
  }
  if (DEAL_STAGE_KEYS.has(String(payload.stage))) {
    columns.stage = STAGE_KEY_TO_DB[String(payload.stage)];
  }
  if (payload.value != null) {
    columns.amount = parseMoneyLabel(payload.value);
  }

  const type = normalizeType(payload.type);
  if (type) metaPatch.account_kind = type;
  if (payload.workspace) metaPatch.workspace = payload.workspace;

  return { columns, metaPatch };
}

// Display status label (mapCase) → DB `operation_cases.status`.
const CASE_STATUS_BY_LABEL = {
  Open: "active",
  Waiting: "waiting",
  Resolved: "closed",
};

// Display priority (mapCase collapses critical→high, medium→med) → DB `operation_cases.priority`.
const CASE_PRIORITY_BY_LABEL = {
  high: "high",
  med: "medium",
  low: "low",
};

export function buildCaseWrite(payload = {}) {
  const columns = {};
  const metaPatch = {};

  if (typeof payload.title === "string" && payload.title.trim()) {
    columns.title = payload.title.trim();
  }
  const status = CASE_STATUS_BY_LABEL[String(payload.status)];
  if (status) columns.status = status;
  const priority = CASE_PRIORITY_BY_LABEL[String(payload.priority)];
  if (priority) columns.priority = priority;

  const type = normalizeType(payload.type);
  if (type) metaPatch.account_kind = type;
  // Account is a free-text label here (no reliable reverse to customer_account_id), so it
  // lives in meta as a hint until a CRM link is established.
  if (payload.account != null) metaPatch.account_label = String(payload.account).trim() || null;
  if (payload.workspace) metaPatch.workspace = payload.workspace;

  return { columns, metaPatch };
}

// Account health is a coarse band (ok/warning/risk). The DB stores a 0–100 health_score;
// reverse to a representative midpoint so the band round-trips through resolveHealth().
const ACCOUNT_SCORE_BY_HEALTH = { ok: 80, warning: 55, risk: 20 };

export function buildAccountWrite(payload = {}) {
  const columns = {};
  const metaPatch = {};

  if (typeof payload.name === "string" && payload.name.trim()) {
    columns.name = payload.name.trim();
  }
  if (payload.health && ACCOUNT_SCORE_BY_HEALTH[payload.health] != null) {
    columns.health_score = ACCOUNT_SCORE_BY_HEALTH[payload.health];
  }

  const type = normalizeType(payload.type);
  if (type) metaPatch.account_kind = type;
  if (payload.note != null) metaPatch.note = String(payload.note).trim() || null;
  if (payload.workspace) metaPatch.workspace = payload.workspace;

  return { columns, metaPatch };
}

async function readExistingMeta(table, id, workspaceId) {
  const rows = await fetchSupabaseRows(table, {
    select: "meta",
    filters: [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    limit: 1,
  });
  const meta = Array.isArray(rows) && rows[0] ? rows[0].meta : null;
  return meta && typeof meta === "object" ? meta : {};
}

// Shared insert/update/delete path for the lead/deal/case/account routes. Returns a small
// status envelope: `saved` (persisted), `preview` (config/workspace missing or PostgREST
// refused — caller keeps its optimistic local row), `noop` (nothing to change), or `error`.
export async function persistRevenueRecord({ table, op, id, payload, build }) {
  const workspaceId = resolveDefaultWorkspaceId();

  if (op === "delete") {
    if (!id) return { status: "error", reason: "missing-id" };
    if (!workspaceId) return { status: "preview", reason: "missing-workspace" };
    const res = await deleteSupabaseRecord(table, [
      ["id", eqFilter(id)],
      ["workspace_id", eqFilter(workspaceId)],
    ]);
    return res.persisted ? { status: "saved", id } : { status: "preview", reason: res.reason, detail: res.detail };
  }

  const { columns, metaPatch } = build(payload);
  const hasMeta = Object.keys(metaPatch).length > 0;

  if (op === "create") {
    if (!workspaceId) return { status: "preview", reason: "missing-workspace" };
    const record = {
      ...columns,
      workspace_id: workspaceId,
      ...(hasMeta ? { meta: metaPatch } : {}),
    };
    const res = await insertSupabaseRecord(table, record, { returnRepresentation: true, select: "*" });
    return res.persisted
      ? { status: "saved", id: res.id, record: res.record }
      : { status: "preview", reason: res.reason, detail: res.detail };
  }

  if (!id) return { status: "error", reason: "missing-id" };
  if (!workspaceId) return { status: "preview", reason: "missing-workspace" };

  // Merge meta against the live row so we never drop sibling keys (brand, lane, campaign…).
  const mergedMeta = hasMeta ? { ...(await readExistingMeta(table, id, workspaceId)), ...metaPatch } : null;
  const patch = { ...columns, ...(mergedMeta ? { meta: mergedMeta } : {}) };
  if (!Object.keys(patch).length) return { status: "noop" };

  const res = await updateSupabaseRecord(
    table,
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    patch,
    { returnRepresentation: true, select: "*" },
  );
  return res.persisted
    ? { status: "saved", id, record: res.record }
    : { status: "preview", reason: res.reason, detail: res.detail };
}
