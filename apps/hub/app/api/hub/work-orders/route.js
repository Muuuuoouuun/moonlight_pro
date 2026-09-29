import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { eqFilter, inFilter } from "@/lib/server-read";
import { deleteSupabaseRecord, resolveDefaultWorkspaceId } from "@/lib/server-write";
import { getWorkOrderCounts } from "@/lib/sales-os/work-order-counts";
import { decideWorkOrder, getQueueSummary, getWorkOrders } from "@/lib/sales-os/work-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?status=proposed | ?summary=1 — read the approval queue.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope');
    const status = searchParams.get('status') || 'proposed';
    if ((scope && scope !== 'proposals') || !['proposed', 'approved', 'executed', 'dismissed', 'all'].includes(status)) {
      return NextResponse.json({ status: 'error', reason: 'invalid-query' }, { status: 400 });
    }

    // read 실패는 body status:"error"로 알린다(HTTP 200, daily-brief 계약) — getWorkOrders/
    // getQueueSummary는 source만 돌려주므로 여기서 status를 얹지 않으면 소비자의
    // d.status === 'error' 가드가 발동하지 않는다(예전엔 502 HTTP 자체가 유일한 신호였다).
    if (searchParams.get("summary")) {
      if (scope === 'proposals') {
        const summary = await getWorkOrderCounts();
        return NextResponse.json({ status: summary.source === 'error' ? 'error' : 'ok', ...summary, pending: summary.counts?.proposed ?? null });
      }
      const summary = await getQueueSummary();
      return NextResponse.json({ status: summary.source === "error" ? "error" : "ok", ...summary });
    }

    const orders = await getWorkOrders({ status: status === 'all' ? null : status === 'approved' ? ['approved', 'executing'] : status, scope, limit: 100 });
    return NextResponse.json({ status: orders.source === "error" ? "error" : "ok", ...orders });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const ids = parsed.data?.ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || ids.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    return NextResponse.json({ ok: false, status: 'error', reason: 'invalid-ids' }, { status: 400 });
  }
  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId) return NextResponse.json({ ok: false, status: 'error', reason: 'missing-workspace' });
  const normalizedIds = [...new Set(ids.map((id) => id.toLowerCase()))];

  let result;
  try {
    result = await deleteSupabaseRecord('work_orders', [
      ['id', inFilter(normalizedIds)],
      ['workspace_id', eqFilter(workspaceId)],
      ['source', 'neq.inbox'],
    ]);
  } catch {
    return NextResponse.json({ ok: false, status: 'error', reason: 'work-order-delete-failed' });
  }
  if (result.reason === 'no-matching-row') {
    return NextResponse.json({ ok: true, status: 'ok', deletedIds: [] });
  }
  if (!result.persisted) {
    return NextResponse.json({ ok: false, status: 'error', reason: result.reason || 'work-order-delete-failed' });
  }
  const requested = new Set(normalizedIds);
  const deletedIds = (result.records || []).map((row) => row.id).filter((id) => requested.has(String(id).toLowerCase()));
  return NextResponse.json({ ok: true, status: 'ok', deletedIds });
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
