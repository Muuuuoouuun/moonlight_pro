import { NextResponse } from "next/server";

import { getPersonas } from "@/lib/sales-os/persona-registry";
import { getQueueSummary } from "@/lib/sales-os/work-orders";
import { fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Most recent agent_runs row per persona — read-only, additive to the persona
// roster so Council can show real "last touched" instead of a fabricated quote.
async function getLatestRunByAgent() {
  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId) return new Map();

  const rows = await fetchSupabaseRows("agent_runs", {
    filters: withWorkspaceFilter(),
    order: "ran_at.desc",
    limit: 50,
  });
  if (!Array.isArray(rows)) return new Map();

  const byAgent = new Map();
  for (const row of rows) {
    if (row?.agent && !byAgent.has(row.agent)) {
      byAgent.set(row.agent, {
        ranAt: row.ran_at || row.created_at || null,
        summary: row.input_summary || null,
        result: row.result || "ok",
      });
    }
  }
  return byAgent;
}

// GET — the seeded 5-persona roster (live status) + the approval-queue summary.
export async function GET() {
  const [personas, queue, latestRunByAgent] = await Promise.all([
    getPersonas({}),
    getQueueSummary({}),
    getLatestRunByAgent(),
  ]);

  const personasWithRuns = personas.personas.map((p) => ({
    ...p,
    lastRun: latestRunByAgent.get(p.id) || null,
  }));

  return NextResponse.json({
    status: personas.source === "supabase" ? "live" : "preview",
    source: personas.source,
    personas: personasWithRuns,
    queue,
  });
}
