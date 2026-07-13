// Work orders ledger — the semi-autonomous approval queue (migration 0011 `work_orders`).
//
// Personas (/team), the inbox router, and Guru write proposals here (status 'proposed').
// The Daily Brief surfaces the pending queue; one click approves; execution flips to 'executed'.
// registry.json gates.no_auto_send=true — nothing leaves the queue without an operator decision.

import { randomUUID } from "crypto";

import { eqFilter, fetchSupabaseRows, inFilter, withWorkspaceFilter } from "@/lib/server-read";
import {
  callSupabaseRpc,
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  updateSupabaseRecord,
  updateSupabaseRecordReturning,
} from "@/lib/server-write";

import { recordOutreachOutcome } from "@/lib/repositories/outcomes-ledger";
import { setAgentRunOutcome } from "@/lib/sales-os/agent-runs";
import {
  buildOutcomeFromWorkOrder,
  isValidOutcomeAction,
  isWorkOrderAttributed,
} from "@/lib/sales-os/outcome-attribution";

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

// Read one work order by id (mapped shape) — used by the attribution back-fill.
export async function getWorkOrderById({ workspaceId = resolveDefaultWorkspaceId(), id } = {}) {
  if (!workspaceId || !id) return null;
  const rows = await fetchSupabaseRows("work_orders", {
    filters: [["workspace_id", eqFilter(workspaceId)], ["id", eqFilter(id)]],
    limit: 1,
  });
  if (!rows || !rows.length) return null;
  return mapWorkOrder(rows[0]);
}

// Close the loop: flip an approved order to 'executed', log the realized outreach outcome,
// and back-fill work_orders.outcome_id (+ agent_runs.outcome_id when run_id is known).
// Idempotent by construction: the status transition is the lock (only one caller flips
// →executed), and both FK writes are guarded on `outcome_id is null`.
async function attributeWorkOrderOutcome({ workspaceId, id, order, outcome }) {
  const now = new Date().toISOString();

  // (1) transition lock — only the caller that flips status to 'executed' proceeds.
  const won = await updateSupabaseRecordReturning(
    "work_orders",
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)], ["status", "neq.executed"]],
    { status: "executed", executed_at: now },
  );
  if (!Array.isArray(won)) return { persisted: false, reason: won?.error || "transition-failed" };
  if (won.length === 0) return { persisted: false, reason: "already-executed" };

  // (2) record the realized outcome (client-minted id, since inserts are return=minimal).
  const rec = await recordOutreachOutcome({ workspaceId, ...buildOutcomeFromWorkOrder(order, outcome) });
  if (!rec.persisted) {
    // The order IS executed, but the outcome sink failed — surface it rather than hide it.
    return { persisted: true, reason: "executed-unattributed", attributed: false, outcomeError: rec.reason };
  }

  // (3) back-fill the FK (guarded on `is null`, so a race can't double-write).
  await updateSupabaseRecord(
    "work_orders",
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)], ["outcome_id", "is.null"]],
    { outcome_id: rec.id },
  );

  // (4) attribute the originating agent run too — dormant until run_id is populated at emit time.
  if (order.runId) {
    await setAgentRunOutcome({ workspaceId, runId: order.runId, outcomeId: rec.id });
  }

  return { persisted: true, reason: "ok", attributed: true, outcomeId: rec.id, status: "executed" };
}

