import { NextResponse } from "next/server";
import { getRecentAgentRuns } from "@/lib/sales-os/agent-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const agent = params.get("agent") || null;
  const ref = params.get("ref") || null;
  const limit = params.has("limit") ? Number(params.get("limit")) : 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50
    || (agent && !["council", "guru", "guru.brand", "order", "sales", "content", "production", "review"].includes(agent))
    || (ref && ref.length > 300)) {
    return NextResponse.json({ status: "error", error: "invalid-agent-run-query" }, { status: 400 });
  }
  try {
    const result = await getRecentAgentRuns({ agent, ref, limit });
    return NextResponse.json({
      ...result,
      status: result.source === "supabase" ? "live" : result.source,
    });
  } catch {
    return NextResponse.json({ status: "error", error: "agent-runs-read-failed", runs: [] }, { status: 502 });
  }
}
