// 제품 카탈로그·저장소 연결 명령 (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §4·§5.1).
// 정규화(normalizeProductCommand)는 순수 함수이고, 실행(executeProductCommand)은 읽기·쓰기 의존성을
// 주입받는다 — pms-command / pms-command-service와 같은 분리다.
//
// 계약:
// - 필수 칸은 이름과 한 줄 설명뿐이다. 나머지는 details에 들어가고 단계가 올라갈 때 화면이 요구한다.
// - 단계 게이트는 막지 않는다(§4.1) — 서버는 유지·종료로 내릴 때의 이유 한 줄만 강제한다.
// - 제공 범위·필수 조건이 바뀌면 version이 오른다(§4). 적합도 결정의 재확인 트리거다.
// - 저장소는 제품 하나에만 속한다. 이미 다른 제품에 붙은 저장소는 conflict로 돌려준다.
// - 제품 카드는 분야에 묶인 칸(과목·지역·규모)을 두지 않는다 — 분야·대상 고객은 짧은 자유 서술,
//   세부는 특이사항에 적는다(2026-09-25 운영자: "교육일지 아닐지 모르고 한계에 갇힌다").
// - 문의 하나는 제품 하나에만 붙는다(product_inquiry_links). inquiries 자체는 건드리지 않는다.

type Row = Record<string, unknown>;

type PersistenceResult = {
  persisted: boolean;
  reason: string;
  detail?: string;
  record?: Row | null;
  records?: Row[];
};

export type ProductDependencies = {
  insert: (table: string, record: Row) => Promise<PersistenceResult>;
  update: (table: string, filters: Array<[string, string]>, patch: Row) => Promise<PersistenceResult>;
  remove: (table: string, filters: Array<[string, string]>) => Promise<PersistenceResult>;
  fetchRows: (table: string, options?: Row) => Promise<Row[] | null>;
};

type Context = { workspaceId?: string; now?: string };

export const PRODUCT_STAGES = ["idea", "validation", "mvp", "launch", "growth", "maintain", "sunset"] as const;
const STAGE_SET = new Set<string>(PRODUCT_STAGES);
// 유지·종료로 내릴 때는 이유 한 줄이 게이트다(§4.1 "유지 · 종료 | 이유 한 줄").
const STAGES_REQUIRING_REASON = new Set(["maintain", "sunset"]);
const ORG_SCOPES = new Set(["personal", "classin"]);
const PRICING_MODELS = new Set(["undecided", "free", "monthly", "per_use", "one_time"]);
const REPOSITORY_STATUSES = new Set(["connected", "disabled"]);

