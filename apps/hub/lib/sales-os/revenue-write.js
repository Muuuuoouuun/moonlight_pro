// Inverse mappers + persistence for the Leads/Deals detail drawer.
//
// The Hub Revenue surface edits a *denormalized display model* (stage as a Korean-facing
// label, value as a "₩1.2M" string, type as personal/company). Persisting an edit means
// reversing that projection back onto the Supabase `leads` / `deals` rows. Fields that the
// display model can't faithfully reverse (owner_id, expected_close_at from a free-text
// close label) are intentionally left untouched — best-effort, never clobbered.

import { eqFilter, fetchSupabaseRows } from "../server-read.js";
import { UNREFERENCED_GUARD, countCustomerReferences, isCustomerTable } from "./customer-delete.js";
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

const DEAL_STAGE_KEYS = new Set(["potential", "contact", "consult", "quote", "final", "closing", "lost"]);
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
  if (payload.focusOverride !== undefined) {
    metaPatch.focus_override = payload.focusOverride === "raise" || payload.focusOverride === "lower"
      ? payload.focusOverride
      : null;
  }

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

  // Follow-up fields — next_action is a real leads column; snooze_until lives in meta
  // (no schema change) and getFollowups() honors it to suppress snoozed rows until due.
  if (payload.next_action !== undefined) {
    columns.next_action = String(payload.next_action).trim() || null;
  }
  if (payload.snooze_until !== undefined) {
    metaPatch.snooze_until = String(payload.snooze_until).trim() || null;
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
    metaPatch.stage_detail = String(payload.stage);
  }
  if (payload.value != null) {
    columns.amount = parseMoneyLabel(payload.value);
  }
  if (payload.closeAt !== undefined) {
    const raw = String(payload.closeAt || "").trim();
    if (!raw) columns.expected_close_at = null;
    else {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) columns.expected_close_at = parsed.toISOString();
    }
  }
  if (payload.hidden !== undefined) {
    columns.hidden_at = payload.hidden ? new Date().toISOString() : null;
  }

  const type = normalizeType(payload.type);
  if (type) metaPatch.account_kind = type;
  if (payload.workspace) metaPatch.workspace = payload.workspace;

  // Deals have no next_action column → keep both follow-up fields in meta.
  if (payload.next_action !== undefined) {
    metaPatch.next_action = String(payload.next_action).trim() || null;
  }
  if (payload.snooze_until !== undefined) {
    metaPatch.snooze_until = String(payload.snooze_until).trim() || null;
  }
  // 다음 미팅 breadcrumb — 일정 자체의 정본은 Google Calendar다. 여기엔 다시 찾아갈
  // {eventId, summary, startAt, htmlLink}만 남긴다 (projects.meta.origin_deal_id와 같은 성격).
  if (payload.next_meeting !== undefined) {
    metaPatch.next_meeting = payload.next_meeting || null;
  }

  return { columns, metaPatch };
}

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
  if (payload.focusOverride !== undefined) {
    metaPatch.focus_override = payload.focusOverride === "raise" || payload.focusOverride === "lower"
      ? payload.focusOverride
      : null;
  }

  return { columns, metaPatch };
}

const ACTIVITY_KINDS = new Set([
  "call", "meeting", "info_session", "demo", "visit", "email", "update",
  "note", "deal", "kakao", "quote", "ai",
]);
const ACTIVITY_REACTIONS = new Set(["positive", "neutral", "concern", "rejected", "no_response"]);

export function buildActivityWrite(payload = {}) {
  const columns = {};
  const metaPatch = {};

  if (typeof payload.body === "string" && payload.body.trim()) {
    columns.body = payload.body.trim();
  }
  if (ACTIVITY_KINDS.has(String(payload.type))) {
    columns.kind = String(payload.type);
  }
  if (payload.pinned !== undefined) {
    columns.pinned = Boolean(payload.pinned);
  }
  if (payload.reaction !== undefined) {
    columns.reaction = ACTIVITY_REACTIONS.has(String(payload.reaction))
      ? String(payload.reaction)
      : null;
  }

  for (const key of ["account_id", "company_id", "lead_id", "deal_id", "contact_id"]) {
    const camel = key.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
    if (payload[camel] !== undefined) columns[key] = payload[camel] || null;
  }

  if (columns.account_id) columns.entity_type = "account";
  else if (columns.deal_id) columns.entity_type = "deal";
  else if (columns.lead_id) columns.entity_type = "lead";
  if (payload.occurredAt) columns.occurred_at = String(payload.occurredAt);

  return { columns, metaPatch };
}

