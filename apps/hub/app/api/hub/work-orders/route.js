import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { decideWorkOrder, getQueueSummary, getWorkOrders } from "@/lib/sales-os/work-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?status=proposed | ?summary=1 — read the approval queue.
export async function GET(req) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("summary")) {
    const summary = await getQueueSummary();
    return NextResponse.json(summary, { status: 200 });
  }

  const status = searchParams.get("status");
  const orders = await getWorkOrders({ status: status || null, limit: 100 });
  return NextResponse.json(orders, { status: 200 });
}

// POST { id, status } — the 1-click decision (approve | dismiss | executed).
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const input = parsed.data || {};
  const id = typeof input.id === "string" ? input.id : null;
  const status = typeof input.status === "string" ? input.status : null;

  const result = await decideWorkOrder({ id, status });
  return NextResponse.json(result, { status: result.persisted ? 200 : 400 });
}
