// Inbox router — one captured line -> a proposed work order (capture-spine.md).
//
// Classifies the line, then stages it as a `proposed` work_order tagged with the suggested
// destination table. Queue-first by design: every capture surfaces in the Daily Brief for a
// 1-click decision (semi-auto) rather than blind-writing — the operator confirms, then the
// approved order executes to its destination (outcome/lead/idea). The local /team command,
// with full schema + MCP access, may do the richer direct intake; the hub stays conservative.

import { classifyCapture } from "@/lib/sales-os/inbox-classify";
import { createWorkOrder } from "@/lib/sales-os/work-orders";

const KIND_TO_PERSONA = {
  lead: "sales",
  dm: "sales",
  outcome: "sales",
  idea: "content",
  engagement: "content",
  note: "inbox",
  review: "inbox",
};

function titleFor(raw, kind) {
  const head = String(raw).trim().replace(/\s+/g, " ").slice(0, 60);
  return `[${kind}] ${head}`;
}

export async function routeCapture({ raw, hint = null, workspaceId } = {}) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { routed: false, reason: "empty-capture" };

  const classification = classifyCapture(text, hint);
  const result = await createWorkOrder({
    workspaceId,
    persona: KIND_TO_PERSONA[classification.kind] || "inbox",
    kind: classification.kind,
    title: titleFor(text, classification.kind),
    body: { raw: text, hint: hint || null, classification, destination: classification.destination },
    channel: classification.channel,
    source: "inbox",
    gate: classification.kind === "review" ? "needs_human" : "internal->auto",
  });

  return { routed: Boolean(result.persisted), classification, workOrder: result };
}
