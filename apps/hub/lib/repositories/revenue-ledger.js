import {
  eqFilter,
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { getClassInTargets, isValidLeadFlag } from "@/lib/sales-os/operator-context";

const DEAL_STAGES = [
  { key: "lead", label: "Lead", color: "neutral" },
  { key: "qual", label: "Qualified", color: "info" },
  { key: "prop", label: "Proposal", color: "moon" },
  { key: "neg", label: "Negotiation", color: "warning" },
  { key: "won", label: "Won", color: "success" },
];

const STAGE_ALIASES = {
  prospect: "lead",
  new: "lead",
  qualified: "qual",
  nurturing: "qual",
  proposal: "prop",
  negotiation: "neg",
  won: "won",
  lost: "lost",
};

const LEAD_STAGE_LABEL = {
  new: "New",
  qualified: "Qualified",
  nurturing: "Contact",
  won: "Qualified",
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

function lowerText(...values) {
  return values
    .filter((v) => v != null)
    .map((v) => String(v).toLowerCase())
    .join(" ");
}

function metaNumber(meta, keys, fallback = 0) {
  for (const key of keys) {
    const value = meta?.[key];
    if (value == null || String(value).trim() === "") continue;
    const n = Number(String(value ?? "").replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function isCurrentMonth(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function resolveWorkspace(row) {
  const meta = row?.meta || {};
  if (meta.workspace) return meta.workspace;
  if (meta.lane === "classin_sales") return "classin";
  return null;
}

function resolveBrand(row) {
  const meta = row?.meta || {};
  return meta.brand || meta.brand_key || meta.brandKey || null;
}

function isClassInRaw(row) {
  const meta = row?.meta || {};
  if (meta.lane === "classin_sales" || meta.workspace === "classin") return true;
  const hay = lowerText(
    row?.source,
    row?.channel,
    row?.title,
    row?.name,
    meta.source_family,
    meta.campaign,
    meta.form_name,
    meta.intent,
    meta.note,
  );
  return /(classin|class in|클래스인|설명회|전자칠판|meta_ads|광고|캠페인)/.test(hay);
}

function normalizeStage(value) {
  const key = String(value || "").toLowerCase();
  return STAGE_ALIASES[key] || (DEAL_STAGES.some(s => s.key === key) ? key : "lead");
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
  const value = toNumber(meta.value ?? row?.score * 100000, 0);
  const units = toNumber(meta.units ?? meta.unit_count, 0);

  return {
    id: row.id,
    name: displayName,
    type,
    workspace: resolveWorkspace(row),
    brand: resolveBrand(row),
    source: row.source || row.channel || "—",
    stage: LEAD_STAGE_LABEL[statusKey] || "New",
    score: toNumber(row.score, 0),
    // Guru deal-review focus context reads these (context-schema.js) — keep them on the
    // projection so the 360 context no longer has to report them as missing[].
    nextAction: row.next_action || null,
    contactName: contact?.name || null,
    contactEmail: contact?.email || null,
    value: value ? formatMoneyLabel(value) : "—",
    // Lightweight tags (meta-backed). 유입경로 is `source` above; these four editable in the drawer.
    region: meta.region || "",
    scale: meta.scale || "",
    situation: meta.situation || "",
    campaign: meta.campaign || null,
    units: units > 0 ? units : "",
    last: formatRelative(row.last_touch_at || row.updated_at || row.created_at),
    owner: row.owner_id ? "Me" : "Unassigned",
  };
}

function mapDeal(row, companyById) {
  const type = resolveType(row);
  const company = row.company_id ? companyById.get(row.company_id) : null;
  const stage = normalizeStage(row.stage);
  const name = row.title || row.name || company?.name || "Untitled deal";

  return {
    id: row.id,
    leadId: row.lead_id || null, // ties the deal back to its lead for Guru focus context
    name,
    type,
    workspace: resolveWorkspace(row),
    brand: resolveBrand(row),
    stage,
    value: toNumber(row.amount, 0),
    owner: row.owner_id ? "Me" : "Unassigned",
    close: formatShortDate(row.expected_close_at),
    age: ageDays(row.last_activity_at || row.updated_at || row.created_at),
  };
}

function mapAccount(row, dealStatsByCompany, contactsByCompany) {
  const type = resolveType(row);
  const stats = (row.company_id && dealStatsByCompany.get(row.company_id)) || {
    deals: 0,
    value: 0,
  };
  const health = resolveHealth(row.health_score, row.status);
  const lastAt = row.updated_at || row.started_at || row.created_at;
  // Contacts attached from the company-grouped map. Only real `contacts` columns are mapped
  // (name/title/email — no `phone` column in schema.sql), with '' fallbacks for the display shape.
  const contacts = (row.company_id && contactsByCompany?.get(row.company_id)) || [];

  return {
    id: row.id,
    companyId: row.company_id || null,
    name: row.name,
    type,
    deals: stats.deals,
    value: stats.value,
    last: formatRelative(lastAt),
    lastAt: formatRelativeShort(lastAt),
    health,
    owner: row.owner_id ? "Me" : "Unassigned",
    contacts,
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

function buildClassInMonthlyKpi(leadRows, dealRows) {
  const targets = getClassInTargets();
  const classinLeads = (leadRows || []).filter(isClassInRaw);
  const classinDeals = (dealRows || []).filter(isClassInRaw);
  const wonThisMonth = classinDeals.filter((row) => {
    const stage = normalizeStage(row.stage);
    return stage === "won" && isCurrentMonth(row.won_at || row.closed_at || row.last_activity_at || row.updated_at || row.created_at);
  });

  const contracts = wonThisMonth.length;
  const units = wonThisMonth.reduce((sum, row) => sum + metaNumber(row.meta, ["unit_count", "units", "hardware_units"], 0), 0);
  const revenueCny = wonThisMonth.reduce((sum, row) => {
    const meta = row.meta || {};
    const explicit = metaNumber(meta, ["revenue_cny", "amount_cny"], null);
    if (explicit != null) return sum + explicit;
    const currency = String(meta.currency || row.currency || "").toUpperCase();
    return currency === "CNY" ? sum + toNumber(row.amount, 0) : sum;
  }, 0);
  const newLeads = classinLeads.filter((row) => isCurrentMonth(row.created_at || row.updated_at || row.last_touch_at)).length;
  const validLeads = classinLeads.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    return ["qualified", "nurturing", "won"].includes(status) || isValidLeadFlag(row);
  }).length;

  const pct = (value, target) => (target > 0 ? Math.round((value / target) * 1000) / 10 : 0);
  return {
    month: new Date().toISOString().slice(0, 7),
    targets,
    actual: { contracts, units, revenueCny, newLeads, validLeads },
    progress: {
      contractsPct: pct(contracts, targets.monthlyContractTarget),
      unitsPct: pct(units, targets.monthlyUnitTarget),
      revenuePct: pct(revenueCny, targets.monthlyRevenueTargetCny),
    },
    note: "ClassIn lane is inferred from meta.lane/workspace/source keywords until company CRM read adapters provide stronger facts.",
  };
}

function buildSummary(leads, deals, leadRows = [], dealRows = []) {
  const pipeline = deals.filter(d => d.stage !== "won" && d.stage !== "lost")
    .reduce((sum, d) => sum + d.value, 0);
  const wonMTD = deals.filter(d => d.stage === "won").reduce((sum, d) => sum + d.value, 0);
  const mrr = Math.round(wonMTD * 0.12);

  return {
    mrr,
    mrrPrev: Math.max(0, Math.round(mrr * 0.9)),
    pipeline,
    leadsCount: leads.length,
    newThisMonth: leads.filter(l => l.stage === "New").length,
    openDeals: deals.filter(d => d.stage !== "won" && d.stage !== "lost").length,
    wonMTD,
    classinMonthlyKpi: buildClassInMonthlyKpi(leadRows, dealRows),
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
      classinMonthlyKpi: buildClassInMonthlyKpi([], []),
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
        ["stage", inFilter(["prospect", "lead", "qualified", "qual", "proposal", "prop", "negotiation", "neg", "won", "lost"])],
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

  // Group contacts by company so each account projection can carry its own roster.
  // Shape mirrors the DetailPanel contacts tab; `phone` has no column in schema.sql → ''.
  const contactsByCompany = new Map();
  (contactRows || []).forEach(row => {
    if (!row.company_id) return;
    const list = contactsByCompany.get(row.company_id) || [];
    list.push({
      name: row.name || "",
      role: row.title || "",
      email: row.email || "",
      phone: "",
    });
    contactsByCompany.set(row.company_id, list);
  });

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
  const accounts = accountRows.map(row => mapAccount(row, dealStatsByCompany, contactsByCompany));
  const leads = leadRows.map(row => mapLead(row, companyById, contactById));
  const cases = caseRows.map(row => mapCase(row, accountRaw));
  const summary = buildSummary(leads, deals, leadRows, dealRows);

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