export const PRODUCT_ACTIONS = new Set([
  "create_product", "update_product", "connect_repository", "update_repository", "disconnect_repository",
  "link_inquiry", "unlink_inquiry",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REPO_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/;

function has(input: Row, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuid(value: unknown) {
  const normalized = text(value, 100);
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function validDay(value: string) {
  if (!DAY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function httpUrl(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const raw = text(value, 501);
  if (!raw || raw.length > 500 || !/^https?:\/\//i.test(raw)) return { ok: false };
  try {
    new URL(raw);
  } catch {
    return { ok: false };
  }
  return { ok: true, value: raw };
}

// GitHub 저장소 표기: owner/repo, https://github.com/owner/repo(.git) 모두 받아 소문자 owner/repo로.
export function normalizeRepositoryName(value: unknown) {
  const raw = text(value, 300)
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return REPO_PATTERN.test(raw) && raw.length <= 200 ? raw : null;
}

type ProductDetails = {
  domain: string;
  audience: string;
  problem: string;
  notes: string;
  capabilities: Array<{ id: string; text: string; verifiedAt: string | null }>;
  requirements: Array<{ id: string; text: string }>;
  pricing: { model: string; amount: number | null; currency: "KRW" };
  deployUrl: string | null;
  links: Array<{ label: string; url: string }>;
  nextAction: string;
};

export function emptyProductDetails(): ProductDetails {
  return {
    domain: "",
    audience: "",
    problem: "",
    notes: "",
    capabilities: [],
    requirements: [],
    pricing: { model: "undecided", amount: null, currency: "KRW" },
    deployUrl: null,
    links: [],
    nextAction: "",
  };
}

// details는 부분 입력을 받는다 — 들어온 키만 검증해 돌려주고, 병합은 서비스가 현재 행과 한다.
export function normalizeProductDetails(value: unknown): { ok: true; value: Partial<ProductDetails> } | { ok: false; reason: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "invalid-details" };
  const input = value as Row;
  const out: Partial<ProductDetails> = {};

  // 자유 서술 칸: [키, 최대 길이, 오류 코드]. 분야는 "교육"처럼 짧게, 세부는 특이사항에.
  const FREE_TEXT: Array<["domain" | "audience" | "problem" | "notes", number, string]> = [
    ["domain", 40, "invalid-domain"],
    ["audience", 200, "invalid-audience"],
    ["problem", 1000, "invalid-problem"],
    ["notes", 2000, "invalid-notes"],
  ];
  for (const [key, max, reason] of FREE_TEXT) {
    if (!has(input, key)) continue;
    const value = typeof input[key] === "string" ? (input[key] as string).trim() : "";
    if (value.length > max) return { ok: false, reason };
    out[key] = value;
  }
  if (has(input, "capabilities")) {
    if (!Array.isArray(input.capabilities) || input.capabilities.length > 30) return { ok: false, reason: "invalid-capabilities" };
    const ids = new Set<string>();
    const items: ProductDetails["capabilities"] = [];
    for (const raw of input.capabilities) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "invalid-capability" };
      const item = raw as Row;
      const id = uuid(item.id);
      const itemText = typeof item.text === "string" ? item.text.trim() : "";
      const verifiedAt = item.verifiedAt === null || item.verifiedAt === undefined || item.verifiedAt === ""
        ? null
        : text(item.verifiedAt, 10);
      if (!id || ids.has(id) || !itemText || itemText.length > 200) return { ok: false, reason: "invalid-capability" };
      if (verifiedAt !== null && !validDay(verifiedAt)) return { ok: false, reason: "invalid-capability-date" };
      ids.add(id);
      items.push({ id, text: itemText, verifiedAt });
    }
    out.capabilities = items;
  }
  if (has(input, "requirements")) {
    if (!Array.isArray(input.requirements) || input.requirements.length > 20) return { ok: false, reason: "invalid-requirements" };
    const ids = new Set<string>();
    const items: ProductDetails["requirements"] = [];
    for (const raw of input.requirements) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "invalid-requirement" };
      const item = raw as Row;
      const id = uuid(item.id);
      const itemText = typeof item.text === "string" ? item.text.trim() : "";
      if (!id || ids.has(id) || !itemText || itemText.length > 200) return { ok: false, reason: "invalid-requirement" };
      ids.add(id);
      items.push({ id, text: itemText });
    }
    out.requirements = items;
  }
  if (has(input, "pricing")) {
    const pricing = input.pricing;
    if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) return { ok: false, reason: "invalid-pricing" };
    const p = pricing as Row;
    const model = text(p.model, 20) || "undecided";
    const amountRaw = p.amount;
    const amount = amountRaw === null || amountRaw === undefined || amountRaw === ""
      ? null
      : Number(amountRaw);
    if (!PRICING_MODELS.has(model)) return { ok: false, reason: "invalid-pricing-model" };
    if (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000_000)) {
      return { ok: false, reason: "invalid-pricing-amount" };
    }
    out.pricing = { model, amount: model === "free" ? 0 : amount, currency: "KRW" };
  }
  if (has(input, "deployUrl")) {
    const deployUrl = httpUrl(input.deployUrl);
    if (!deployUrl.ok) return { ok: false, reason: "invalid-deploy-url" };
    out.deployUrl = deployUrl.value;
  }
  if (has(input, "links")) {
    if (!Array.isArray(input.links) || input.links.length > 10) return { ok: false, reason: "invalid-links" };
    const links: ProductDetails["links"] = [];
    for (const raw of input.links) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "invalid-link" };
      const item = raw as Row;
      const label = text(item.label, 41);
      const url = httpUrl(item.url);
      if (!label || label.length > 40 || !url.ok || !url.value) return { ok: false, reason: "invalid-link" };
      links.push({ label, url: url.value });
    }
    out.links = links;
  }
  if (has(input, "nextAction")) {
    const nextAction = typeof input.nextAction === "string" ? input.nextAction.trim() : "";
    if (nextAction.length > 300) return { ok: false, reason: "invalid-next-action" };
    out.nextAction = nextAction;
  }
  return { ok: true, value: out };
}

