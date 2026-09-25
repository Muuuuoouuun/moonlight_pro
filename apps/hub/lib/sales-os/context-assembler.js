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

export async function assembleSalesContext({ mode = "pipeline-triage", ref = null, guidanceId = null } = {}) {
  const missing = [];
  // A selected card or a customer-specific question receives no unrelated
  // ledger rows. A customer key always requires an exact ClassIn match.
  if (mode === "open-question" && (guidanceId || ref)) {
    // A card-only question can be answered from its reviewed reference. Reading
    // the ledger here adds latency and makes unrelated DB outages block advice.
    if (!ref) return { source: "reference", scope: "unscoped", missing };
    const ledger = await settled(getRevenueLedger(), "revenue-ledger", missing);
    if (!ledger || ledger.source === "preview" || ledger.source === "error") {
      missing.push({ source: "revenue-ledger", reason: ledger?.error || "revenue-ledger-unavailable" });
      return { source: ledger?.source === "preview" ? "preview" : "error", error: ledger?.error || "revenue ledger unavailable", missing };
    }
    if (ledger.partial) {
      missing.push({ source: "revenue-ledger", reason: "partial-read", failedSources: ledger.failedSources || [] });
    }
    const needle = String(ref).trim().toLowerCase();
    const classInDeals = (ledger.deals || []).filter(belongsToClassIn);
    const classInLeads = (ledger.leads || []).filter(belongsToClassIn);
    const classInAccounts = (ledger.accounts || []).filter(belongsToClassIn);
    const selectedDeal = classInDeals.find(row => row.id && String(row.id).toLowerCase() === needle) || null;
    const selectedLead = classInLeads.find(row => row.id && String(row.id).toLowerCase() === needle) || null;
    const selectedAccount = classInAccounts.find(row => row.id && String(row.id).toLowerCase() === needle) || null;
    const selected = selectedDeal || selectedLead || selectedAccount;
    if (!selected) {
      missing.push({ source: "revenue-ledger", reason: "reference-not-in-read" });
      return {
        source: "partial", scope: "unlinked", missing,
        contextBoundary: "요청한 식별자와 일치하는 ClassIn 기록이 이번 제한된 조회에 포함되지 않았습니다. 전체 원장의 부재를 뜻하지 않습니다.",
      };
    }

    const deals = selectedDeal ? [selectedDeal]
      : selectedLead ? classInDeals.filter(row => row.leadId === selectedLead.id
        || (!row.leadId && selectedLead.companyId && row.companyId === selectedLead.companyId)).slice(0, 5)
        : selectedAccount?.companyId ? classInDeals.filter(row => row.companyId === selectedAccount.companyId).slice(0, 5) : [];
    const leads = selectedLead ? [selectedLead]
      : selectedDeal?.leadId ? classInLeads.filter(row => row.id === selectedDeal.leadId).slice(0, 1)
        : selectedAccount?.companyId ? classInLeads.filter(row => row.companyId === selectedAccount.companyId).slice(0, 5) : [];
    const accounts = selectedAccount ? [selectedAccount] : [];
    let activities = await settled(getRecentContactActivities({ limit: 500 }), "crm_activities", missing);
    if (activities?.source === "error" || activities?.source === "preview") {
      missing.push({ source: "crm_activities", reason: activities.error || `crm_activities-${activities.source}` });
      activities = null;
    }
    const leadIds = new Set(leads.map(row => row.id));
    const dealIds = new Set(deals.map(row => row.id));
    const accountIds = new Set(accounts.map(row => row.id));
    const recent = (activities?.outcomes || []).map(normalizeOutcome).filter(Boolean)
      .filter(outcome => isLinkedClassInOutcome(outcome, leadIds, dealIds, accountIds));
    return {
      source: missing.length ? "partial" : ledger.source,
      scope: "linked",
      focus: { found: true, item_id: selected.id, item_type: selectedDeal ? "deal" : selectedLead ? "lead" : "account" },
      contextBoundary: "선택한 ClassIn 기록과 ID 또는 회사 ID로 연결된 기록만 포함합니다. 회사 ID로 연결된 거래는 조직 수준 참고이며 특정 리드 자체의 거래로 확정하지 않습니다. 다른 회사의 기록은 제공하지 않았습니다.",
      deals, leads, accounts,
      outcomes: { source: activities?.source || "preview", recent: trim(recent, 10) },
      missing,
    };
  }
  let [ledger, outcomesRes, content, runsRes] = await Promise.all([
    settled(getRevenueLedger(), "revenue-ledger", missing),
    // 0a: 연락 기록의 단일 원천은 crm_activities — 봉투·필드명은 예전 outcomes와 같다.
    // Scope before the final 30: recent personal rows must not consume every
    // slot available for ClassIn contacts. The underlying read stays bounded.
    settled(getRecentContactActivities({ limit: 500 }), "crm_activities", missing),
    settled(getContentLedger(), "content-ledger", missing),
    mode === "open-question"
      ? Promise.resolve(null)
      : settled(getRecentAgentRuns({ agent: "guru", ref, limit: 5 }), "agent_runs", missing),
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
    ...(mode === "open-question" && !ref ? { scope: "unscoped" } : {}),
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
    ...(mode === "open-question" ? {} : { memory: {
      recent_runs: trim((runsRes?.runs || []).filter(run => run.agent === "guru"), 5),
    } }),
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
