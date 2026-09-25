// 제품 운영실 읽기 모델 (docs/superpowers/specs/2026-09-25-product-operations-room-design.md §0,
// 2026-09-24-product-dev-projects-draft.md §3). 제품마다 운영 상태·월 숫자·저장소·일(프로젝트, 할 일 수)·
// 최근 GitHub 신호·연결된 문의를 붙이고, 문의함용으로 모든 제품의 문의(제품 미정 포함)를 함께 돌려준다.
//
// 봉투(CLAUDE.md Hub read 실패 봉투): 제품 행을 못 읽으면 status "error" — 빈 목록으로 위장하지 않는다.
// 0049 마이그레이션 전 DB는 error: "products-table-missing"으로 구분해 화면이 원인을 말하게 한다.
// 나머지 원천 중 하나라도 못 읽으면 status "partial"과 missing 목록을 싣는다.

import { fetchSupabaseRowsDetailed, inFilter, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { previousMonth, seoulMonth } from "@/lib/product-catalog";

const PRODUCT_LIMIT = 200;
const SIGNAL_LIMIT = 150;
const SIGNALS_PER_PRODUCT = 12;
const INQUIRY_LINK_LIMIT = 500;
const RECENT_INQUIRY_LIMIT = 80;
const TASK_LIMIT = 2000;
const INQUIRY_COLUMNS = "id,subject,status,kind,org_scope,contact_name,contact_email,received_at,updated_at";

function isMissingTable(error) {
  const detail = `${error?.reason || ""} ${error?.detail || ""}`;
  return /PGRST205|42P01|does not exist|Could not find the table/i.test(detail);
}

function mapRepository(row) {
  return {
    id: row.id,
    productId: row.product_id,
    fullName: row.full_name,
    role: row.role || "app",
    defaultBranch: row.default_branch || "main",
    deployUrl: row.deploy_url || null,
    status: row.status || "connected",
    summary: row.last_summary && typeof row.last_summary === "object" ? row.last_summary : {},
    lastSyncedAt: row.last_synced_at || null,
    lastError: row.last_error || null,
  };
}

function mapProject(row, taskStats) {
  const stats = taskStats.get(row.id) || { total: 0, done: 0 };
  return {
    id: row.id,
    productId: row.product_id || null,
    name: row.name || "이름 없는 프로젝트",
    status: row.status || "active",
    nextAction: row.next_action || null,
    dueAt: row.due_at || null,
    orgScope: row.meta?.org_scope || null,
    workType: row.meta?.work_type || null,
    recurrence: row.meta?.recurrence || null,
    areaId: row.area_id || null,
    tasks: stats.total,
    tasksDone: stats.done,
    updatedAt: row.updated_at || null,
  };
}

function mapSignal(row) {
  return {
    id: row.id,
    productId: row.product_id,
    eventType: row.event_type,
    status: row.status,
    title: row.title,
    summary: row.summary || null,
    nextAction: row.next_action || null,
    happenedAt: row.happened_at,
    url: row.payload?.url || null,
    repository: row.payload?.repository || null,
  };
}

function mapInquiry(row, link) {
  return {
    id: row.id,
    subject: row.subject || "제목 없음",
    status: row.status || "new",
    kind: row.kind || "general",
    orgScope: row.org_scope || "unclassified",
    contactName: row.contact_name || "",
    contactEmail: row.contact_email || "",
    receivedAt: row.received_at || null,
    updatedAt: row.updated_at || null,
    productId: link?.product_id || null,
    projectId: link?.project_id || null,
    linkedAt: link?.linked_at || null,
  };
}

function mapMetric(row) {
  return {
    month: row.month,
    activeUsers: row.active_users ?? null,
    revenue: row.revenue === null || row.revenue === undefined ? null : Number(row.revenue),
    cost: row.cost === null || row.cost === undefined ? null : Number(row.cost),
    note: row.note || null,
    updatedAt: row.updated_at || null,
  };
}

export function mapProductRow(row) {
  const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    orgScope: row.org_scope,
    stage: row.stage,
    opsStatus: row.ops_status || "dev",
    opsNote: row.ops_note || null,
    details,
    version: Number(row.version || 1),
    stageHistory: Array.isArray(row.stage_history) ? row.stage_history : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProductLedger({
  fetchRows = fetchSupabaseRowsDetailed,
  configured = Boolean(resolveSupabaseConfig() && resolveDefaultWorkspaceId()),
  now = new Date(),
} = {}) {
  const empty = { products: [], candidates: [], inquiryCandidates: [], inquiries: [], areas: [], missing: [] };
  if (!configured) return { status: "preview", source: "preview", ...empty };

  const month = seoulMonth(now);
  const months = [month, previousMonth(month)];
  const [products, repositories, projects, signals, inquiryLinks, recentInquiries, metrics, areas] = await Promise.all([
    fetchRows("products", { filters: withWorkspaceFilter(), order: "updated_at.desc", limit: PRODUCT_LIMIT }),
    fetchRows("product_repositories", { filters: withWorkspaceFilter(), order: "created_at.asc", limit: 500 }),
    fetchRows("projects", {
      select: "id,name,status,next_action,due_at,product_id,area_id,meta,updated_at",
      filters: withWorkspaceFilter([["status", "not.in.(archived,cancelled)"]]),
      order: "updated_at.desc",
      limit: 500,
    }),
    fetchRows("project_updates", {
      select: "id,product_id,event_type,status,title,summary,next_action,happened_at,payload",
      filters: withWorkspaceFilter([["product_id", "not.is.null"]]),
      order: "happened_at.desc",
      limit: SIGNAL_LIMIT,
    }),
    fetchRows("product_inquiry_links", { filters: withWorkspaceFilter(), order: "linked_at.desc", limit: INQUIRY_LINK_LIMIT }),
    // 문의함: 제외 처리된 것을 뺀 최근 문의. 연결된 오래된 문의는 아래에서 id로 따로 읽는다.
    fetchRows("inquiries", {
      select: INQUIRY_COLUMNS,
      filters: withWorkspaceFilter([["status", "neq.ignored"], ["classification", "neq.ignored"]]),
      order: "received_at.desc",
      limit: RECENT_INQUIRY_LIMIT,
    }),
    fetchRows("product_monthly_metrics", { filters: withWorkspaceFilter([["month", inFilter(months)]]), limit: 1000 }),
    fetchRows("areas", { select: "id,name", filters: withWorkspaceFilter([["status", "eq.active"]]), order: "name.asc", limit: 100 }),
  ]);

  if (!products?.rows) {
    const missingTable = isMissingTable(products?.error);
    return {
      status: "error",
      source: "error",
      error: missingTable ? "products-table-missing" : "products-read-failed",
      retryable: !missingTable,
      ...empty,
    };
  }

  const missing = [];
  if (!repositories?.rows) missing.push("repositories");
  if (!projects?.rows) missing.push("projects");
  if (!signals?.rows) missing.push("signals");
  if (!metrics?.rows) missing.push("metrics");

  // 제품에 붙은 일의 할 일 수(완료/전체). 제품 없는 프로젝트의 할 일은 읽지 않는다.
  const projectRows = projects?.rows || [];
  const productProjectIds = projectRows.filter((row) => row.product_id).map((row) => row.id);
  const tasks = productProjectIds.length
    ? await fetchRows("tasks", { select: "id,project_id,status", filters: withWorkspaceFilter([["project_id", inFilter(productProjectIds)]]), limit: TASK_LIMIT })
    : { rows: [] };
  if (!tasks?.rows) missing.push("tasks");
  const taskStats = new Map();
  for (const task of tasks?.rows || []) {
    const stats = taskStats.get(task.project_id) || { total: 0, done: 0 };
    stats.total += 1;
    if (task.status === "done") stats.done += 1;
    taskStats.set(task.project_id, stats);
  }

  // 연결된 문의는 최근 목록 밖이어도 보이게 id로 읽는다.
  const links = inquiryLinks?.rows || [];
  const linkByInquiry = new Map(links.map((link) => [link.inquiry_id, link]));
  const recentRows = recentInquiries?.rows || [];
  const recentIds = new Set(recentRows.map((row) => row.id));
  const olderLinkedIds = links.map((link) => link.inquiry_id).filter((id) => id && !recentIds.has(id));
  const olderLinked = olderLinkedIds.length
    ? await fetchRows("inquiries", { select: INQUIRY_COLUMNS, filters: withWorkspaceFilter([["id", inFilter(olderLinkedIds)]]), limit: olderLinkedIds.length })
    : { rows: [] };
  if (!inquiryLinks?.rows || !recentInquiries?.rows || !olderLinked?.rows) missing.push("inquiries");
  const inquiries = [...recentRows, ...(olderLinked?.rows || [])]
    .filter((row) => row.status !== "ignored")
    .map((row) => mapInquiry(row, linkByInquiry.get(row.id)))
    .sort((a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || "")));

  const repoRows = (repositories?.rows || []).map(mapRepository);
  const mappedProjects = projectRows.map((row) => mapProject(row, taskStats));
  const signalRows = (signals?.rows || []).map(mapSignal);
  const metricRows = (metrics?.rows || []).map((row) => ({ productId: row.product_id, ...mapMetric(row) }));
  const requestCount = new Map();
  for (const inquiry of inquiries) {
    if (inquiry.projectId) requestCount.set(inquiry.projectId, (requestCount.get(inquiry.projectId) || 0) + 1);
  }

  const mapped = products.rows.map((row) => {
    const product = mapProductRow(row);
    return {
      ...product,
      repositories: repoRows.filter((repo) => repo.productId === product.id),
      projects: mappedProjects
        .filter((project) => project.productId === product.id)
        .map((project) => ({ ...project, requests: requestCount.get(project.id) || 0 })),
      signals: signalRows.filter((signal) => signal.productId === product.id).slice(0, SIGNALS_PER_PRODUCT),
      inquiries: inquiries.filter((inquiry) => inquiry.productId === product.id),
      metrics: metricRows.filter((metric) => metric.productId === product.id).map(({ productId, ...metric }) => metric),
    };
  });
  // 연결 후보: 아직 제품이 없고 끝나지 않은 프로젝트.
  const candidates = mappedProjects
    .filter((project) => !project.productId && project.status !== "completed")
    .map(({ id, name, status, orgScope }) => ({ id, name, status, orgScope }));
  const inquiryCandidates = inquiries.filter((inquiry) => !inquiry.productId && inquiry.status !== "closed");

  return {
    status: missing.length || products.rows.length >= PRODUCT_LIMIT ? "partial" : "live",
    source: "supabase",
    month,
    products: mapped,
    candidates,
    inquiryCandidates,
    inquiries,
    areas: (areas?.rows || []).map((row) => ({ id: row.id, name: row.name })),
    missing,
  };
}
