// 제품 카탈로그 읽기 모델 (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §3·§6).
// 제품 행에 연결 저장소·소속 프로젝트·최근 GitHub 신호를 붙여 돌려준다. 연결 후보(아직 제품이 없는
// 진행 중 프로젝트)는 제품 상세 "개발" 탭의 프로젝트 연결 선택지다.
//
// 봉투(CLAUDE.md Hub read 실패 봉투): 제품 행을 못 읽으면 status "error" — 빈 목록으로 위장하지 않는다.
// 0049 마이그레이션 전 DB는 error: "products-table-missing"으로 구분해 화면이 원인을 말하게 한다.
// 저장소·프로젝트·신호 중 하나라도 못 읽으면 status "partial"과 missing 목록을 싣는다.

import { fetchSupabaseRowsDetailed, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";

const PRODUCT_LIMIT = 200;
const SIGNAL_LIMIT = 150;
const SIGNALS_PER_PRODUCT = 12;

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

function mapProject(row) {
  return {
    id: row.id,
    productId: row.product_id || null,
    name: row.name || "이름 없는 프로젝트",
    status: row.status || "active",
    nextAction: row.next_action || null,
    dueAt: row.due_at || null,
    orgScope: row.meta?.org_scope || null,
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

export function mapProductRow(row) {
  const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    orgScope: row.org_scope,
    stage: row.stage,
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
} = {}) {
  if (!configured) {
    return { status: "preview", source: "preview", products: [], candidates: [], missing: [] };
  }

  const [products, repositories, projects, signals] = await Promise.all([
    fetchRows("products", { filters: withWorkspaceFilter(), order: "updated_at.desc", limit: PRODUCT_LIMIT }),
    fetchRows("product_repositories", { filters: withWorkspaceFilter(), order: "created_at.asc", limit: 500 }),
    fetchRows("projects", {
      select: "id,name,status,next_action,due_at,product_id,meta,updated_at",
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
  ]);

  if (!products?.rows) {
    const missingTable = isMissingTable(products?.error);
    return {
      status: "error",
      source: "error",
      error: missingTable ? "products-table-missing" : "products-read-failed",
      retryable: !missingTable,
      products: [],
      candidates: [],
      missing: [],
    };
  }

  const missing = [];
  if (!repositories?.rows) missing.push("repositories");
  if (!projects?.rows) missing.push("projects");
  if (!signals?.rows) missing.push("signals");

  const repoRows = (repositories?.rows || []).map(mapRepository);
  const projectRows = (projects?.rows || []).map(mapProject);
  const signalRows = (signals?.rows || []).map(mapSignal);

  const mapped = products.rows.map((row) => {
    const product = mapProductRow(row);
    return {
      ...product,
      repositories: repoRows.filter((repo) => repo.productId === product.id),
      projects: projectRows.filter((project) => project.productId === product.id),
      signals: signalRows.filter((signal) => signal.productId === product.id).slice(0, SIGNALS_PER_PRODUCT),
    };
  });
  // 연결 후보: 아직 제품이 없고 끝나지 않은 프로젝트. 완료 프로젝트는 제품 이력으로 붙일 이유가 약하다.
  const candidates = projectRows
    .filter((project) => !project.productId && project.status !== "completed")
    .map(({ id, name, status, orgScope }) => ({ id, name, status, orgScope }));

  return {
    status: missing.length || products.rows.length >= PRODUCT_LIMIT ? "partial" : "live",
    source: "supabase",
    products: mapped,
    candidates,
    missing,
  };
}
