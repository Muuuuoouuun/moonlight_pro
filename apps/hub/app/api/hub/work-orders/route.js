import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { decideWorkOrder, getQueueSummary, getWorkOrders } from "@/lib/sales-os/work-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?status=proposed | ?summary=1 — read the approval queue.
export async function GET(req) {
  const { searchParams } = new URL(req.url);

  // read 실패는 502 — 200으로 내리면 소비자 r.ok 가드가 전부 통과해 "빈 큐"로 위장된다.
  if (searchParams.get("summary")) {
    const summary = await getQueueSummary();
    return NextResponse.json(summary, { status: summary.source === "error" ? 502 : 200 });
  }

  const status = searchParams.get("status");
  const orders = await getWorkOrders({ status: status || null, limit: 100 });
  return NextResponse.json(orders, { status: orders.source === "error" ? 502 : 200 });
}

// POST { id, status, outcome? } — the 1-click decision (approve | dismiss | executed).
// When status='executed' carries outcome:{action,note?,occurredAt?}, the learning loop closes:
// the outreach outcome is logged and attributed back to this order (and its agent run).
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const input = parsed.data || {};
  const id = typeof input.id === "string" ? input.id : null;
  const status = typeof input.status === "string" ? input.status : null;
  const outcome =
    input.outcome && typeof input.outcome === "object"
      ? {
          action: typeof input.outcome.action === "string" ? input.outcome.action : null,
          note: typeof input.outcome.note === "string" ? input.outcome.note : null,
          occurredAt: typeof input.outcome.occurredAt === "string" ? input.outcome.occurredAt : null,
        }
      : null;

  const result = await decideWorkOrder({ id, status, outcome });

  // 400 on bad input; 200 on success and on benign idempotent no-ops (double-submit).
  if (result.reason === "invalid-action" || result.reason === "invalid-decision") {
    return NextResponse.json(result, { status: 400 });
  }
  const ok =
    result.persisted ||
    result.reason === "already-attributed" ||
    result.reason === "already-executed" ||
    result.reason === "already-promoted" ||
    result.reason === "already-decided";
  return NextResponse.json(result, { status: ok ? 200 : 400 });
}
