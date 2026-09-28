// 프로젝트 탭 `제품` 보기의 순수 계산 계층 (2026-09-24 제품 개발 기획 §4·§6).
// 규칙의 정본은 packages/product-catalog — 여기서는 화면용 행·편집 초안·저장 페이로드만 만든다.
import {
  MAX_FOCUS_PRODUCTS,
  PRICING_MODELS,
  PRODUCT_CATEGORY,
  PRODUCT_STAGES,
  isFocusStage,
  nextStage,
  normalizeRepo,
  readProduct,
  stageGate,
  stageLabel,
} from "../../../packages/product-catalog/index.ts";

export { MAX_FOCUS_PRODUCTS, PRICING_MODELS, PRODUCT_STAGES, isFocusStage, stageGate, stageLabel };

// 성장 → 출시 → MVP (집중) → 검증 → 아이디어 → 유지·종료. 같은 단계 안에서는 이름순.
const DISPLAY_RANK = { growth: 0, launch: 1, mvp: 2, validation: 3, idea: 4, sunset: 5 };

function matchesScope(container, scope) {
  if (scope !== "classin" && scope !== "personal") return true;
  const isClassin = String(container?.orgScope || "personal") === "classin";
  return scope === "classin" ? isClassin : !isClassin;
}

export function isProductContainer(container) {
  return container?.category === PRODUCT_CATEGORY && container.key !== "all";
}

export function buildProductRows(containers = [], { projects = [], todos = [], scope = "all" } = {}) {
  const projectCount = new Map();
  for (const project of projects) {
    if (!project?.brand) continue;
    projectCount.set(project.brand, (projectCount.get(project.brand) || 0) + 1);
  }
  const openTasks = new Map();
  for (const todo of todos) {
    if (!todo?.brand || todo.done) continue;
    openTasks.set(todo.brand, (openTasks.get(todo.brand) || 0) + 1);
  }
  return containers
    .filter(isProductContainer)
    .filter((container) => matchesScope(container, scope))
    .map((container) => {
      const product = readProduct(container.product);
      const count = projectCount.get(container.key) || 0;
      const target = nextStage(product.stage);
      const gate = target ? stageGate(product, target, { summary: container.summary, projectCount: count }) : [];
      return {
        id: container.id,
        key: container.key,
        name: container.name,
        summary: container.summary || "",
        orgScope: container.orgScope || "personal",
        updatedAt: container.updatedAt || null,
        preview: Boolean(container.preview),
        product,
        stage: product.stage,
        stageLabel: stageLabel(product.stage),
        focus: isFocusStage(product.stage),
        projectCount: count,
        openTasks: openTasks.get(container.key) || 0,
        nextStage: target,
        nextStageLabel: target ? stageLabel(target) : "",
        missing: gate.filter((item) => !item.done && !item.manual),
        manual: gate.filter((item) => item.manual),
      };
    })
    .sort((a, b) => (DISPLAY_RANK[a.stage] - DISPLAY_RANK[b.stage]) || a.name.localeCompare(b.name, "ko"));
}

// 집중 상한은 스코프와 무관하게 워크스페이스 전체로 센다 — Engine이 강제하는 기준과 같다.
export function focusSummary(containers = []) {
  const focused = containers.filter(isProductContainer).filter((c) => isFocusStage(readProduct(c.product).stage));
  return { count: focused.length, limit: MAX_FOCUS_PRODUCTS, full: focused.length >= MAX_FOCUS_PRODUCTS, names: focused.map((c) => c.name) };
}

const toLines = (list) => list.map((item) => item.text).join("\n");
const splitLines = (value) => String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);

export function productDraft(row) {
  const p = readProduct(row?.product);
  return {
    id: row?.id,
    expectedUpdatedAt: row?.updatedAt || null,
    name: row?.name || "",
    stage: p.stage,
    summary: row?.summary || "",
    problem: p.problem,
    nextAction: p.nextAction,
    orgTypes: p.target.orgTypes,
    subjects: [...p.target.subjects],
    regions: p.target.regions,
    size: p.target.size,
    capabilities: toLines(p.capabilities),
    requirements: toLines(p.requirements),
    pricingModel: p.pricing.model,
    amount: p.pricing.amount ?? "",
    deployUrl: p.links.deployUrl,
    docsUrl: p.links.docsUrl,
    repos: p.repos.join("\n"),
    sunsetReason: p.sunsetReason,
  };
}

