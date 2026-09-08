import { NextResponse } from "next/server";

import { getPersonas } from "@/lib/sales-os/persona-registry";
import { getQueueSummary } from "@/lib/sales-os/work-orders";
import { fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Most recent agent_runs row per persona — read-only, additive to the persona
// roster so Council can show real "last touched" instead of a fabricated quote.
async function getLatestRunByAgent() {
  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId || !resolveSupabaseConfig()) return { source: "preview", byAgent: new Map() };

  const rows = await fetchSupabaseRows("agent_runs", {
    filters: withWorkspaceFilter(),
    order: "ran_at.desc",
    limit: 50,
  });
  if (!Array.isArray(rows)) return { source: "error", byAgent: new Map() };

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
  return { source: "supabase", byAgent };
}

// GET — the seeded 5-persona roster (live status) + the approval-queue summary.
export async function GET() {
  const [personas, queue, latestRuns] = await Promise.all([
    getPersonas({}),
    getQueueSummary({}),
    getLatestRunByAgent(),
  ]);

  const personasWithRuns = personas.personas.map((p) => ({
    ...p,
    lastRun: latestRuns.byAgent.get(p.id) || null,
  }));

  const failedSources = [
    ...(personas.source === "error" ? ["agents"] : []),
    ...(queue.source === "error" ? ["work_orders"] : []),
    ...(latestRuns.source === "error" ? ["agent_runs"] : []),
  ];

  return NextResponse.json({
    status: personas.source === "error" ? "error" : failedSources.length ? "partial" : personas.source === "supabase" ? "live" : "preview",
    failedSources,
    source: personas.source,
    personas: personasWithRuns,
    queue,
  });
}
