import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { routeCapture } from "@/lib/sales-os/inbox-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { raw, hint? } — capture one field line, classify, stage as a proposed work order.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const input = parsed.data || {};
  const raw = typeof input.raw === "string" ? input.raw : "";
  const hint = typeof input.hint === "string" ? input.hint : null;

  const result = await routeCapture({ raw, hint });
  return NextResponse.json(result, { status: result.routed ? 201 : 200 });
}
