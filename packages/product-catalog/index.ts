// 제품 카탈로그 — Hub와 Engine이 같은 규칙으로 제품 카드를 읽고 검증한다.
// (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §3·§4)
//
// 제품은 PMS 컨테이너(brands 행, meta.category = "product")이고 카드 필드는 meta.product에 산다.
// 한 줄 설명만 brands.description 컬럼을 쓴다. version·stageHistory는 서버가 관리하며
// 클라이언트가 보낸 값은 버린다.

export const PRODUCT_CATEGORY = "product";

export const PRODUCT_STAGES = [
  { key: "idea", label: "아이디어" },
  { key: "validation", label: "검증" },
  { key: "mvp", label: "MVP" },
  { key: "launch", label: "출시" },
  { key: "growth", label: "성장" },
  { key: "sunset", label: "유지 · 종료" },
] as const;

export type ProductStage = (typeof PRODUCT_STAGES)[number]["key"];

const STAGE_KEYS = new Set<string>(PRODUCT_STAGES.map((stage) => stage.key));
const STAGE_ORDER: Record<string, number> = Object.fromEntries(PRODUCT_STAGES.map((stage, index) => [stage.key, index]));

// 집중 단계 — 동시에 이 단계에 있을 수 있는 제품 수를 MAX_FOCUS_PRODUCTS로 묶는다.
export const FOCUS_STAGES = new Set<string>(["mvp", "launch", "growth"]);
// 2026-09-28 운영자 확정 "3개 집중". 상한은 행을 읽는 Engine pms-command-service가 강제한다.
export const MAX_FOCUS_PRODUCTS = 3;

export const PRICING_MODELS = [
  { key: "", label: "미정" },
  { key: "monthly", label: "월 구독" },
  { key: "per-use", label: "건당" },
  { key: "one-time", label: "일시불" },
  { key: "free", label: "무료" },
] as const;
const PRICING_KEYS = new Set<string>(PRICING_MODELS.map((model) => model.key));

export type ProductLine = { id: string; text: string };
export type ProductCard = {
  stage: ProductStage;
  problem: string;
  nextAction: string;
  target: { orgTypes: string; subjects: string[]; regions: string; size: string };
  capabilities: ProductLine[];
  requirements: ProductLine[];
  pricing: { model: string; amount: number | null; currency: "KRW" };
  links: { deployUrl: string; docsUrl: string };
  repos: string[];
  sunsetReason: string;
};
export type ProductServerFields = {
  version: number;
  stageHistory: Array<{ at: string; from: string | null; to: string }>;
};
export type StoredProduct = ProductCard & ProductServerFields;

const LIMITS = { short: 200, long: 2000, lines: 30, lineText: 300, repos: 10, subjects: 12 };
const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SUBJECT_PATTERN = /^[a-z][a-z-]{0,39}$/;

export function stageLabel(stage: unknown): string {
  return PRODUCT_STAGES.find((entry) => entry.key === stage)?.label || "아이디어";
}

export function isFocusStage(stage: unknown): boolean {
  return typeof stage === "string" && FOCUS_STAGES.has(stage);
}

export function safeHttpUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeRepo(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  return REPO_PATTERN.test(trimmed) ? trimmed : "";
}

export function emptyProduct(): StoredProduct {
  return {
    stage: "idea",
    problem: "",
    nextAction: "",
    target: { orgTypes: "", subjects: [], regions: "", size: "" },
    capabilities: [],
    requirements: [],
    pricing: { model: "", amount: null, currency: "KRW" },
    links: { deployUrl: "", docsUrl: "" },
    repos: [],
    sunsetReason: "",
    version: 1,
    stageHistory: [],
  };
}

function str(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function lines(value: unknown): ProductLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && typeof item.id === "string" && typeof item.text === "string")
    .map((item) => ({ id: item.id.slice(0, 80), text: item.text.trim().slice(0, LIMITS.lineText) }))
    .filter((item) => item.id && item.text)
    .slice(0, LIMITS.lines);
}

