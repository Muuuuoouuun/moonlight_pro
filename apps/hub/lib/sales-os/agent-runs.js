// Agent runs ledger — episodic memory for personas/Guru (migration 0011 `agent_runs`).
//
// Write: recordAgentRun (log one coaching/persona invocation: what was recommended).
// Read:  getRecentAgentRuns (the assembler pulls the focus ref's recent runs back into the
//        360 context.memory so the next call "remembers" what was advised before).
// This read/write pair is what turns Guru from a stateless advisor into a remembering coach.

import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { insertSupabaseRecord, resolveDefaultWorkspaceId, updateSupabaseRecord } from "@/lib/server-write";

const RESULTS = new Set(["ok", "needs_human", "error"]);

function normalizeResult(value) {
  const v = String(value || "ok").toLowerCase();
  return RESULTS.has(v) ? v : "ok";
}

export async function recordAgentRun({
  workspaceId = resolveDefaultWorkspaceId(),
  agent,
  mode = null,
  ref = null,
  inputSummary = null,
  recommendation = null,
  emittedCount = 0,
  result = "ok",
  outcomeId = null,
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!agent) return { persisted: false, reason: "missing-agent" };

  return insertSupabaseRecord("agent_runs", {
    workspace_id: workspaceId,
    agent: String(agent),
    mode: mode || null,
    ref: ref || null,
    input_summary: inputSummary || null,
    recommendation: recommendation ?? null,
    emitted_count: Number.isFinite(emittedCount) ? emittedCount : 0,
    result: normalizeResult(result),
    outcome_id: outcomeId || null,
    ran_at: new Date().toISOString(),
  });
}

// Attribute a realized outcome back to the run that produced the recommendation (learning).
// Guarded on `outcome_id is null` (idempotent) and a no-op without a runId — dormant until
// the emit path populates work_orders.run_id, at which point attribution activates for free.
export async function setAgentRunOutcome({
  workspaceId = resolveDefaultWorkspaceId(),
  runId,
  outcomeId,
} = {}) {
  if (!workspaceId || !runId || !outcomeId) return { persisted: false, reason: "missing-fields" };

  return updateSupabaseRecord(
    "agent_runs",
    [["id", eqFilter(runId)], ["workspace_id", eqFilter(workspaceId)], ["outcome_id", "is.null"]],
    { outcome_id: outcomeId },
  );
}

export async function getRecentAgentRuns({
  workspaceId = resolveDefaultWorkspaceId(),
  ref = null,
  agent = null,
  limit = 10,
} = {}) {
  if (!workspaceId) return { source: "preview", runs: [] };

  const extra = [];
  if (ref) extra.push(["ref", eqFilter(ref)]);
  if (agent) extra.push(["agent", eqFilter(agent)]);

  const rows = await fetchSupabaseRows("agent_runs", {
    filters: withWorkspaceFilter(extra),
    order: "ran_at.desc",
    limit,
  });
  if (!rows) return { source: "preview", runs: [] };

  return {
    source: "supabase",
    runs: rows.map((r) => ({
      id: r.id,
      agent: r.agent,
      mode: r.mode,
      ref: r.ref,
      recommendation: r.recommendation,
      result: r.result,
      ranAt: r.ran_at,
    })),
  };
}
