import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getCampaigns, saveCampaign } from "@/lib/repositories/campaigns-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only, like GET /api/hub/revenue and /api/hub/revenue/activity — no write guard.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = Number.parseInt(searchParams.get("limit") || "", 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;

    const result = await getCampaigns({ limit });
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

// Create / update / delete a campaign. Write-guarded like the other Revenue POST routes.
export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const payload = parsed.data || {};
    const op = payload.op === "create" ? "create" : payload.op === "delete" ? "delete" : "update";

    const result = await saveCampaign({ op, id: payload.id, payload });

    const httpStatus = result.status === "saved" ? 200 : result.status === "error" ? 400 : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
