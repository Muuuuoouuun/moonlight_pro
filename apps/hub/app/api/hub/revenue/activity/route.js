import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getCrmActivities } from "@/lib/repositories/revenue-ledger";
import { buildActivityWrite, persistRevenueRecord } from "@/lib/sales-os/revenue-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?accountId= | ?leadId= | ?dealId= | ?companyId= — 상세 패널·팔로업 탭의 활동·노트 lazy load.
export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const result = await getCrmActivities({
      accountId: params.get("accountId") || "",
      leadId: params.get("leadId") || "",
      dealId: params.get("dealId") || "",
      companyId: params.get("companyId") || "",
    });

    if (!result.configured) {
      return NextResponse.json({ status: "preview", activities: [] }, { status: 202 });
    }
    if (result.activities === null) {
      return NextResponse.json({ status: "preview", reason: "fetch-failed", activities: [] }, { status: 202 });
    }
    return NextResponse.json({ status: "live", activities: result.activities });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// POST { op, id?, ...payload } — create(활동/노트 기록) · update(pinned 토글 등) · delete.
export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const payload = parsed.data || {};
    const op = payload.op === "create" ? "create" : payload.op === "delete" ? "delete" : "update";

    if (op === "create" && !(typeof payload.body === "string" && payload.body.trim())) {
      return NextResponse.json({ status: "error", reason: "empty-body" }, { status: 400 });
    }

    const result = await persistRevenueRecord({
      table: "crm_activities",
      op,
      id: payload.id,
      payload,
      build: buildActivityWrite,
    });

    const httpStatus = result.status === "saved" ? 200 : result.status === "error" ? 400 : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