// Close the DM/lead capture loop (capture-spine.md §2 "DM 인입"/"새 리드"): an executed
// dm/lead-kind work order becomes a real `leads` row. Deliberately skips the
// lead_intake_raw -> companies match-key dance that business-card/sheet imports use — that
// needs structured fields (name/phone) an inbox one-liner doesn't have, and guessing a
// company match from free text risks silently merging into the wrong company. A bare lead
// the operator fleshes out in Revenue > Leads is the safe default; richer entity extraction
// is the local /team command's job, not the hub's (see inbox-classify.js header comment).
async function promoteCaptureToLead({ workspaceId, id, order }) {
  const now = new Date().toISOString();

  // transition lock — only the caller that flips status to 'executed' proceeds.
  const won = await updateSupabaseRecordReturning(
    "work_orders",
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)], ["status", "neq.executed"]],
    { status: "executed", executed_at: now },
  );
  if (!Array.isArray(won)) return { persisted: false, reason: won?.error || "transition-failed" };
  if (won.length === 0) return { persisted: false, reason: "already-executed" };

  const raw = typeof order.body?.raw === "string" ? order.body.raw.trim() : "";
  const leadId = randomUUID();
  const insert = await insertSupabaseRecord("leads", {
    id: leadId,
    workspace_id: workspaceId,
    company_id: null,
    contact_id: null,
    name: raw ? raw.slice(0, 80) : order.title,
    source: "inbox",
    channel: order.channel || order.body?.classification?.channel || null,
    status: "new",
    score: 0,
    next_action: null,
    last_touch_at: now,
    updated_at: now,
    // meta.type: 'company' — every inbox dm/lead capture is a prospective ClassIn academy
    // lead (B2B), not a personal-brand contact; keeps the Revenue Personal/Company badge honest.
    meta: { type: "company", captured_raw: raw || null, work_order_id: id },
  });
  if (!insert.persisted) {
    // The order IS executed, but the lead insert failed — surface it rather than hide it.
    return { persisted: true, reason: "executed-unpromoted", promoted: false, leadError: insert.reason };
  }

  await updateSupabaseRecord(
    "work_orders",
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)], ["lead_id", "is.null"]],
    { lead_id: leadId },
  );

  return { persisted: true, reason: "ok", promoted: true, leadId, status: "executed" };
}

// Close the Content Flywheel loop (안2): an approved content-draft order materializes into
// the Studio pipeline instead of dying in the queue. work_orders.asset_id IS the idea's
// content_items id, so approval graduates the idea (status idea→draft) and lands the drafted
// {title, body} as a content_variants row — Studio/Queue pick it up with zero re-typing.
// Idempotent: the database function locks the work order and owns the whole transaction.
// Deliberately NOT an outreach outcome — content drafts must never pollute the sales funnel.
async function approveContentDraft({ workspaceId, id }) {
  const result = await callSupabaseRpc("approve_content_draft_work_order", {
    p_workspace_id: workspaceId,
    p_work_order_id: id,
  });
  if (!result.persisted) return result;

  const data = result.data && typeof result.data === "object" ? result.data : null;
  if (!data) return { persisted: false, reason: "invalid-rpc-response" };

  const materialized = data.materialized === true;
  const status = typeof data.status === "string" ? data.status : null;
  const persisted = materialized && status === "approved";

  return {
    persisted,
    reason: persisted ? (data.reason || "ok") : (data.reason || "not-materialized"),
    status,
    materialized,
    variantId: data.variant_id || null,
    contentId: data.content_id || null,
    idempotent: data.idempotent === true,
  };
}

// Operator decision: approve / dismiss / mark executed. Never auto-called — this IS the 1-click gate.
// When status='executed' carries an `outcome` payload, it closes the outcome-attribution loop;
// with no payload on a dm/lead-kind order, it closes the lead-capture loop instead (see above).
export async function decideWorkOrder({
  workspaceId = resolveDefaultWorkspaceId(),
  id,
  status,
  outcome = null,
  outcomeId = null,
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!id || !STATUSES.has(status)) return { persisted: false, reason: "invalid-decision" };

  // Executed + realized result → validate up-front, then transition-lock + attribute.
  if (status === "executed" && outcome && outcome.action != null) {
    if (!isValidOutcomeAction(outcome.action)) return { persisted: false, reason: "invalid-action" };
    const order = await getWorkOrderById({ workspaceId, id });
    if (!order) return { persisted: false, reason: "not-found" };
    if (isWorkOrderAttributed(order)) return { persisted: false, reason: "already-attributed" };
    return attributeWorkOrderOutcome({ workspaceId, id, order, outcome });
  }

  // Executed, no outcome payload, dm/lead capture → promote to a real lead instead.
  if (status === "executed" && !outcome) {
    const order = await getWorkOrderById({ workspaceId, id });
    if (order && (order.kind === "dm" || order.kind === "lead")) {
      if (order.leadId) return { persisted: false, reason: "already-promoted" };
      return promoteCaptureToLead({ workspaceId, id, order });
    }
  }

  // Approved content-draft → materialize into the Studio pipeline (see approveContentDraft).
  if (status === "approved") {
    const order = await getWorkOrderById({ workspaceId, id });
    if (!order) return { persisted: false, reason: "not-found" };
    if (order.kind === "content-draft") {
      return approveContentDraft({ workspaceId, id });
    }
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
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    patch,
  );
}
