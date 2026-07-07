import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getRecentContentOutcomes, recordContentOutcome } from "@/lib/repositories/content-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List recent content outcomes (optionally scoped to one brand).
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const brandKey = searchParams.get("brand") || null;
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 500);
  const result = await getRecentContentOutcomes({ brandKey, limit });
  return NextResponse.json(result);
}

// Record one published-content outcome (operator logs a metric after publishing).
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
  const result = await recordContentOutcome({
    variantId: body.variantId || null,
    contentId: body.contentId || null,
    brandKey: body.brandKey || null,
    channel: body.channel || null,
    metric: body.metric || null,
    value: body.value ?? 0,
    measuredAt: body.measuredAt || null,
    source: body.source || "manual",
    note: body.note || null,
  });

  return NextResponse.json({ status: result.persisted ? "ok" : "error", result });
}
