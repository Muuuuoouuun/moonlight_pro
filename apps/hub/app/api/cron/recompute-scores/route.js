import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";
import { recomputeLeadScores } from "@/lib/repositories/followups-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nightly Vercel Cron → periodic leads.score recompute (the learning sink writes back).
//
// Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>` on cron invocations. Set the
// Vercel env CRON_SECRET = COM_MOON_HUB_WRITE_SECRET so assertHubWriteAllowed accepts the
// cron and rejects every unauthenticated caller in production. This route is never open.
export async function GET(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  try {
    const result = await recomputeLeadScores({});
    return NextResponse.json({ status: result.persisted ? "ok" : "skipped", ...result });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
