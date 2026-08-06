// Work orders ledger — the semi-autonomous approval queue (migration 0011 `work_orders`).
//
// Personas (/team), the inbox router, and Guru write proposals here (status 'proposed').
// The Daily Brief surfaces the pending queue; one click approves; execution flips to 'executed'.
// registry.json gates.no_auto_send=true — nothing leaves the queue without an operator decision.

import { eqFilter, fetchSupabaseRows, inFilter, withWorkspaceFilter } from "../server-read.js";
import { insertSupabaseRecord, resolveDefaultWorkspaceId, resolveSupabaseConfig, updateSupabaseRecord } from "../server-write.js";

const STATUSES = new Set(["proposed", "approved", "executing", "executed", "dismissed"]);
const SOURCES = new Set(["team", "inbox", "guru", "manual"]);
const TERMINAL_STATUSES = new Set(["executed", "dismissed"]);

function mapWorkOrder(r) {
  return {
    id: r.id,
    persona: r.persona,
    kind: r.kind,
    title: r.title,
    body: r.body || {},
    leadId: r.lead_id,
    dealId: r.deal_id,
    companyId: r.company_id,
    assetId: r.asset_id,
    channel: r.channel,
    status: r.status,
    gate: r.gate,
    source: r.source,
    runId: r.run_id,
    outcomeId: r.outcome_id,
    proposedAt: r.proposed_at,
    decidedAt: r.decided_at,
    executedAt: r.executed_at,
  };
}

export async function createWorkOrder({
  workspaceId = resolveDefaultWorkspaceId(),
  persona,
  kind,
  title,
  body = {},
  leadId = null,
  dealId = null,
  companyId = null,
  assetId = null,
  channel = null,
  gate = null,
  source = "team",
  runId = null,
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!persona || !kind || !title) return { persisted: false, reason: "missing-fields" };

  const result = await insertSupabaseRecord("work_orders", {
    workspace_id: workspaceId,
    persona: String(persona),
    kind: String(kind),
    title: String(title),
    body: body && typeof body === "object" ? body : {},
    lead_id: leadId || null,
    deal_id: dealId || null,
    company_id: companyId || null,
    asset_id: assetId || null,
    channel: channel || null,
    status: "proposed",
    gate: gate || null,
    source: SOURCES.has(source) ? source : "team",
    run_id: runId || null,
    proposed_at: new Date().toISOString(),
  }, {
    returnRepresentation: true,
    select: "*",
  });

  return result.record
    ? { ...result, order: mapWorkOrder(result.record) }
    : result;
}

export async function getWorkOrders({
  workspaceId = resolveDefaultWorkspaceId(),
  status = null,
  limit = 50,
} = {}) {
  if (!workspaceId || !resolveSupabaseConfig()) return { source: "preview", orders: [] };

  const extra = [];
  if (status) {
    extra.push(["status", Array.isArray(status) ? inFilter(status) : eqFilter(status)]);
  }

  const rows = await fetchSupabaseRows("work_orders", {
    filters: withWorkspaceFilter(extra),
    order: "proposed_at.desc",
    limit,
  });
  if (!rows) {
    // 구성돼 있는데 read가 죽었다 — preview("미구성")로 뭉개면 대기 승인이 "빈 큐"로
    // 위장돼 첫 화면·에이전트 큐 가드가 전부 불발한다(7차 안정성 — 90 진입로의 미착지 절반).
    return { source: "error", error: "work-orders-read-failed", retryable: true, orders: [] };
  }

  return { source: "supabase", orders: rows.map(mapWorkOrder) };
}

export async function getQueueSummary({ workspaceId = resolveDefaultWorkspaceId() } = {}) {
  const { source, orders } = await getWorkOrders({ workspaceId, limit: 200 });
  const counts = { proposed: 0, approved: 0, executing: 0, executed: 0, dismissed: 0 };
  orders.forEach((o) => {
    if (counts[o.status] != null) counts[o.status] += 1;
  });
  return { source, counts, pending: counts.proposed };
}

function valueAtPath(obj, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);
}

function expectedBodyMatches(body, expected = {}) {
  return Object.entries(expected || {}).every(([key, value]) => {
    if (value == null || value === "") return true;
    return String(valueAtPath(body || {}, key) ?? "") === String(value);
  });
}

