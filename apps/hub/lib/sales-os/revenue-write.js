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

// Canonical deal stage keys (must stay in lockstep with lib/deal-stages.js DEAL_STAGES).
const DEAL_STAGE_KEYS = new Set(["potential", "contact", "consult", "quote", "final", "closing", "lost"]);

// Display key → coarse DB `deals.stage` column value. The live CHECK only allows
// prospect/proposal/negotiation/won/lost, so the fine-grained display stage persists in
// `meta.stage_detail` (buildDealWrite below) and the column keeps a proven-coarse bucket:
// the three pre-quote stages all collapse to 'prospect'. Read side prefers meta.stage_detail
// (resolveDealStage in revenue-ledger.js), so granularity survives the round-trip today and
// the column stays valid for any external consumer. Widening the CHECK (and a dedicated
// "데모" stage) still needs a migration against the real constraint.
const STAGE_KEY_TO_DB = {
  potential: "prospect",
  contact: "prospect",
  consult: "prospect",
  quote: "proposal",
  final: "negotiation",
  closing: "won",
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
    // Fine-grained stage — the CHECK-constrained column above only keeps a coarse bucket.
    metaPatch.stage_detail = String(payload.stage);
  }
  if (payload.value != null) {
    columns.amount = parseMoneyLabel(payload.value);
  }

  const type = normalizeType(payload.type);
  if (type) metaPatch.account_kind = type;
  if (payload.workspace) metaPatch.workspace = payload.workspace;

  return { columns, metaPatch };
}

// Reverse of the followups quick-log mini-form → a leads/deals patch. Both tables already
// have a `next_action` text column and a `meta jsonb` column, so one build function serves
// either table (the caller picks `table`). `dormant: true` (기약 없음) clears any scheduled
// date and stamps when it went dormant; `dormant: false` with `at` sets the next contact date
// and clears a prior dormant stamp. Omitting both leaves meta untouched (defensive — the UI
// requires picking one, per operator-workflow-profile.md §7 권장: 다음 행동과 날짜를 비워두지 않는다).
export function buildFollowupWrite(payload = {}) {
  const columns = {};
  const metaPatch = {};

  if (typeof payload.text === "string") {
    columns.next_action = payload.text.trim() || null;
  }

  if (payload.dormant === true) {
    metaPatch.dormant = true;
    metaPatch.dormant_since = new Date().toISOString();
    metaPatch.next_action_at = null;
  } else if (payload.at != null) {
    metaPatch.dormant = false;
    metaPatch.dormant_since = null;
    metaPatch.next_action_at = String(payload.at);
  }

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