async function readExistingMeta(table, id, workspaceId) {
  const rows = await fetchSupabaseRows(table, {
    select: "meta",
    filters: [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    limit: 1,
  });
  // read 실패(null)와 "meta 없는 행"({})을 구분한다 — 실패를 {}로 뭉개면 patch가
  // 기존 meta 전체(snooze_until/value/stage_detail…)를 덮어쓰고 saved로 보고된다
  // (2026-08-05 재감사 안정성 M: meta-wipe).
  if (!Array.isArray(rows)) return null;
  const meta = rows[0] ? rows[0].meta : null;
  return meta && typeof meta === "object" ? meta : {};
}

// Shared insert/update path for both the lead and deal routes. Returns a small status
// envelope: `saved` (persisted) · `preview` (백엔드 미구성 — 낙관적 로컬 행 유지가 정당한
// 유일한 경우) · `failed` (라이브 백엔드가 거부: timeout/RLS/5xx — 재시도 대상) ·
// `noop` · `error` (잘못된 입력).
//
// Phase 0 taxonomy: 이전에는 모든 비-missing-config 실패가 preview로 재라벨돼 소비자가
// 라이브 거부를 "저장 대기"처럼 표시했다(2026-08-05 system-eval S-3).
function persistFailure(res) {
  return res.reason === "missing-config"
    ? { status: "preview", reason: res.reason, detail: res.detail }
    : { status: "failed", reason: res.reason, detail: res.detail };
}

export async function persistRevenueRecord({ table, op, id, payload, build }) {
  const workspaceId = resolveDefaultWorkspaceId();

  if (op === "delete") {
    if (!id) return { status: "error", reason: "missing-id" };
    if (!workspaceId) return { status: "preview", reason: "missing-workspace" };

    // 고객 DB의 삭제는 `guard: "unreferenced"`를 실어 보낸다 — 이력이 붙은 고객은 지우지
    // 않는다(customer-delete.js). 가드는 클라이언트가 빼먹어도 되는 UI 편의가 아니라
    // 서버가 강제하는 규칙이다. Leads 화면의 기존 삭제는 guard를 보내지 않으므로 종전
    // 동작 그대로다 — 정책을 그쪽까지 넓히는 건 별개 결정.
    if (payload?.guard === UNREFERENCED_GUARD && isCustomerTable(table)) {
      const refs = await countCustomerReferences({
        table,
        id,
        companyId: payload.companyId || null,
        workspaceId,
      });
      // 참조를 못 읽었으면 삭제하지 않는다 — 읽기 실패를 "참조 0"으로 뭉개는 순간
      // 이력이 가득한 고객이 조용히 지워진다.
      if (!refs.ok) {
        return { status: "failed", reason: refs.reason, detail: `${refs.table} 참조를 읽지 못해 삭제를 중단했습니다.` };
      }
      if (refs.total > 0) {
        return { status: "blocked", reason: "has-references", references: refs.counts, total: refs.total };
      }
    }

    const res = await deleteSupabaseRecord(table, [
      ["id", eqFilter(id)],
      ["workspace_id", eqFilter(workspaceId)],
    ]);
    return res.persisted ? { status: "saved", id } : persistFailure(res);
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
      : persistFailure(res);
  }

  if (!id) return { status: "error", reason: "missing-id" };
  if (!workspaceId) return { status: "preview", reason: "missing-workspace" };

  // Merge meta against the live row so we never drop sibling keys (brand, lane, campaign…).
  let mergedMeta = null;
  if (hasMeta) {
    const existingMeta = await readExistingMeta(table, id, workspaceId);
    if (existingMeta === null) {
      // 병합 기준을 못 읽었으면 저장을 중단한다 — 빈 meta 위에 덮어쓰면 무언 데이터 파괴.
      return { status: "failed", reason: "meta-read-failed", detail: "existing meta unreadable; save aborted to avoid wiping sibling keys" };
    }
    mergedMeta = { ...existingMeta, ...metaPatch };
  }
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
    : persistFailure(res);
}
