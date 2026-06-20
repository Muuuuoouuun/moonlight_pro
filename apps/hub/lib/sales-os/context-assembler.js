// 360 context assembler — the single richer input for Guru (and, later, every persona).
//
// Replaces the flat revenue slice the sales-mentor route used to build. Pulls the real ledger
// entry points (getRevenueLedger / getRecentOutcomes / getContentLedger) + episodic memory
// (getRecentAgentRuns), normalizes via the pure context-schema, and degrades honestly: a source
// failure lands in missing[] and the loop continues (context-spine §4). Superset of the old
// context shape (deals/leads/accounts/cases/focus kept) so the Engine prompt stays compatible.

import { getContentLedger } from "@/lib/repositories/content-ledger";
import { getRecentOutcomes } from "@/lib/repositories/outcomes-ledger";
import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";

import { getRecentAgentRuns } from "@/lib/sales-os/agent-runs";
import {
  buildFocusOperatingContext,
  cadenceStatusString,
  normalizeOutcome,
  outcomesForEntity,
  selectBrand,
} from "@/lib/sales-os/context-schema";
import {
  buildLeadSourceMix,
  getClassInOperatorContext,
} from "@/lib/sales-os/operator-context";

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
  const leadSourceMix = buildLeadSourceMix(ledger.leads || []);
  const operator = getClassInOperatorContext({
    leadSourceMix,
    monthlyKpi: ledger.summary?.classinMonthlyKpi || null,
  });

  const context = {
    source: ledger.source,
    summary: ledger.summary || null,
    operator,
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

  if (ref && mode === "deal-review") {
    const needle = ref.toLowerCase();
    const deal =
      (ledger.deals || []).find(
        (d) => String(d.id).toLowerCase() === needle || (d.name || "").toLowerCase().includes(needle),
      ) || null;
    const account =
      (ledger.accounts || []).find((a) => (a.name || "").toLowerCase().includes(needle)) || null;
    const entityOutcomes = deal ? outcomesForEntity(normalizedOutcomes, { dealId: deal.id }) : [];
    context.focus = buildFocusOperatingContext({ deal, account, entityOutcomes, brand });
  }

  return context;
}