// 저장된 meta.product를 관대하게 읽는다. 모르는 값은 기본값으로 떨어지고 절대 던지지 않는다.
export function readProduct(value: unknown): StoredProduct {
  const base = emptyProduct();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const row = value as Record<string, any>;
  const target = row.target && typeof row.target === "object" ? row.target : {};
  const pricing = row.pricing && typeof row.pricing === "object" ? row.pricing : {};
  const links = row.links && typeof row.links === "object" ? row.links : {};
  const amount = Number(pricing.amount);
  return {
    stage: STAGE_KEYS.has(row.stage) ? row.stage : "idea",
    problem: str(row.problem, LIMITS.long),
    nextAction: str(row.nextAction, LIMITS.short),
    target: {
      orgTypes: str(target.orgTypes, LIMITS.short),
      subjects: Array.isArray(target.subjects)
        ? target.subjects.filter((key: unknown) => typeof key === "string" && SUBJECT_PATTERN.test(key)).slice(0, LIMITS.subjects)
        : [],
      regions: str(target.regions, LIMITS.short),
      size: str(target.size, LIMITS.short),
    },
    capabilities: lines(row.capabilities),
    requirements: lines(row.requirements),
    pricing: {
      model: PRICING_KEYS.has(pricing.model) ? pricing.model : "",
      amount: pricing.amount !== null && pricing.amount !== "" && Number.isFinite(amount) && amount >= 0 ? amount : null,
      currency: "KRW",
    },
    links: { deployUrl: safeHttpUrl(links.deployUrl), docsUrl: safeHttpUrl(links.docsUrl) },
    repos: Array.isArray(row.repos) ? row.repos.map(normalizeRepo).filter(Boolean).slice(0, LIMITS.repos) : [],
    sunsetReason: str(row.sunsetReason, LIMITS.short),
    version: Number.isInteger(row.version) && row.version > 0 ? row.version : 1,
    stageHistory: Array.isArray(row.stageHistory)
      ? row.stageHistory.filter((entry: any) => entry && typeof entry.at === "string" && typeof entry.to === "string").slice(-50)
      : [],
  };
}

// 클라이언트 입력을 엄격하게 검증한다. 실패하면 운영자에게 보여줄 한국어 문장을 돌려준다.
export function parseProductInput(value: unknown): { ok: true; product: ProductCard } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "제품 카드 형식이 올바르지 않습니다." };
  const row = value as Record<string, any>;
  if (row.stage !== undefined && !STAGE_KEYS.has(row.stage)) return { ok: false, error: "알 수 없는 제품 단계입니다." };
  for (const [key, max] of [["problem", LIMITS.long], ["nextAction", LIMITS.short], ["sunsetReason", LIMITS.short]] as const) {
    if (row[key] !== undefined && (typeof row[key] !== "string" || row[key].length > max)) return { ok: false, error: "입력이 너무 길거나 형식이 올바르지 않습니다." };
  }
  const target = row.target ?? {};
  if (typeof target !== "object" || Array.isArray(target)) return { ok: false, error: "대상 고객 형식이 올바르지 않습니다." };
  if (target.subjects !== undefined && (!Array.isArray(target.subjects) || target.subjects.length > LIMITS.subjects
    || target.subjects.some((key: unknown) => typeof key !== "string" || !SUBJECT_PATTERN.test(key)))) {
    return { ok: false, error: "대상 과목 값이 올바르지 않습니다." };
  }
  for (const key of ["capabilities", "requirements"]) {
    const list = row[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > LIMITS.lines
      || list.some((item: any) => !item || typeof item.id !== "string" || !item.id || typeof item.text !== "string" || !item.text.trim() || item.text.length > LIMITS.lineText)) {
      return { ok: false, error: "제공 범위·필수 조건은 내용이 있는 항목으로 최대 30개까지 적어주세요." };
    }
  }
  const pricing = row.pricing ?? {};
  if (pricing.model !== undefined && !PRICING_KEYS.has(pricing.model)) return { ok: false, error: "알 수 없는 가격 모델입니다." };
  if (pricing.amount !== undefined && pricing.amount !== null && (typeof pricing.amount !== "number" || !Number.isFinite(pricing.amount) || pricing.amount < 0 || pricing.amount > 1e12)) {
    return { ok: false, error: "금액은 0 이상의 숫자로 적어주세요." };
  }
  const links = row.links ?? {};
  for (const key of ["deployUrl", "docsUrl"]) {
    if (links[key] && !safeHttpUrl(links[key])) return { ok: false, error: "링크는 http 또는 https 주소로 적어주세요." };
  }
  if (row.repos !== undefined && (!Array.isArray(row.repos) || row.repos.length > LIMITS.repos)) return { ok: false, error: "저장소는 최대 10개까지 연결할 수 있습니다." };
  const repos = (row.repos || []).map(normalizeRepo);
  if (repos.some((repo: string) => !repo)) return { ok: false, error: "저장소는 owner/repo 형식으로 적어주세요." };
  if (new Set(repos.map((repo: string) => repo.toLowerCase())).size !== repos.length) return { ok: false, error: "같은 저장소를 두 번 적었습니다." };
  const product = readProduct({ ...row, repos });
  if (product.stage === "sunset" && !product.sunsetReason) return { ok: false, error: "유지·종료로 옮길 때는 이유를 한 줄 남겨주세요." };
  const { version: _version, stageHistory: _history, ...card } = product;
  return { ok: true, product: card };
}

