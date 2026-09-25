// 360 context assembler — the single richer input for Guru (and, later, every persona).
//
// Replaces the flat revenue slice the sales-mentor route used to build. Pulls the real ledger
// entry points (getRevenueLedger / getRecentContactActivities / getContentLedger) + episodic memory
// (getRecentAgentRuns), normalizes via the pure context-schema, and degrades honestly: a source
// failure lands in missing[] and the loop continues (context-spine §4). Superset of the old
// context shape (deals/leads/accounts/cases/focus kept) so the Engine prompt stays compatible.

import { getContentLedger } from "@/lib/repositories/content-ledger";
import { getCrmPipeline } from "@/lib/repositories/crm-pipeline";
import { getRecentContactActivities } from "@/lib/repositories/crm-activities";
import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";

import { getRecentAgentRuns } from "@/lib/sales-os/agent-runs";
import { brandInWorkspace } from "@/components/hub/workspace-map";
import {
  OWNER_ID,
  buildFocusOperatingContext,
  normalizeOutcome,
  outcomesForEntity,
  selectBrand,
} from "@/lib/sales-os/context-schema";

const trim = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);

// A selected company workspace/brand is authoritative. Legacy rows with no
// explicit scope can use the revenue type; names alone do not establish scope.
function belongsToClassIn(row) {
  if (!row || typeof row !== "object") return false;
  if (row.workspace) return row.workspace === "classin";
  if (row.brand) return brandInWorkspace(row.brand, "classin");
  return row.type === "company";
}

function isLinkedClassInOutcome(outcome, leadIds, dealIds, accountIds) {
  const linked = [
    outcome.lead_id ? leadIds.has(outcome.lead_id) : null,
    outcome.deal_id ? dealIds.has(outcome.deal_id) : null,
    outcome.account_id ? accountIds.has(outcome.account_id) : null,
  ].filter(value => value !== null);
  // company_id alone cannot prove org scope: the bounded revenue read may omit
  // a personal row linked to the same company.
  return linked.length > 0 && linked.every(Boolean);
}

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
  let [ledger, outcomesRes, content, runsRes] = await Promise.all([
    settled(getRevenueLedger(), "revenue-ledger", missing),
    // 0a: 연락 기록의 단일 원천은 crm_activities — 봉투·필드명은 예전 outcomes와 같다.
    // Scope before the final 30: recent personal rows must not consume every
    // slot available for ClassIn contacts. The underlying read stays bounded.
    settled(getRecentContactActivities({ limit: 500 }), "crm_activities", missing),
    settled(getContentLedger(), "content-ledger", missing),
    settled(getRecentAgentRuns({ agent: "guru", ref, ...(mode === "open-question"
      ? { mode: "open-question", ...(!ref ? { unscopedOnly: true } : {}) } : {}), limit: 5 }), "agent_runs", missing),
  ]);

  if (!ledger || ledger.source === "preview" || ledger.source === "error") {
    missing.push({ source: "revenue-ledger", reason: ledger?.error || "revenue-ledger-unavailable" });
    return { source: ledger?.source === "preview" ? "preview" : "error", error: ledger?.error || "revenue ledger unavailable", missing };
  }
  if (ledger.partial) {
    missing.push({ source: "revenue-ledger", reason: "partial-read", failedSources: ledger.failedSources || [] });
  }

  for (const [value, source] of [[outcomesRes, "crm_activities"], [content, "content-ledger"], [runsRes, "agent_runs"]]) {
    if (value?.source === "error" || value?.source === "preview") {
      missing.push({ source, reason: value.error || `${source}-${value.source}` });
    }
  }
  if (outcomesRes?.source === "error" || outcomesRes?.source === "preview") outcomesRes = null;
  if (content?.source === "error" || content?.source === "preview") content = null;
  if (runsRes?.source === "error" || runsRes?.source === "preview") runsRes = null;

  const normalizedOutcomes = (outcomesRes?.outcomes || []).map(normalizeOutcome).filter(Boolean);
  const brand = selectBrand(content?.brands);
  const classInLeads = (ledger.leads || []).filter(belongsToClassIn);
  const classInDeals = (ledger.deals || []).filter(belongsToClassIn);
  const classInAccounts = (ledger.accounts || []).filter(belongsToClassIn);
  const classInCases = (ledger.cases || []).filter(belongsToClassIn);
  const leadIds = new Set((classInLeads || []).map(row => row.id).filter(Boolean));
  const dealIds = new Set((classInDeals || []).map(row => row.id).filter(Boolean));
  const accountIds = new Set((classInAccounts || []).map(row => row.id).filter(Boolean));
  const companyOnly = normalizedOutcomes.filter(outcome => outcome.company_id && !outcome.lead_id && !outcome.deal_id && !outcome.account_id);
  if (companyOnly.length) {
    missing.push({ source: "crm_activities", reason: "company-only activity scope unverified", count: companyOnly.length });
  }
  const scopedOutcomes = normalizedOutcomes.filter(outcome => isLinkedClassInOutcome(outcome, leadIds, dealIds, accountIds));

  const context = {
    source: missing.length ? "partial" : ledger.source,
    // Repository aggregates and content cadence span personal and company lanes.
    // Until scoped aggregates exist, omission is more truthful than reuse.
    summary: null,
    stages: ledger.stages || [],
    deals: trim(classInDeals, 40),
    leads: trim(classInLeads, 40),
    accounts: trim(classInAccounts, 40),
    cases: trim(classInCases, 20),
    outcomes: {
      source: outcomesRes?.source || "preview",
      recent: trim(scopedOutcomes, 30),
    },
    content: null,
    brand,
    memory: {
      recent_runs: trim((runsRes?.runs || []).filter(run => run.agent === "guru"
        && (mode !== "open-question" || (run.mode === "open-question" && (ref ? run.ref === ref : !run.ref)))), 5),
    },
    missing,
  };

  // deal-review AND followup-draft both need the deal-scoped focus (buyer style, recent
  // outcomes, next-action hint) — followup-draft writes the message off exactly this slice.
  if (ref && (mode === "deal-review" || mode === "followup-draft")) {
    const needle = ref.toLowerCase();
    const deal =
      classInDeals.find(
        (d) => String(d.id).toLowerCase() === needle || (d.name || "").toLowerCase().includes(needle),
      ) || null;
    const account =
      classInAccounts.find((a) => (a.name || "").toLowerCase().includes(needle)) || null;
    // Lead match: prefer the deal's own lead_id link, fall back to a name-substring match —
    // this is what fills score/next_action_hint/contact in the focus context.
    const lead = deal
      ? classInLeads.find((l) => deal.leadId && l.id === deal.leadId) ||
        classInLeads.find((l) => (l.name || "").toLowerCase().includes((deal.name || "").toLowerCase())) ||
        null
      : null;
    const entityOutcomes = deal ? outcomesForEntity(scopedOutcomes, { dealId: deal.id }) : [];
    // v1.4 CRM gap fill — resolves to null until the classin_crm_snapshot push lands (P0b/P1);
    // buildFocusOperatingContext degrades that to the existing "eeoCRM" missing[] entry.
    const crmFacts = deal
      ? await settled(getCrmPipeline({ ownerId: OWNER_ID, dealId: deal.id }), "crm-pipeline", missing)
      : null;
    context.focus = buildFocusOperatingContext({ deal, account, lead, entityOutcomes, brand, crmFacts });
  }

  return context;
}
