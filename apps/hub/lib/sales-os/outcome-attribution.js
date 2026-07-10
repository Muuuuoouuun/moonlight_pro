// Pure helpers for closing the sales-os learning loop (no IO — unit-testable).
//
// The loop: an approved work_order is executed → the operator's realized result is
// logged as an outreach_outcome → that outcome is attributed back to the order (and
// the agent_run that proposed it) → tomorrow's triage/leads.score learn from it.
//
// IO wrappers that use these: work-orders.js (attribution) + outcomes-ledger.js (sink).
// Keeping the logic here mirrors the repo's pure/IO split (inbox-classify↔inbox-router,
// context-schema↔context-assembler, followup-scoring↔followups-ledger).

// The 7 canonical outreach actions. Must stay in sync with the outreach_outcomes
// CHECK constraint in migration 0008 and the ACTIONS set in outcomes-ledger.js.
export const OUTCOME_ACTIONS = new Set([
  "sent",
  "replied",
  "meeting",
  "proposal",
  "won",
  "lost",
  "no_response",
]);

// Write-boundary validator. Unknown actions are REJECTED, never coerced to "sent" —
// a silent coercion corrupts every funnel ratio downstream.
export function isValidOutcomeAction(action) {
  return typeof action === "string" && OUTCOME_ACTIONS.has(action.toLowerCase());
}

// The one-click quick-log buttons surfaced in agents.jsx (AgentsOrders), daily-brief.jsx
// (ApprovalQueueCard), and followups.jsx — a curated subset of OUTCOME_ACTIONS (excludes
// proposal/won/lost, which are set from the deal pipeline, not a quick-log tap). Single
// source so the three surfaces can't silently drift out of sync with each other or with
// OUTCOME_ACTIONS above.
export const QUICK_LOG_ACTIONS = [
  { label: "전화함", action: "sent", tone: "moon" },
  { label: "응답", action: "replied", tone: "info" },
  { label: "미팅", action: "meeting", tone: "success" },
  { label: "노응답", action: "no_response", tone: "neutral" },
];

// The idempotency gate for attribution: a work order is "attributed" once it points at
// a realized outcome. Never attribute twice.
export function isWorkOrderAttributed(order) {
  return Boolean(order && order.outcomeId);
}

// Map an executed work order + the operator's realized result into an outreach_outcome
// input. Pure: copies the pipeline refs, passes `action` through unchanged (the sink
// validates), and does not invent defaults.
export function buildOutcomeFromWorkOrder(order, { action, note = null, occurredAt = null } = {}) {
  if (!order) return null;
  return {
    leadId: order.leadId ?? null,
    dealId: order.dealId ?? null,
    companyId: order.companyId ?? null,
    channel: order.channel ?? null,
    assetId: order.assetId ?? null,
    play: order.body?.play ?? null,
    action,
    note,
    occurredAt,
  };
}