function lineTexts(list: ProductLine[]) {
  return JSON.stringify(list.map((item) => item.text));
}

// 서버 관리 필드를 이전 기록에서 이어 붙인다. 제공 범위나 필수 조건 문구가 바뀌면 제품 버전이
// 올라가고(적합도 F 재확인 트리거, 기획서 §4), 단계가 바뀌면 이력이 한 줄 쌓인다.
export function mergeProductServerFields(previous: unknown, next: ProductCard, now: string): StoredProduct {
  const prior = previous && typeof previous === "object" ? readProduct(previous) : null;
  const contractChanged = prior
    ? lineTexts(prior.capabilities) !== lineTexts(next.capabilities) || lineTexts(prior.requirements) !== lineTexts(next.requirements)
    : false;
  const version = prior ? prior.version + (contractChanged ? 1 : 0) : 1;
  const history = prior ? [...prior.stageHistory] : [];
  const fromStage = prior ? prior.stage : null;
  if (!prior || fromStage !== next.stage) history.push({ at: now, from: fromStage, to: next.stage });
  return { ...next, version, stageHistory: history.slice(-50) };
}

// 단계 게이트 — 막지 않고 빠진 칸을 알려준다(기획서 §4.1). 누적 조건이다.
// context.projectCount는 이 제품에 붙은 프로젝트 수. 확인할 수 없는 조건은 `manual`로 표시한다.
export type GateItem = { key: string; label: string; done: boolean; manual?: boolean };
export function stageGate(product: StoredProduct | ProductCard, targetStage: string, context: { summary?: string; projectCount?: number } = {}): GateItem[] {
  const order = STAGE_ORDER[targetStage] ?? 0;
  const items: GateItem[] = [];
  if (targetStage === "sunset") {
    return [{ key: "sunsetReason", label: "유지·종료 이유 한 줄", done: Boolean(product.sunsetReason) }];
  }
  items.push({ key: "summary", label: "한 줄 설명", done: Boolean(String(context.summary || "").trim()) });
  if (order >= STAGE_ORDER.validation) {
    items.push({ key: "problem", label: "해결하는 문제", done: Boolean(product.problem) });
    items.push({
      key: "target",
      label: "대상 고객(기관 유형 또는 과목)",
      done: Boolean(product.target.orgTypes) || product.target.subjects.length > 0,
    });
  }
  if (order >= STAGE_ORDER.mvp) {
    items.push({ key: "repos", label: "GitHub 저장소 1개", done: product.repos.length > 0 });
    items.push({ key: "project", label: "소속 프로젝트 1개", done: (context.projectCount || 0) > 0 });
  }
  if (order >= STAGE_ORDER.launch) {
    items.push({ key: "capabilities", label: "제공 범위(확인된 기능) 1개", done: product.capabilities.length > 0 });
    items.push({ key: "deployUrl", label: "배포 URL", done: Boolean(product.links.deployUrl) });
    items.push({ key: "launchChecklist", label: "출시 전 체크리스트 완료", done: false, manual: true });
  }
  if (order >= STAGE_ORDER.growth) {
    items.push({ key: "revenue", label: "확정 매출 1건", done: false, manual: true });
  }
  return items;
}

export function nextStage(stage: unknown): ProductStage | null {
  const order = STAGE_ORDER[String(stage)] ?? 0;
  const next = PRODUCT_STAGES[order + 1];
  return next && next.key !== "sunset" ? next.key : null;
}
