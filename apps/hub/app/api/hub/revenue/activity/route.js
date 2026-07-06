import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import {
  deleteActivity,
  getActivitiesFor,
  recordActivity,
  setActivityPinned,
} from "@/lib/repositories/crm-activities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read a single entity's activity timeline. No write guard — read-only, like GET /api/hub/revenue.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const leadId = searchParams.get("leadId");
    const dealId = searchParams.get("dealId");

    const result = await getActivitiesFor({ accountId, leadId, dealId });
    return NextResponse.json({
      status: result.source === "supabase" ? "live" : "preview",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// Log / pin / delete an activity. Write-guarded like the other Revenue POST routes.
export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const payload = parsed.data || {};
    const op = payload.op === "pin" ? "pin" : payload.op === "delete" ? "delete" : "create";

    // A non-persisted write is `preview` (config/workspace missing, DB unreachable, PostgREST
    // refused) — the caller keeps its optimistic local entry, same as the lead/deal/account
    // routes. Only genuinely malformed input (missing entity/id) is a hard 400 error.
    let result;
    if (op === "pin") {
      const res = await setActivityPinned({ id: payload.id, pinned: payload.pinned });
      result = res.persisted
        ? { status: "saved", activity: res.activity }
        : { status: res.reason === "missing-id" ? "error" : "preview", reason: res.reason, detail: res.detail };
    } else if (op === "delete") {
      const res = await deleteActivity({ id: payload.id });
      result = res.persisted
        ? { status: "saved", id: res.id }
        : { status: res.reason === "missing-id" ? "error" : "preview", reason: res.reason };
    } else {
      const res = await recordActivity({
        leadId: payload.leadId,
        dealId: payload.dealId,
        accountId: payload.accountId,
        companyId: payload.companyId,
        entityType: payload.entityType,
        kind: payload.kind,
        body: payload.body,
        pinned: payload.pinned,
        occurredAt: payload.occurredAt,
      });
      result = res.persisted
        ? { status: "saved", id: res.id, activity: res.activity }
        : { status: res.reason === "missing-entity" ? "error" : "preview", reason: res.reason, detail: res.detail };
    }

    const httpStatus = result.status === "saved" ? 200 : result.status === "error" ? 400 : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