// 제공 범위·필수 조건의 "무엇을 약속하는가"만 비교한다 — 확인일만 바뀐 것은 새 버전이 아니다.
function contractSignature(details: Row) {
  const capabilities = Array.isArray(details.capabilities) ? details.capabilities as Row[] : [];
  const requirements = Array.isArray(details.requirements) ? details.requirements as Row[] : [];
  return JSON.stringify({
    c: capabilities.map((item) => String(item.text || "")).sort(),
    r: requirements.map((item) => String(item.text || "")).sort(),
  });
}

type Normalized =
  | { ok: true; action: string; table: "products" | "product_repositories" | "product_inquiry_links"; record?: Row; filters?: Array<[string, string]>; patch?: Row; stageReason?: string }
  | { ok: false; reason: string };

export function normalizeProductCommand(input: Row = {}, context: Context = {}): Normalized {
  const action = text(input.action, 50).toLowerCase();
  const workspaceId = uuid(context.workspaceId);
  const now = context.now || new Date().toISOString();
  if (!workspaceId) return { ok: false, reason: "missing-workspace" };
  if (!PRODUCT_ACTIONS.has(action)) return { ok: false, reason: "unsupported-action" };

  if (action === "create_product") {
    const id = uuid(input.id);
    const name = text(input.name, 121);
    const summary = text(input.summary, 201);
    const orgScope = text(input.orgScope ?? input.org_scope, 20).toLowerCase();
    const stage = text(input.stage || "idea", 20).toLowerCase();
    if (!id) return { ok: false, reason: "invalid-id" };
    if (!name || name.length > 120) return { ok: false, reason: "missing-name" };
    if (!summary || summary.length > 200) return { ok: false, reason: "missing-summary" };
    if (!ORG_SCOPES.has(orgScope)) return { ok: false, reason: "invalid-org-scope" };
    if (!STAGE_SET.has(stage)) return { ok: false, reason: "invalid-stage" };
    const details = has(input, "details") ? normalizeProductDetails(input.details) : { ok: true as const, value: {} };
    if (!details.ok) return { ok: false, reason: details.reason };
    return {
      ok: true,
      action,
      table: "products",
      record: {
        id,
        workspace_id: workspaceId,
        name,
        summary,
        org_scope: orgScope,
        stage,
        details: { ...emptyProductDetails(), ...details.value },
        version: 1,
        stage_history: [{ at: now, from: null, to: stage, reason: "제품 등록" }],
        created_at: now,
        updated_at: now,
      },
    };
  }

  if (action === "update_product") {
    const id = uuid(input.id);
    if (!id) return { ok: false, reason: "invalid-id" };
    if (has(input, "orgScope") || has(input, "org_scope")) return { ok: false, reason: "unsupported-org-scope-update" };
    const filters: Array<[string, string]> = [["id", `eq.${id}`], ["workspace_id", `eq.${workspaceId}`]];
    const expected = text(input.expectedUpdatedAt ?? input.expected_updated_at, 100);
    if (expected) {
      if (Number.isNaN(new Date(expected).getTime())) return { ok: false, reason: "invalid-expected-updated-at" };
      filters.push(["updated_at", `eq.${expected}`]);
    }
    const patch: Row = {};
    if (has(input, "name")) {
      const name = text(input.name, 121);
      if (!name || name.length > 120) return { ok: false, reason: "missing-name" };
      patch.name = name;
    }
    if (has(input, "summary")) {
      const summary = text(input.summary, 201);
      if (!summary || summary.length > 200) return { ok: false, reason: "missing-summary" };
      patch.summary = summary;
    }
    let stageReason = "";
    if (has(input, "stage")) {
      const stage = text(input.stage, 20).toLowerCase();
      if (!STAGE_SET.has(stage)) return { ok: false, reason: "invalid-stage" };
      stageReason = text(input.stageReason, 301);
      if (stageReason.length > 300) return { ok: false, reason: "invalid-stage-reason" };
      patch.stage = stage;
    }
    if (has(input, "details")) {
      const details = normalizeProductDetails(input.details);
      if (!details.ok) return { ok: false, reason: details.reason };
      patch.details = details.value;
    }
    if (!Object.keys(patch).length) return { ok: false, reason: "empty-patch" };
    patch.updated_at = now;
    return { ok: true, action, table: "products", filters, patch, stageReason };
  }

  if (action === "connect_repository") {
    const id = uuid(input.id);
    const productId = uuid(input.productId ?? input.product_id);
    const fullName = normalizeRepositoryName(input.fullName ?? input.full_name);
    const role = text(input.role || "app", 31);
    const defaultBranch = text(input.defaultBranch ?? input.default_branch, 101) || "main";
    const deployUrl = httpUrl(input.deployUrl ?? input.deploy_url);
    if (!id) return { ok: false, reason: "invalid-id" };
    if (!productId) return { ok: false, reason: "invalid-product-id" };
    if (!fullName) return { ok: false, reason: "invalid-repository-name" };
    if (!role || role.length > 30) return { ok: false, reason: "invalid-role" };
    if (defaultBranch.length > 100) return { ok: false, reason: "invalid-default-branch" };
    if (!deployUrl.ok) return { ok: false, reason: "invalid-deploy-url" };
    return {
      ok: true,
      action,
      table: "product_repositories",
      record: {
        id,
        workspace_id: workspaceId,
        product_id: productId,
        full_name: fullName,
        role,
        default_branch: defaultBranch,
        deploy_url: deployUrl.value,
        status: "connected",
        created_at: now,
        updated_at: now,
      },
    };
  }

  if (action === "link_inquiry" || action === "unlink_inquiry") {
    const inquiryId = uuid(input.inquiryId ?? input.inquiry_id);
    if (!inquiryId) return { ok: false, reason: "invalid-inquiry-id" };
    const filters: Array<[string, string]> = [["workspace_id", `eq.${workspaceId}`], ["inquiry_id", `eq.${inquiryId}`]];
    if (action === "unlink_inquiry") return { ok: true, action, table: "product_inquiry_links", filters };
    const productId = uuid(input.productId ?? input.product_id);
    if (!productId) return { ok: false, reason: "invalid-product-id" };
    return {
      ok: true,
      action,
      table: "product_inquiry_links",
      filters,
      record: { workspace_id: workspaceId, inquiry_id: inquiryId, product_id: productId, linked_at: now },
    };
  }

  const id = uuid(input.id);
  if (!id) return { ok: false, reason: "invalid-id" };
  const filters: Array<[string, string]> = [["id", `eq.${id}`], ["workspace_id", `eq.${workspaceId}`]];

  if (action === "update_repository") {
    const patch: Row = {};
    if (has(input, "role")) {
      const role = text(input.role, 31);
      if (!role || role.length > 30) return { ok: false, reason: "invalid-role" };
      patch.role = role;
    }
    if (has(input, "defaultBranch") || has(input, "default_branch")) {
      const branch = text(input.defaultBranch ?? input.default_branch, 101);
      if (!branch || branch.length > 100) return { ok: false, reason: "invalid-default-branch" };
      patch.default_branch = branch;
    }
    if (has(input, "deployUrl") || has(input, "deploy_url")) {
      const deployUrl = httpUrl(input.deployUrl ?? input.deploy_url);
      if (!deployUrl.ok) return { ok: false, reason: "invalid-deploy-url" };
      patch.deploy_url = deployUrl.value;
    }
    if (has(input, "status")) {
      const status = text(input.status, 20).toLowerCase();
      if (!REPOSITORY_STATUSES.has(status)) return { ok: false, reason: "invalid-repository-status" };
      patch.status = status;
    }
    if (!Object.keys(patch).length) return { ok: false, reason: "empty-patch" };
    patch.updated_at = now;
    return { ok: true, action, table: "product_repositories", filters, patch };
  }

  // disconnect_repository — 연결 행만 지운다. 저장소·제품·지난 신호(project_updates)는 남는다.
  return { ok: true, action, table: "product_repositories", filters };
}