// 한 줄에 하나씩 적은 목록을 {id,text}로 되돌린다. 같은 문구는 이전 id를 이어받아
// 나중에 고객 적합도의 필수 조건 대조(기획서 §8.3)가 항목을 잃지 않게 한다.
function linesWithIds(value, previous = [], makeId) {
  const pool = new Map();
  for (const item of previous) {
    if (!pool.has(item.text)) pool.set(item.text, item.id);
  }
  const used = new Set();
  return splitLines(value).map((text) => {
    const prior = pool.get(text);
    const id = prior && !used.has(prior) ? prior : makeId();
    used.add(id);
    return { id, text };
  });
}

function defaultMakeId() {
  return globalThis.crypto?.randomUUID?.() || `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function productPayload(draft, previousProduct, makeId = defaultMakeId) {
  const previous = readProduct(previousProduct);
  const amountText = String(draft.amount ?? "").trim();
  const amount = amountText === "" ? null : Number(amountText);
  return {
    id: draft.id,
    expectedUpdatedAt: draft.expectedUpdatedAt,
    summary: String(draft.summary || "").trim(),
    product: {
      stage: draft.stage,
      problem: String(draft.problem || "").trim(),
      nextAction: String(draft.nextAction || "").trim(),
      target: {
        orgTypes: String(draft.orgTypes || "").trim(),
        subjects: Array.isArray(draft.subjects) ? draft.subjects : [],
        regions: String(draft.regions || "").trim(),
        size: String(draft.size || "").trim(),
      },
      capabilities: linesWithIds(draft.capabilities, previous.capabilities, makeId),
      requirements: linesWithIds(draft.requirements, previous.requirements, makeId),
      // 숫자가 아닌 금액은 음수로 보내 Engine이 "금액은 0 이상의 숫자로" 오류를 돌려주게 한다 —
      // 조용히 비우면 운영자가 적은 값이 사라진다.
      pricing: { model: draft.pricingModel || "", amount: Number.isFinite(amount) ? amount : amountText === "" ? null : -1 },
      links: { deployUrl: String(draft.deployUrl || "").trim(), docsUrl: String(draft.docsUrl || "").trim() },
      repos: splitLines(draft.repos),
      sunsetReason: String(draft.sunsetReason || "").trim(),
    },
  };
}

// GitHub 동기화에 넘길 목록 — 제품 카드의 저장소. 같은 저장소는 먼저 나온 제품이 가진다.
export function productRepositoryPayload(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row?.id || row.preview) continue;
    for (const raw of row.product?.repos || []) {
      const fullName = normalizeRepo(raw);
      if (!fullName || seen.has(fullName.toLowerCase())) continue;
      seen.add(fullName.toLowerCase());
      out.push({ fullName, productId: row.id });
    }
  }
  return out;
}

// Engine 응답 봉투를 운영자 문장으로. HTTP 상태만 보지 않고 봉투의 status를 읽는다.
export function describeSyncResult(data, httpStatus) {
  const status = data?.status;
  if (status === "synced") return { state: "live", label: `저장소 ${data.repositories?.length || 0}개 동기화됨` };
  if (status === "partial") return { state: "partial", label: `일부만 동기화됨 · 실패 ${data.failures?.length || 0}개` };
  if (status === "preview") {
    return {
      state: "preview",
      label: data?.configured === false ? "연결된 저장소가 없습니다. 제품 카드에 저장소를 적어주세요." : "Engine 연결 전이라 동기화하지 않았습니다.",
    };
  }
  if (status === "unauthorized") return { state: "error", label: "Engine 인증에 실패했습니다. 공유 비밀키 설정을 확인하세요." };
  return { state: "error", label: data?.error ? `동기화 실패 · ${data.error}` : `동기화 실패 (${httpStatus || "응답 없음"})` };
}

// 동기화 응답의 저장소 요약을 제품 id별로 묶는다.
export function groupSyncByProduct(data) {
  const byProduct = new Map();
  for (const summary of data?.repositories || []) {
    if (!summary?.productId) continue;
    const list = byProduct.get(summary.productId) || [];
    list.push({ repository: summary.repository, openIssues: summary.openIssues, openPullRequests: summary.openPullRequests, reviewRequests: summary.reviewRequests, blockedIssues: summary.blockedIssues });
    byProduct.set(summary.productId, list);
  }
  return byProduct;
}
