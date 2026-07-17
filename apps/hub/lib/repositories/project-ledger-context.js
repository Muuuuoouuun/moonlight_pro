const CANONICAL_AREA_SLUGS = [
  "sales",
  "marketing",
  "content",
  "it",
  "ai-third-party-development",
  "personal-projects",
];
const CANONICAL_AREA_INDEX = new Map(
  CANONICAL_AREA_SLUGS.map((slug, index) => [slug, index]),
);
const LEAD_STATUSES = new Set(["new", "qualified", "nurturing", "won"]);
const CUSTOMER_ACCOUNT_STATUSES = new Set(["active", "paused"]);
const PROJECT_ORG_SCOPES = new Set(["classin", "personal"]);
const ENTITY_TYPE_ORDER = new Map([
  ["lead", 0],
  ["customer_account", 1],
]);

function clampProgress(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function normalizeProjectStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "draft") return "Planning";
  if (normalized === "blocked") return "Blocked";
  if (normalized === "completed") return "Done";
  if (normalized === "archived") return "Backlog";
  return "In progress";
}

function formatShortDate(value) {
  if (!value) return "미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatActivityTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function mapProjectAreas(rows = []) {
  return rows
    .filter((row) => row?.status === "active")
    .map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      canonical: CANONICAL_AREA_INDEX.has(row.slug),
    }))
    .sort((left, right) => {
      if (left.canonical && right.canonical) {
        return CANONICAL_AREA_INDEX.get(left.slug) - CANONICAL_AREA_INDEX.get(right.slug);
      }
      if (left.canonical) return -1;
      if (right.canonical) return 1;
      return String(left.name || "").localeCompare(String(right.name || ""), "ko");
    });
}

function projectEntity(type, row) {
  const prefix = type === "lead" ? "리드" : "고객";
  return {
    key: `${type}:${row.id}`,
    type,
    id: row.id,
    label: `${prefix} · ${row.name}`,
    status: row.status,
  };
}

export function buildProjectEntities(leadRows = [], accountRows = []) {
  return [
    ...leadRows
      .filter((row) => row?.id && row?.name && LEAD_STATUSES.has(row.status))
      .map((row) => projectEntity("lead", row)),
    ...accountRows
      .filter((row) => row?.id && row?.name && CUSTOMER_ACCOUNT_STATUSES.has(row.status))
      .map((row) => projectEntity("customer_account", row)),
  ].sort((left, right) => {
    const typeOrder = ENTITY_TYPE_ORDER.get(left.type) - ENTITY_TYPE_ORDER.get(right.type);
    return typeOrder || left.label.localeCompare(right.label, "ko");
  });
}

function resolveOrgScope(row, brand) {
  const rowScope = typeof row?.meta?.org_scope === "string"
    ? row.meta.org_scope.trim()
    : "";
  if (PROJECT_ORG_SCOPES.has(rowScope)) return rowScope;

  const brandScope = typeof brand?.orgScope === "string" ? brand.orgScope.trim() : "";
  if (PROJECT_ORG_SCOPES.has(brandScope)) return brandScope;
  return "personal";
}

function resolveEntity(row, leadById, accountById) {
  if (row.lead_id) {
    const lead = leadById.get(row.lead_id);
    return {
      entityRef: { type: "lead", id: row.lead_id },
      entityLabel: lead?.name ? `리드 · ${lead.name}` : null,
    };
  }
  if (row.customer_account_id) {
    const account = accountById.get(row.customer_account_id);
    return {
      entityRef: { type: "customer_account", id: row.customer_account_id },
      entityLabel: account?.name ? `고객 · ${account.name}` : null,
    };
  }
  return { entityRef: null, entityLabel: null };
}

export function mapProjectRows(rows = [], {
  brandById = new Map(),
  areaById = new Map(),
  leadById = new Map(),
  accountById = new Map(),
  taskStats = new Map(),
  updateStats = new Map(),
} = {}) {
  return rows.map((row) => {
    const brand = row.brand_id ? brandById.get(row.brand_id) : null;
    const area = row.area_id ? areaById.get(row.area_id) : null;
    const stats = taskStats.get(row.id) || { total: 0, done: 0 };
    const updates = updateStats.get(row.id) || { count: 0, latest: null };
    const latestProgress = Number.isFinite(updates.latest?.progress)
      ? updates.latest.progress
      : null;
    const projectProgress = clampProgress(row.progress);
    const orgScope = resolveOrgScope(row, brand);
    const entity = resolveEntity(row, leadById, accountById);
    const lastActivityAt = updates.latest?.happenedAt
      || row.last_activity_at
      || row.updated_at
      || row.created_at;

    return {
      id: row.id,
      areaId: row.area_id || null,
      areaName: area?.name || null,
      brandId: row.brand_id || null,
      brand: brand?.slug || "all",
      ...entity,
      orgScope,
      workspace: orgScope === "classin" ? "classin" : "brand",
      name: row.name,
      status: normalizeProjectStatus(row.status),
      statusKey: row.status || "active",
      priority: row.priority || "medium",
      progress: latestProgress ?? projectProgress,
      projectProgress,
      due: formatShortDate(row.due_at),
      dueAt: row.due_at || "",
      owner: row.owner_id ? "Me" : "Unassigned",
      tag: row.meta?.tag || null,
      tasks: stats.total,
      done: stats.done,
      changes: updates.count,
      summary: row.summary || updates.latest?.summary || row.next_action || "",
      projectSummary: row.summary || "",
      nextAction: row.next_action || updates.latest?.nextAction || "",
      projectNextAction: row.next_action || "",
      createdAt: row.created_at,
      createdAtLabel: formatShortDate(row.created_at),
      lastActivityAt,
      lastActivityLabel: formatActivityTime(lastActivityAt),
    };
  });
}
