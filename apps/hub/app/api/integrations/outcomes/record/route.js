import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { recordOutreachOutcome } from "@/lib/repositories/outcomes-ledger";

export const runtime = "nodejs";

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) {
    return guard;
  }

  const parsed = await readHubWriteJson(req);
  if (parsed.error) {
    return parsed.error;
  }

  const body = parsed.data || {};
  const result = await recordOutreachOutcome({
    leadId: body.leadId || null,
    dealId: body.dealId || null,
    companyId: body.companyId || null,
    play: body.play || null,
    assetId: body.assetId || null,
    channel: body.channel || null,
    action: body.action || "sent",
    note: body.note || null,
    occurredAt: body.occurredAt || null,
  });

  return NextResponse.json({ status: result.persisted ? "ok" : "error", result });
}
