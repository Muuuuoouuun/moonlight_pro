// 360 context assembler — the single richer input for Guru (and, later, every persona).
//
// Replaces the flat revenue slice the sales-mentor route used to build. Pulls the real ledger
// entry points (getRevenueLedger / getRecentOutcomes / getContentLedger) + episodic memory
// (getRecentAgentRuns), normalizes via the pure context-schema, and degrades honestly: a source
// failure lands in missing[] and the loop continues (context-spine §4). Superset of the old
// context shape (deals/leads/accounts/cases/focus kept) so the Engine prompt stays compatible.

import { getContentLedger } from "@/lib/repositories/content-ledger";
import { getCrmPipeline } from "@/lib/repositories/crm-pipeline";
import { getRecentOutcomes } from "@/lib/repositories/outcomes-ledger";
import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";

import { getRecentAgentRuns } from "@/lib/sales-os/agent-runs";
import {
  OWNER_ID,
  buildFocusOperatingContext,
  cadenceStatusString,
  normalizeOutcome,
  outcomesForEntity,
  selectBrand,
} from "@/lib/sales-os/context-schema";

const trim = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);

async function settled(promise, source, missing) {
  try {
    return await promise;
  } catch (error) {
    missing.push({ source, reason: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function assembleSalesContext({ mode = "pipeline-triage", ref = null } = {}) {
  const missing = [];
  const [ledger, outcomesRes, content, runsRes] = await Promise.all([
    settled(getRevenueLedger(), "revenue-ledger", missing),
    settled(getRecentOutcomes({ limit: 30 }), "outreach_outcomes", missing),
    settled(getContentLedger(), "content-ledger", missing),
    settled(getRecentAgentRuns({ ref, limit: 5 }), "agent_runs", missing),
  ]);

  if (!ledger) {
    return { source: "preview", error: "revenue ledger unavailable", missing };
  }

  const normalizedOutcomes = (outcomesRes?.outcomes || []).map(normalizeOutcome).filter(Boolean);
  const brand = selectBrand(content?.brands);

  const context = {
    source: ledger.source,
    summary: ledger.summary || null,
    stages: ledger.stages || [],
    deals: trim(ledger.deals, 40),
    leads: trim(ledger.leads, 40),
    accounts: trim(ledger.accounts, 40),
    cases: trim(ledger.cases, 20),
    outcomes: {
      source: outcomesRes?.source || "preview",
      recent: trim(normalizedOutcomes, 30),
    },
    content: content
      ? {
          cadence_status: cadenceStatusString(content.cadence),
          cadence: content.cadence || null,
          idea_queue_top: trim(content.ideaQueue, 8),
        }
      : null,
    brand,
    memory: {
      recent_runs: trim(runsRes?.runs, 5),
    },
    missing,
  };

  // deal-review AND followup-draft both need the deal-scoped focus (buyer style, recent
  // outcomes, next-action hint) — followup-draft writes the message off exactly this slice.
  if (ref && (mode === "deal-review" || mode === "followup-draft")) {
    const needle = ref.toLowerCase();
    const deal =
      (ledger.deals || []).find(
        (d) => String(d.id).toLowerCase() === needle || (d.name || "").toLowerCase().includes(needle),
      ) || null;
    const account =
      (ledger.accounts || []).find((a) => (a.name || "").toLowerCase().includes(needle)) || null;
    // Lead match: prefer the deal's own lead_id link, fall back to a name-substring match —
    // this is what fills score/next_action_hint/contact in the focus context.
    const lead = deal
      ? (ledger.leads || []).find((l) => deal.leadId && l.id === deal.leadId) ||
        (ledger.leads || []).find((l) => (l.name || "").toLowerCase().includes((deal.name || "").toLowerCase())) ||
        null
      : null;
    const entityOutcomes = deal ? outcomesForEntity(normalizedOutcomes, { dealId: deal.id }) : [];
    // v1.4 CRM gap fill — resolves to null until the classin_crm_snapshot push lands (P0b/P1);
    // buildFocusOperatingContext degrades that to the existing "eeoCRM" missing[] entry.
    const crmFacts = deal
      ? await settled(getCrmPipeline({ ownerId: OWNER_ID, dealId: deal.id }), "crm-pipeline", missing)
      : null;
    context.focus = buildFocusOperatingContext({ deal, account, lead, entityOutcomes, brand, crmFacts });
  }

  return context;
}