function filterValue(filters: Array<[string, string]> | undefined, key: string) {
  const value = filters?.find(([filterKey]) => filterKey === key)?.[1];
  return value?.startsWith("eq.") ? value.slice(3) : null;
}

function comparable(value: unknown) {
  if (typeof value !== "string") return value ?? null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function canonicalCreate(action: string, row: Row) {
  if (action === "create_product") {
    return JSON.stringify({ name: row.name, summary: row.summary, org_scope: row.org_scope });
  }
  return JSON.stringify({ product_id: row.product_id, full_name: row.full_name });
}

export async function executeProductCommand(input: Row, context: Context, deps: ProductDependencies) {
  const command = normalizeProductCommand(input, context);
  if (!command.ok) return { status: "invalid-input", error: command.reason };
  const now = context.now || new Date().toISOString();
  const workspaceId = String(context.workspaceId);

  if (command.table === "product_inquiry_links") return executeInquiryLink(command, workspaceId, deps);

  if (command.record) {
    if (command.table === "product_repositories") {
      // 저장소가 가리키는 제품이 이 워크스페이스에 있어야 한다.
      const products = await deps.fetchRows("products", {
        select: "id",
        filters: [["id", `eq.${command.record.product_id}`], ["workspace_id", `eq.${workspaceId}`]],
        limit: 1,
      });
      if (products === null) return { status: "error", error: "relationship-check-failed" };
      if (!products[0]) return { status: "invalid-input", error: "invalid-product-reference" };
    }
    const persistence = await deps.insert(command.table, command.record);
    if (persistence.persisted) return { status: "saved", action: command.action, entity: persistence.record || command.record };
    if (persistence.reason !== "duplicate") return { status: "error", error: persistence.reason, detail: persistence.detail || null };

    // 같은 id 재시도(duplicate) 또는 같은 저장소 재연결(unique full_name)을 가른다.
    const byId = await deps.fetchRows(command.table, {
      filters: [["id", `eq.${command.record.id}`], ["workspace_id", `eq.${workspaceId}`]],
      limit: 1,
    });
    if (byId === null) return { status: "error", error: "current-entity-read-failed" };
    if (byId[0]) {
      return canonicalCreate(command.action, byId[0]) === canonicalCreate(command.action, command.record)
        ? { status: "duplicate", action: command.action, entity: byId[0] }
        : { status: "conflict", action: command.action, error: "id-reuse-payload-mismatch", retryable: false, entity: byId[0] };
    }
    if (command.table === "product_repositories") {
      const byName = await deps.fetchRows("product_repositories", {
        filters: [["full_name", `eq.${command.record.full_name}`], ["workspace_id", `eq.${workspaceId}`]],
        limit: 1,
      });
      if (byName?.[0]) {
        return {
          status: "conflict",
          action: command.action,
          error: byName[0].product_id === command.record.product_id ? "repository-already-connected" : "repository-owned-by-other-product",
          retryable: false,
          entity: byName[0],
        };
      }
    }
    return { status: "error", error: "duplicate" };
  }

  if (command.action === "disconnect_repository") {
    const result = await deps.remove("product_repositories", command.filters || []);
    if (!result.persisted && result.reason !== "no-matching-row") return { status: "error", error: result.reason };
    if (Array.isArray(result.records) && !result.records[0]) return { status: "error", action: command.action, error: "not-found" };
    return { status: "saved", action: command.action, entity: { id: filterValue(command.filters, "id") } };
  }

  const filters = [...(command.filters || [])];
  const patch = { ...(command.patch || {}) };

  if (command.table === "products") {
    // details 병합·버전·단계 이력은 현재 행을 읽고 버전 가드(updated_at)로 저장한다.
    const identity = filters.filter(([key]) => key === "id" || key === "workspace_id");
    const rows = await deps.fetchRows("products", { filters: identity, limit: 1 });
    if (rows === null) return { status: "error", error: "current-entity-read-failed" };
    const current = rows[0];
    if (!current) return { status: "error", action: command.action, error: "not-found" };
    const expected = filterValue(filters, "updated_at");
    if (expected && comparable(expected) !== comparable(current.updated_at)) {
      return { status: "conflict", action: command.action, error: "stale-update", retryable: false, entity: current };
    }
    const currentDetails = current.details && typeof current.details === "object" && !Array.isArray(current.details)
      ? current.details as Row
      : {};
    if (patch.details) {
      const merged = { ...emptyProductDetails(), ...currentDetails, ...(patch.details as Row) };
      patch.details = merged;
      if (contractSignature(merged) !== contractSignature({ ...emptyProductDetails(), ...currentDetails })) {
        patch.version = Number(current.version || 1) + 1;
      }
    }
    if (patch.stage && patch.stage !== current.stage) {
      if (STAGES_REQUIRING_REASON.has(String(patch.stage)) && !command.stageReason) {
        return { status: "invalid-input", action: command.action, error: "stage-reason-required" };
      }
      const history = Array.isArray(current.stage_history) ? [...current.stage_history as Row[]] : [];
      history.push({ at: now, from: current.stage ?? null, to: patch.stage, reason: command.stageReason || null });
      patch.stage_history = history.slice(-50);
    }
    if (!expected) {
      if (!current.updated_at) return { status: "error", error: "missing-product-version" };
      filters.push(["updated_at", `eq.${current.updated_at}`]);
    }
  }

  const persistence = await deps.update(command.table, filters, patch);
  if (!persistence.persisted && persistence.reason !== "no-matching-row") {
    return { status: "error", error: persistence.reason, detail: persistence.detail || null };
  }
  if (Array.isArray(persistence.records) && !persistence.records[0]) {
    if (command.table === "products") {
      const identity = filters.filter(([key]) => key === "id" || key === "workspace_id");
      const latest = await deps.fetchRows("products", { filters: identity, limit: 1 });
      if (latest?.[0]) return { status: "conflict", action: command.action, error: "stale-update", retryable: false, entity: latest[0] };
    }
    return { status: "error", action: command.action, error: "not-found" };
  }
  return {
    status: "saved",
    action: command.action,
    entity: persistence.records?.[0] || persistence.record || { id: filterValue(filters, "id"), ...patch },
  };
}

// 문의 ↔ 제품 연결. 문의 하나에 제품 하나 — 이미 붙어 있으면 새 제품으로 옮긴다(지우고 넣는다).
async function executeInquiryLink(
  command: Extract<Normalized, { ok: true }>,
  workspaceId: string,
  deps: ProductDependencies,
) {
  const filters = command.filters || [];
  if (command.action === "unlink_inquiry") {
    const removed = await deps.remove("product_inquiry_links", filters);
    if (!removed.persisted && removed.reason !== "no-matching-row") return { status: "error", error: removed.reason };
    // 이미 연결이 없으면 원하는 상태와 같다 — 성공으로 본다(재시도 안전).
    return { status: "saved", action: command.action, entity: { inquiryId: filterValue(filters, "inquiry_id"), productId: null } };
  }
  const record = command.record as Row;
  const [products, inquiries] = await Promise.all([
    deps.fetchRows("products", { select: "id", filters: [["id", `eq.${record.product_id}`], ["workspace_id", `eq.${workspaceId}`]], limit: 1 }),
    deps.fetchRows("inquiries", { select: "id", filters: [["id", `eq.${record.inquiry_id}`], ["workspace_id", `eq.${workspaceId}`]], limit: 1 }),
  ]);
  if (products === null || inquiries === null) return { status: "error", error: "relationship-check-failed" };
  if (!products[0]) return { status: "invalid-input", error: "invalid-product-reference" };
  if (!inquiries[0]) return { status: "invalid-input", error: "invalid-inquiry-reference" };
  const current = await deps.fetchRows("product_inquiry_links", { filters, limit: 1 });
  if (current === null) return { status: "error", error: "current-entity-read-failed" };
  if (current[0]?.product_id === record.product_id) {
    return { status: "duplicate", action: command.action, entity: { inquiryId: record.inquiry_id, productId: record.product_id } };
  }
  if (current[0]) {
    const removed = await deps.remove("product_inquiry_links", filters);
    if (!removed.persisted && removed.reason !== "no-matching-row") return { status: "error", error: removed.reason };
  }
  const inserted = await deps.insert("product_inquiry_links", record);
  if (!inserted.persisted) {
    return inserted.reason === "duplicate"
      ? { status: "conflict", action: command.action, error: "inquiry-link-changed", retryable: true }
      : { status: "error", error: inserted.reason, detail: inserted.detail || null };
  }
  return { status: "saved", action: command.action, entity: { inquiryId: record.inquiry_id, productId: record.product_id } };
}
