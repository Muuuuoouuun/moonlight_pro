// Work orders ledger — the semi-autonomous approval queue (migration 0011 `work_orders`).
//
// Personas (/team), the inbox router, and Guru write proposals here (status 'proposed').
// The Daily Brief surfaces the pending queue; one click approves; execution flips to 'executed'.
// registry.json gates.no_auto_send=true — nothing leaves the queue without an operator decision.

import { eqFilter, fetchSupabaseRows, inFilter, withWorkspaceFilter } from "@/lib/server-read";
import { insertSupabaseRecord, resolveDefaultWorkspaceId, updateSupabaseRecord } from "@/lib/server-write";

const STATUSES = new Set(["proposed", "approved", "executed", "dismissed"]);
const SOURCES = new Set(["team", "inbox", "guru", "manual"]);

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

  return insertSupabaseRecord("work_orders", {
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
  });
}

export async function getWorkOrders({
  workspaceId = resolveDefaultWorkspaceId(),
  status = null,
  limit = 50,
} = {}) {
  if (!workspaceId) return { source: "preview", orders: [] };

  const extra = [];
  if (status) {
    extra.push(["status", Array.isArray(status) ? inFilter(status) : eqFilter(status)]);
  }

  const rows = await fetchSupabaseRows("work_orders", {
    filters: withWorkspaceFilter(extra),
    order: "proposed_at.desc",
    limit,
  });
  if (!rows) return { source: "preview", orders: [] };

  return { source: "supabase", orders: rows.map(mapWorkOrder) };
}

export async function getQueueSummary({ workspaceId = resolveDefaultWorkspaceId() } = {}) {
  const { source, orders } = await getWorkOrders({ workspaceId, limit: 200 });
  const counts = { proposed: 0, approved: 0, executed: 0, dismissed: 0 };
  orders.forEach((o) => {
    if (counts[o.status] != null) counts[o.status] += 1;
  });
  return { source, counts, pending: counts.proposed };
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

  const now = new Date().toISOString();
  const patch = { status };
  if (status === "approved" || status === "dismissed") patch.decided_at = now;
  if (status === "executed") {
    patch.executed_at = now;
    if (outcomeId) patch.outcome_id = outcomeId;
  }

  return updateSupabaseRecord(
    "work_orders",
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    patch,
  );
}
