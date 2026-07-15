import {
  eqFilter,
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { resolveLeadEnrichmentView } from "../sales-os/lead-view.js";
import { DEAL_STAGES, STAGE_ALIASES, LEGACY_DB_STAGE_VALUES } from "../deal-stages.js";

const LEAD_STAGE_LABEL = {
  new: "New",
  qualified: "Qualified",
  nurturing: "Contact",
  won: "Customer",
  lost: "Lost",
};

const CASE_STATUS_LABEL = {
  active: "Open",
  waiting: "Waiting",
  blocked: "Open",
  closed: "Resolved",
};

const CASE_PRIORITY = new Set(["low", "medium", "high", "critical"]);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStage(value) {
  const key = String(value || "").toLowerCase();
  return STAGE_ALIASES[key] || (DEAL_STAGES.some(s => s.key === key) ? key : "potential");
}

// Display stage: meta.stage_detail (fine-grained, written by buildDealWrite) wins over the
// coarse CHECK-constrained column — legacy rows without it fall back to the column aliases.
function resolveDealStage(row) {
  const detail = String(row?.meta?.stage_detail || "").toLowerCase();
  if (detail === "lost" || DEAL_STAGES.some(s => s.key === detail)) return detail;
  return normalizeStage(row?.stage);
}

function formatShortDate(value) {
  if (!value) return "미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date);
}

function formatRelative(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const now = Date.now();
  const diffDays = Math.round((now - date.getTime()) / 86400000);
  if (diffDays <= 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  return formatShortDate(value);
}

function formatRelativeShort(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffDays = Math.round((Date.now() - date.getTime()) / 86400000);
  if (diffDays <= 0) {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
  return `${diffDays}d`;
}

function formatMoneyLabel(amount) {
  const n = toNumber(amount, 0);
  if (n >= 1000000) return `₩${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₩${(n / 1000).toFixed(0)}K`;
  return `₩${n}`;
}

function ageDays(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
}

function resolveType(row) {
  const metaKind = row?.meta?.account_kind || row?.meta?.type || row?.meta?.kind;
  if (metaKind === "individual" || metaKind === "personal") return "personal";
  if (metaKind === "company" || metaKind === "business") return "company";
  return row?.company_id ? "company" : "personal";
}

// Explicit workspace tag from meta (set by in-workspace creates via buildLeadWrite/
// buildDealWrite) → the Revenue pages' workspace-map scoping matches on this first, so a
// scoped create survives a live save + reload. `classin_sales` lane is an alias for classin.
function resolveWorkspace(row) {
  const meta = row?.meta || {};
  if (meta.workspace) return meta.workspace;
  if (meta.lane === "classin_sales") return "classin";
  return null;
}

// Brand key from meta (various live-source slugs) — feeds brandInWorkspace() so a
// record follows its brand's org scope when it carries no explicit workspace tag.
function resolveBrand(row) {
  const meta = row?.meta || {};
  return meta.brand || meta.brand_key || meta.brandKey || null;
}

function mapLead(row, companyById, contactById) {
  const type = resolveType(row);
  const company = row.company_id ? companyById.get(row.company_id) : null;
  const contact = row.contact_id ? contactById.get(row.contact_id) : null;
  const displayName =
    row.name ||
    (company && contact ? `${company.name} — ${contact.name}` : null) ||
    company?.name ||
    contact?.name ||
    row.email ||
    "Unnamed lead";

  const statusKey = String(row.status || "new").toLowerCase();
  const meta = row?.meta || {};
  const enrichmentView = resolveLeadEnrichmentView(row);
  const value = enrichmentView.valueAmount || 0;
  const units = toNumber(meta.units ?? meta.unit_count, 0);

  return {
    id: row.id,
    name: displayName,
    type,
    // Scoping tags — workspace-map matches on these; also the round-trip target for the
    // Leads EditDrawer's workspace-tagged creates.
    workspace: resolveWorkspace(row),
    brand: resolveBrand(row),
    source: row.source || row.channel || "—",
    stage: LEAD_STAGE_LABEL[statusKey] || "New",
    // Raw follow-up score (0–100) for the Segments score-band grouping; null = unscored.
    score: enrichmentView.score,
    value: value ? formatMoneyLabel(value) : "—",
    // Lightweight meta-backed tags — editable in the Leads EditDrawer, reversed by
    // buildLeadWrite. '' fallbacks keep the drawer inputs controlled.
    region: enrichmentView.region,
    scale: meta.scale || "",
    situation: meta.situation || "",
    units: units > 0 ? units : "",
    contactName: contact?.name || null,
    contactEmail: contact?.email || null,
    last: formatRelative(row.last_touch_at || row.updated_at || row.created_at),
    owner: enrichmentView.owner,
    priorityLane: enrichmentView.priorityLane,
    nextAction: enrichmentView.nextAction,
    enrichmentTags: enrichmentView.enrichmentTags,
    engagementState: enrichmentView.engagementState,
    publicEvidenceCount: enrichmentView.publicEvidenceCount,
    activityEvidence: enrichmentView.activityEvidence,
  };
}

function mapDeal(row, companyById) {
  const type = resolveType(row);
  const company = row.company_id ? companyById.get(row.company_id) : null;
  const stage = resolveDealStage(row);
  const name = row.title || row.name || company?.name || "Untitled deal";

  return {
    id: row.id,
    leadId: row.lead_id || null, // ties the deal back to its lead (deep-link + focus context)
    name,
    type,
    // Scoping tags — workspace-map matches on these; round-trip target for scoped creates.
    workspace: resolveWorkspace(row),
    brand: resolveBrand(row),
    stage,
    value: toNumber(row.amount, 0),
    owner: row.owner_id ? "Me" : "Unassigned",
    close: formatShortDate(row.expected_close_at),
    // Raw ISO timestamps for cross-lane consumers (attention-ledger buckets by closeAt and
    // sorts recency by activityAt) — the display fields above stay label-only.
    closeAt: row.expected_close_at || "",
    activityAt: row.last_activity_at || row.updated_at || row.created_at || "",
    age: ageDays(row.last_activity_at || row.updated_at || row.created_at),
  };
}

function mapAccount(row, dealStatsByCompany) {
  const type = resolveType(row);
  const stats = (row.company_id && dealStatsByCompany.get(row.company_id)) || {
    deals: 0,
    value: 0,
  };
  const health = resolveHealth(row.health_score, row.status);
  const lastAt = row.updated_at || row.started_at || row.created_at;

  return {
    name: row.name,
    type,
    deals: stats.deals,
    value: stats.value,
    last: formatRelative(lastAt),
    lastAt: formatRelativeShort(lastAt),
    health,
    owner: row.owner_id ? "Me" : "Unassigned",
  };
}

function resolveHealth(score, status) {
  if (status === "closed") return "risk";
  const n = Number(score);
  if (!Number.isFinite(n)) return "ok";
  if (n < 40) return "risk";
  if (n < 70) return "warning";
  return "ok";
}

function mapCase(row, accountById) {
  const account = row.customer_account_id ? accountById.get(row.customer_account_id) : null;
  const type = account ? resolveType(account) : resolveType(row);
  const statusKey = String(row.status || "active").toLowerCase();
  const priorityRaw = String(row.priority || "medium").toLowerCase();
  const priority = CASE_PRIORITY.has(priorityRaw) ? priorityRaw : "medium";
  const priorityDisplay = priority === "critical" ? "high" : priority === "medium" ? "med" : priority;

  return {
    id: row.id,
    title: row.title || "Untitled case",
    account: account?.name || "—",
    type,
    status: CASE_STATUS_LABEL[statusKey] || "Open",
    priority: priorityDisplay,
    opened: formatRelative(row.opened_at || row.created_at),
    owner: row.owner_id ? "Me" : "Unassigned",
  };
}

function buildSummary(leads, deals) {
  const pipeline = deals.filter(d => d.stage !== "closing" && d.stage !== "lost")
    .reduce((sum, d) => sum + d.value, 0);
  const wonMTD = deals.filter(d => d.stage === "closing").reduce((sum, d) => sum + d.value, 0);
  const mrr = Math.round(wonMTD * 0.12);

  return {
    mrr,
    mrrPrev: Math.max(0, Math.round(mrr * 0.9)),
    pipeline,
    leadsCount: leads.length,
    newThisMonth: leads.filter(l => l.stage === "New").length,
    openDeals: deals.filter(d => d.stage !== "closing" && d.stage !== "lost").length,
    wonMTD,
  };
}

function emptyLedger(configured, workspaceId) {
  return {
    source: "preview",
    configured,
    workspaceId,
    leads: [],
    deals: [],
    accounts: [],
    cases: [],
    stages: DEAL_STAGES,
    summary: {
      mrr: 0,
      mrrPrev: 0,
      pipeline: 0,
      leadsCount: 0,
      newThisMonth: 0,
      openDeals: 0,
      wonMTD: 0,
    },
  };
}

export async function getRevenueLedger() {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return emptyLedger(false, null);
  }

  const [leadRows, dealRows, accountRows, caseRows, companyRows, contactRows] = await Promise.all([
    fetchSupabaseRows("leads", {
      limit: 120,
      order: "last_touch_at.desc.nullslast",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("deals", {
      limit: 120,
      order: "updated_at.desc.nullslast",
      filters: withWorkspaceFilter([
        ["stage", inFilter(LEGACY_DB_STAGE_VALUES)],
      ]),
    }),
    fetchSupabaseRows("customer_accounts", {
      limit: 120,
      order: "updated_at.desc.nullslast",
      filters: withWorkspaceFilter([["status", inFilter(["active", "paused", "closed"])]]),
    }),
    fetchSupabaseRows("operation_cases", {
      limit: 120,
      order: "opened_at.desc.nullslast",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("companies", {
      limit: 200,
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("contacts", {
      limit: 200,
      filters: withWorkspaceFilter(),
    }),
  ]);

  if (!leadRows || !dealRows || !accountRows || !caseRows) {
    return { ...emptyLedger(true, workspaceId), source: "preview" };
  }

  const companyById = new Map((companyRows || []).map(c => [c.id, c]));
  const contactById = new Map((contactRows || []).map(c => [c.id, c]));

  const deals = dealRows.map(row => mapDeal(row, companyById));
  const dealStatsByCompany = new Map();
  dealRows.forEach(row => {
    if (!row.company_id) return;
    const stats = dealStatsByCompany.get(row.company_id) || { deals: 0, value: 0 };
    stats.deals += 1;
    stats.value += toNumber(row.amount, 0);
    dealStatsByCompany.set(row.company_id, stats);
  });

  const accountRaw = new Map(accountRows.map(a => [a.id, a]));
  const accounts = accountRows.map(row => mapAccount(row, dealStatsByCompany));
  const leads = leadRows.map(row => mapLead(row, companyById, contactById));
  const cases = caseRows.map(row => mapCase(row, accountRaw));
  const summary = buildSummary(leads, deals);

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    leads,
    deals,
    accounts,
    cases,
    stages: DEAL_STAGES,
    summary,
  };
}