export async function getApprovedWorkOrder({
  workspaceId = resolveDefaultWorkspaceId(),
  id,
  kind = null,
  gate = "human_approval",
  expectedBody = {},
  statuses = ["approved"],
} = {}) {
  if (!workspaceId) return { ok: false, reason: "missing-workspace", order: null };
  if (!id) return { ok: false, reason: "missing-id", order: null };
  const allowedStatuses = Array.isArray(statuses) ? statuses : [statuses];

  const rows = await fetchSupabaseRows("work_orders", {
    filters: [["workspace_id", eqFilter(workspaceId)], ["id", eqFilter(id)]],
    limit: 1,
  });
  const row = rows?.[0] || null;
  if (!row) return { ok: false, reason: "not-found", order: null };
  if (!allowedStatuses.includes(row.status)) {
    return { ok: false, reason: `not-${allowedStatuses.join("-or-")}`, order: mapWorkOrder(row) };
  }
  if (gate && row.gate !== gate) return { ok: false, reason: "gate-mismatch", order: mapWorkOrder(row) };
  if (kind && row.kind !== kind) return { ok: false, reason: "kind-mismatch", order: mapWorkOrder(row) };
  if (!expectedBodyMatches(row.body || {}, expectedBody)) {
    return { ok: false, reason: "body-mismatch", order: mapWorkOrder(row) };
  }
  return { ok: true, reason: "ok", order: mapWorkOrder(row) };
}

export async function claimApprovedWorkOrderForExecution({
  workspaceId = resolveDefaultWorkspaceId(),
  id,
  kind = null,
  gate = "human_approval",
  expectedBody = {},
} = {}) {
  const approved = await getApprovedWorkOrder({ workspaceId, id, kind, gate, expectedBody });
  if (!approved.ok) return approved;

  const result = await updateSupabaseRecord(
    "work_orders",
    [["workspace_id", eqFilter(workspaceId)], ["id", eqFilter(id)], ["status", eqFilter("approved")]],
    { status: "executing" },
    { returnRepresentation: true, select: "*" },
  );

  if (!result.persisted || !result.record) {
    return { ok: false, reason: "already-claimed-or-terminal", order: null };
  }

  return { ok: true, reason: "ok", order: mapWorkOrder(result.record) };
}

export async function releaseWorkOrderExecution({
  workspaceId = resolveDefaultWorkspaceId(),
  id,
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!id) return { persisted: false, reason: "missing-id" };

  return updateSupabaseRecord(
    "work_orders",
    [["workspace_id", eqFilter(workspaceId)], ["id", eqFilter(id)], ["status", eqFilter("executing")]],
    { status: "approved" },
  );
}

async function getWorkOrderRow({ workspaceId, id }) {
  if (!workspaceId || !id) return null;
  const rows = await fetchSupabaseRows("work_orders", {
    filters: [["workspace_id", eqFilter(workspaceId)], ["id", eqFilter(id)]],
    limit: 1,
  });
  return rows?.[0] || null;
}

function isAllowedTransition(from, to) {
  if (TERMINAL_STATUSES.has(from)) return false;
  if (from === "proposed") return to === "approved" || to === "dismissed";
  if (from === "approved") return to === "executing" || to === "executed" || to === "dismissed";
  if (from === "executing") return to === "executed" || to === "approved" || to === "dismissed";
  return false;
}

// Operator decision: approve / dismiss / mark executed. Never auto-called — this IS the 1-click gate.
export async function decideWorkOrder({
  workspaceId = resolveDefaultWorkspaceId(),
  id,
  status,
  outcomeId = null,
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!id || !STATUSES.has(status)) return { persisted: false, reason: "invalid-decision" };

  const current = await getWorkOrderRow({ workspaceId, id });
  if (!current) return { persisted: false, reason: "not-found" };
  if (!isAllowedTransition(current.status, status)) {
    return { persisted: false, reason: `invalid-transition-${current.status}-to-${status}` };
  }

  const now = new Date().toISOString();
  const patch = { status };
  if (status === "approved" || status === "dismissed") patch.decided_at = now;
  if (status === "executed") {
    patch.executed_at = now;
    if (outcomeId) patch.outcome_id = outcomeId;
  }

  return updateSupabaseRecord(
    "work_orders",
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)], ["status", eqFilter(current.status)]],
    patch,
    { returnRepresentation: true, select: "*" },
  );
}
