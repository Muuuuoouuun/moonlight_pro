import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { executeApprovedWorkOrder } from "@/lib/sales-os/work-order-executor";
import { createWorkOrder, decideWorkOrder, getQueueSummary, getWorkOrders } from "@/lib/sales-os/work-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?status=proposed | ?summary=1 — read the approval queue.
export async function GET(req) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("summary")) {
    const summary = await getQueueSummary();
    return NextResponse.json(summary, { status: 200 });
  }

  const rawStatus = searchParams.get("status");
  const status = rawStatus && rawStatus.includes(",")
    ? rawStatus.split(",").map((item) => item.trim()).filter(Boolean)
    : rawStatus;
  const orders = await getWorkOrders({ status: status || null, limit: 100 });
  return NextResponse.json(orders, { status: 200 });
}

// POST { id, status } — the 1-click decision (approve | dismiss | executed).
// POST { id, action: "execute" } — replay an approved external work order, or mark manual work done.
// POST { action: "create", persona, kind, title, dealId, ... } — propose a new queue item.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const input = parsed.data || {};
  const id = typeof input.id === "string" ? input.id : null;
  const action = typeof input.action === "string" ? input.action.trim().toLowerCase() : "";
  const status = typeof input.status === "string" ? input.status : null;

  if (action === "create") {
    const result = await createWorkOrder({
      persona: input.persona,
      kind: input.kind,
      title: input.title,
      body: input.body && typeof input.body === "object" ? input.body : {},
      leadId: input.leadId || null,
      dealId: input.dealId || null,
      companyId: input.companyId || null,
      channel: input.channel || null,
      source: input.source || "manual",
    });
    return NextResponse.json(result, { status: result.persisted ? 200 : 202 });
  }

  if (action === "execute") {
    const result = await executeApprovedWorkOrder({ req, id });
    return NextResponse.json(result.data, { status: result.status });
  }

  const result = await decideWorkOrder({ id, status });
  return NextResponse.json(result, { status: result.persisted ? 200 : 400 });
}
