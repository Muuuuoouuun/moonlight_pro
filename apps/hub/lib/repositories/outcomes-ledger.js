// Outreach outcomes ledger — the daily-loop learning sink.
//
// Write: recordOutreachOutcome (operator logs what happened after sending).
// Read:  getRecentOutcomes (triage pulls last N to bias prioritization),
//        getOutcomeStats (conversion funnel for the 5x measurement).
// Backed by migration 0008 `outreach_outcomes`.

import { randomUUID } from "crypto";

import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { insertSupabaseRecord, resolveDefaultWorkspaceId } from "@/lib/server-write";

import { isValidOutcomeAction } from "@/lib/sales-os/outcome-attribution";

const ACTIONS = new Set(["sent", "replied", "meeting", "proposal", "won", "lost", "no_response"]);
// Funnel order — each stage is a strict subset of the prior (won implies meeting implies replied).
const FUNNEL = ["sent", "replied", "meeting", "proposal", "won"];

function normalizeAction(value) {
  const v = String(value || "sent").toLowerCase();
  return ACTIONS.has(v) ? v : "sent";
}

export async function recordOutreachOutcome({
  workspaceId = resolveDefaultWorkspaceId(),
  leadId = null,
  dealId = null,
  companyId = null,
  play = null,
  assetId = null,
  channel = null,
  action = "sent",
  note = null,
  meta = null,
  occurredAt = null,
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  // Write-boundary integrity: reject an unknown action instead of silently coercing it to
  // 'sent' (which would corrupt the funnel). An absent action still defaults to 'sent'.
  if (action != null && !isValidOutcomeAction(action)) {
    return { persisted: false, reason: "invalid-action" };
  }

  // Inserts are return=minimal, so mint the id here and hand it back to the attribution caller.
  const id = randomUUID();
  const result = await insertSupabaseRecord("outreach_outcomes", {
    id,
    workspace_id: workspaceId,
    lead_id: leadId,
    deal_id: dealId,
    company_id: companyId,
    play: play || null,
    asset_id: assetId || null,
    channel: channel || null,
    action: normalizeAction(action),
    note: note || null,
    meta: meta && typeof meta === "object" ? meta : {},
    occurred_at: occurredAt || new Date().toISOString(),
  });
  return { ...result, id };
}

// Recent outcomes for triage. Optionally scope to a play.
export async function getRecentOutcomes({
  workspaceId = resolveDefaultWorkspaceId(),
  limit = 30,
  play = null,
} = {}) {
  if (!workspaceId) return { source: "preview", outcomes: [] };

  const filters = withWorkspaceFilter(play ? [["play", eqFilter(play)]] : []);
  const rows = await fetchSupabaseRows("outreach_outcomes", {
    filters,
    order: "occurred_at.desc",
    limit,
  });
  if (!rows) return { source: "preview", outcomes: [] };

  return {
    source: "supabase",
    outcomes: rows.map((r) => ({
      id: r.id,
      leadId: r.lead_id,
      dealId: r.deal_id,
      companyId: r.company_id,
      play: r.play,
      channel: r.channel,
      action: r.action,
      note: r.note,
      meta: r.meta || {},
      occurredAt: r.occurred_at,
    })),
  };
}

// Conversion funnel + ratios over a window (default last 500 outcomes).
export async function getOutcomeStats({
  workspaceId = resolveDefaultWorkspaceId(),
  limit = 500,
} = {}) {
  if (!workspaceId) return { source: "preview", counts: {}, funnel: [], ratios: {} };

  const rows = await fetchSupabaseRows("outreach_outcomes", {
    filters: withWorkspaceFilter(),
    order: "occurred_at.desc",
    limit,
  });
  if (!rows) return { source: "preview", counts: {}, funnel: [], ratios: {} };

  const counts = {};
  for (const a of ACTIONS) counts[a] = 0;
  rows.forEach((r) => {
    const a = normalizeAction(r.action);
    counts[a] = (counts[a] || 0) + 1;
  });

  // Funnel: count outcomes at-or-deeper than each stage (won counts toward meeting, etc.).
  const depth = (a) => FUNNEL.indexOf(a);
  const funnel = FUNNEL.map((stage) => {
    const stageDepth = FUNNEL.indexOf(stage);
    const n = rows.filter((r) => {
      const d = depth(normalizeAction(r.action));
      return d >= stageDepth && d !== -1;
    }).length;
    return { stage, count: n };
  });

  const at = (stage) => funnel.find((f) => f.stage === stage)?.count || 0;
  const ratio = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);
  const ratios = {
    replyRate: ratio(at("replied"), at("sent")),       // 접촉→응답 %
    meetingRate: ratio(at("meeting"), at("replied")),  // 응답→미팅 %
    winRate: ratio(at("won"), at("meeting")),          // 미팅→계약 %
    overall: ratio(at("won"), at("sent")),             // 접촉→계약 %
  };

  return { source: "supabase", total: rows.length, counts, funnel, ratios };
}
