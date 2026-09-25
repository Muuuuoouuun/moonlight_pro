// 제품 카탈로그의 화면 규칙 — 단계·게이트·다음 행동·폼 변환 (React 비의존, node --test로 고정).
// 정본 기획: docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §4·§5·§6.
// 제품 = 오래 사는 것(단계만 바뀐다). 프로젝트 = 끝나는 것(projects.product_id로 제품 아래에 붙는다).

export const PRODUCT_STAGES = [
  { key: "idea", label: "아이디어" },
  { key: "validation", label: "검증" },
  { key: "mvp", label: "MVP" },
  { key: "launch", label: "출시" },
  { key: "growth", label: "성장" },
  { key: "maintain", label: "유지" },
  { key: "sunset", label: "종료" },
];
export const PRODUCT_STAGE_LABEL = Object.fromEntries(PRODUCT_STAGES.map((stage) => [stage.key, stage.label]));
// 앞으로 나아가는 단계(게이트가 누적된다). 유지·종료는 어느 단계에서든 이유 한 줄로 내린다.
const FORWARD_STAGES = ["idea", "validation", "mvp", "launch", "growth"];
export const STAGES_REQUIRING_REASON = new Set(["maintain", "sunset"]);
// 동시에 MVP 이상인 제품 수 상한은 운영자가 아직 정하지 않았다(§12-5, 2026-09-24 "나중에 정함").
// 이 집합은 표시(단계 칸반·세기)에만 쓰고 막거나 결정 카드를 띄우지 않는다.
export const BUILDING_STAGES = new Set(["mvp", "launch", "growth"]);

export const PRICING_MODELS = [
  { value: "undecided", label: "미정" },
  { value: "free", label: "무료" },
  { value: "monthly", label: "월 구독" },
  { value: "per_use", label: "건당" },
  { value: "one_time", label: "일시불" },
];
const PRICING_LABEL = Object.fromEntries(PRICING_MODELS.map((model) => [model.value, model.label]));

export const PRODUCT_ORG_SCOPES = [
  { value: "personal", label: "개인" },
  { value: "classin", label: "ClassIn" },
];

export function productStageLabel(stage) {
  return PRODUCT_STAGE_LABEL[stage] || "미정";
}

export function nextProductStage(stage) {
  const index = FORWARD_STAGES.indexOf(stage);
  return index >= 0 && index < FORWARD_STAGES.length - 1 ? FORWARD_STAGES[index + 1] : null;
}

export function formatPricing(pricing) {
  const model = pricing?.model || "undecided";
  if (model === "undecided") return "가격 미정";
  if (model === "free") return "무료";
  const amount = Number.isFinite(pricing?.amount) ? `${Number(pricing.amount).toLocaleString("ko-KR")}원` : "금액 미정";
  return `${PRICING_LABEL[model] || model} ${amount}`;
}

function nonEmpty(value) {
  return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : Boolean(value);
}

// 단계에 "들어가려면" 필요한 칸(§4.1). 앞 단계 조건은 누적된다 — 출시하려면 문제·대상도 있어야 한다.
// field는 편집 폼에서 그 칸으로 데려갈 키다. 게이트는 막지 않고 알려준다.
// 출시 전 체크리스트(3단계 템플릿)와 확정 매출(5단계)은 아직 원천이 없어 "확인 필요"로만 둔다.
const GATE_RULES = {
  idea: [
    { key: "name", label: "이름", field: "name", check: (p) => nonEmpty(p.name) },
    { key: "summary", label: "한 줄 설명", field: "summary", check: (p) => nonEmpty(p.summary) },
  ],
  validation: [
    { key: "problem", label: "해결하는 문제", field: "problem", check: (p) => nonEmpty(p.details?.problem) },
    {
      key: "target",
      label: "분야나 대상 고객",
      field: "domain",
      check: (p) => nonEmpty(p.details?.domain) || nonEmpty(p.details?.audience),
    },
  ],
  mvp: [
    { key: "repository", label: "저장소 1개 연결", field: null, tab: "dev", check: (_p, ctx) => ctx.repositories > 0 },
    { key: "project", label: "프로젝트 1개 연결", field: null, tab: "dev", check: (_p, ctx) => ctx.projects > 0 },
  ],
  launch: [
    { key: "capabilities", label: "점검을 마친 기능 1개", field: null, tab: "checklist", check: (p) => verifiedFeatures(p).length > 0 },
    { key: "deployUrl", label: "배포 URL", field: "deployUrl", check: (p) => nonEmpty(p.details?.deployUrl) },
    { key: "launchChecklist", label: "출시 전 체크리스트", field: null, unknown: true },
  ],
  growth: [
    { key: "revenue", label: "확정 매출 1건", field: null, unknown: true },
  ],
};

export function productStageGate(product, targetStage, ctx = {}) {
  const context = { repositories: 0, projects: 0, ...ctx };
  if (STAGES_REQUIRING_REASON.has(targetStage)) {
    return { target: targetStage, missing: [], unknown: [], needsReason: true };
  }
  const upTo = FORWARD_STAGES.indexOf(targetStage);
  if (upTo < 0) return { target: targetStage, missing: [], unknown: [], needsReason: false };
  const missing = [];
  const unknown = [];
  for (const stage of FORWARD_STAGES.slice(0, upTo + 1)) {
    for (const rule of GATE_RULES[stage]) {
      if (rule.unknown) {
        // 원천이 없는 조건은 목표 단계 자체의 것만 보인다 — 지나온 단계의 미확인까지 쌓지 않는다.
        if (stage === targetStage) unknown.push({ key: rule.key, label: rule.label });
        continue;
      }
      if (!rule.check(product, context)) missing.push({ key: rule.key, label: rule.label, field: rule.field, tab: rule.tab || null });
    }
  }
  return { target: targetStage, missing, unknown, needsReason: false };
}

// 받침 판정 — "출시로 / 검증으로", "배포 URL이 / 이름이 / 한 줄 설명이". 영문 끝 글자는 읽는 소리로
// 가른다(L·M·N은 받침, L은 ㄹ). ㄹ 받침 뒤에는 "으로"가 아니라 "로"다.
function finalSound(word) {
  const last = String(word || "").trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code >= 0 && code <= 11171) {
    const jong = code % 28;
    return jong === 0 ? "none" : jong === 8 ? "rieul" : "other";
  }
  if (/[lL]/.test(last)) return "rieul";
  if (/[mMnN]/.test(last)) return "other";
  return "none";
}
export function withRo(word) {
  return `${word}${finalSound(word) === "other" ? "으로" : "로"}`;
}
function withI(word) {
  return `${word}${finalSound(word) === "none" ? "가" : "이"}`;
}

// 다음 행동: 운영자가 적은 것이 먼저, 없으면 다음 단계로 가는 데 빠진 첫 칸.
export function productNextAction(product, ctx = {}) {
  const explicit = typeof product?.details?.nextAction === "string" ? product.details.nextAction.trim() : "";
  if (explicit) return { text: explicit, source: "operator" };
  const next = nextProductStage(product?.stage);
  if (!next) return null;
  const gate = productStageGate(product, next, ctx);
  const first = gate.missing[0];
  if (!first) return { text: `${withRo(productStageLabel(next))} 올릴 준비가 됐어요`, source: "gate" };
  return { text: `${withRo(productStageLabel(next))} 올리려면 ${withI(first.label)} 필요해요`, source: "gate", missing: first };
}

// 막힘 1개(§6 제품 보기): CI 실패가 가장 먼저, 다음은 동기화 실패. 없으면 null.
export function productBlocker(product) {
  for (const repo of product?.repositories || []) {
    if (repo.status !== "disabled" && repo.summary?.ci?.state === "failure") {
      return { kind: "ci", label: `CI 실패 · ${repo.fullName}`, repositoryId: repo.id, url: repo.summary.ci.url || null };
    }
  }
  for (const repo of product?.repositories || []) {
    if (repo.status === "error") return { kind: "sync", label: `동기화 실패 · ${repo.fullName}`, repositoryId: repo.id, url: null };
  }
  return null;
}

export const CI_STATE_LABEL = { success: "통과", failure: "실패", pending: "진행 중", none: "check 없음" };

// ── 전체 체크리스트 ─────────────────────────────────────────────────────────
// 기획 → 기능 → 개발 → 출시 → 운영 순서로 "지금 이 제품이 어디까지 됐나"를 한 목록으로 보인다
// (2026-09-25 운영자: 기획·단계·몇 퍼센트·기능 점검·GitHub 연결·에러·문의 연결).
// 항목은 제품 기록에서 계산한다 — 코드에 박아 둔 할 일 목록이 아니다. state:
//   done / todo  → 진척률 분모에 들어간다
//   unknown      → 아직 Moonlight가 읽는 원천이 없다(에러 수집 도구 미정 등). 분모에서 뺀다
//   info         → 할 일이 아니라 현황(연결된 문의 수). 분모에서 뺀다

export function productFeatures(product) {
  return Array.isArray(product?.details?.capabilities) ? product.details.capabilities : [];
}

export function verifiedFeatures(product) {
  return productFeatures(product).filter((feature) => Boolean(feature.verifiedAt));
}

function ciSummary(product) {
  const states = (product?.repositories || [])
    .filter((repo) => repo.status !== "disabled")
    .map((repo) => repo.summary?.ci?.state)
    .filter(Boolean);
  if (states.includes("failure")) return "failure";
  if (states.includes("pending")) return "pending";
  if (states.includes("success")) return "success";
  return null;
}

export function productChecklist(product, ctx = {}) {
  const details = product?.details || {};
  const repositories = (product?.repositories || []).filter((repo) => repo.status !== "disabled");
  const projects = product?.projects || [];
  const features = productFeatures(product);
  const verified = verifiedFeatures(product);
  const ci = ciSummary(product);
  const inquiries = Number.isFinite(ctx.inquiries) ? ctx.inquiries : (product?.inquiries || []).length;
  const item = (key, label, done, extra = {}) => ({ key, label, state: done ? "done" : "todo", ...extra });

  const groups = [
    {
      key: "plan",
      label: "기획",
      items: [
        item("summary", "한 줄 설명", nonEmpty(product?.summary), { field: "summary" }),
        item("domain", "분야", nonEmpty(details.domain), { field: "domain", detail: details.domain || null }),
        item("audience", "대상 고객", nonEmpty(details.audience), { field: "audience" }),
        item("problem", "해결하는 문제", nonEmpty(details.problem), { field: "problem" }),
      ],
    },
    {
      key: "features",
      label: "기능",
      items: [
        item("featuresDefined", "기능 정리", features.length > 0, { field: "capabilities", detail: features.length ? `${features.length}개` : null }),
        item("featuresVerified", "기능 점검", features.length > 0 && verified.length === features.length, {
          field: features.length ? null : "capabilities",
          detail: features.length ? `${verified.length}/${features.length}` : null,
          expandable: features.length > 0,
        }),
      ],
    },
    {
      key: "dev",
      label: "개발",
      items: [
        item("repository", "GitHub 저장소 연결", repositories.length > 0, { tab: "dev", detail: repositories.length ? `${repositories.length}개` : null }),
        item("project", "프로젝트 연결", projects.length > 0, { tab: "dev", detail: projects.length ? `${projects.length}개` : null }),
        repositories.length && ci
          ? item("ci", "CI 통과", ci === "success", { tab: "dev", detail: CI_STATE_LABEL[ci] })
          : { key: "ci", label: "CI 통과", state: "unknown", tab: "dev", detail: repositories.length ? "동기화 필요" : "저장소 연결 후" },
      ],
    },
    {
      key: "launch",
      label: "출시",
      items: [
        item("pricing", "가격 정하기", (details.pricing?.model || "undecided") !== "undecided", { field: "pricingModel", detail: formatPricing(details.pricing) }),
        item("deployUrl", "배포 URL", nonEmpty(details.deployUrl), { field: "deployUrl" }),
      ],
    },
    {
      key: "operate",
      label: "운영",
      items: [
        // 에러 수집 도구는 운영자 미정(§12-6) — 원천이 생기기 전까지는 할 일로 세지 않는다.
        { key: "errors", label: "에러 수집 연결", state: "unknown", detail: "도구 미정" },
        { key: "inquiries", label: "연결된 문의", state: "info", tab: "inquiries", detail: `${inquiries}건` },
      ],
    },
  ];
  const counted = groups.flatMap((group) => group.items).filter((entry) => entry.state === "done" || entry.state === "todo");
  const done = counted.filter((entry) => entry.state === "done").length;
  return { groups, done, total: counted.length, percent: counted.length ? Math.round((done / counted.length) * 100) : 0 };
}

// 기능 점검 토글 — 점검하면 오늘(서울) 날짜, 해제하면 null. 다른 기능은 그대로.
export function toggleFeatureVerified(product, featureId, checked, today) {
  return productFeatures(product).map((feature) => (
    feature.id === featureId ? { ...feature, verifiedAt: checked ? today : null } : feature
  ));
}

// ── 폼 변환 ─────────────────────────────────────────────────────────────────
// 제공 범위·필수 조건은 "한 줄에 하나"로 편집한다. 같은 문장은 기존 id·확인일을 유지해
// 적합도 결정의 requirements_checked가 가리키는 id가 흔들리지 않게 한다.

function splitLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/^[-•·*]\s*/, "").trim())
    .filter(Boolean);
}

export function linesToItems(text, existing = [], newId, today) {
  const pool = [...(Array.isArray(existing) ? existing : [])];
  const seen = new Set();
  const items = [];
  for (const line of splitLines(text)) {
    if (seen.has(line)) continue;
    seen.add(line);
    const index = pool.findIndex((item) => item?.text === line);
    if (index >= 0) {
      items.push(pool[index]);
      pool.splice(index, 1);
    } else {
      items.push(today === undefined ? { id: newId(), text: line } : { id: newId(), text: line, verifiedAt: today });
    }
  }
  return items;
}

function linksToText(links) {
  return (Array.isArray(links) ? links : []).map((link) => `${link.label} | ${link.url}`).join("\n");
}

function textToLinks(text) {
  return splitLines(text).map((line) => {
    const [label, ...rest] = line.split("|");
    const url = rest.join("|").trim();
    return url ? { label: label.trim().slice(0, 40), url } : { label: "링크", url: label.trim() };
  });
}

export function productToForm(product) {
  const details = product?.details || {};
  return {
    id: product?.id || null,
    name: product?.name || "",
    summary: product?.summary || "",
    orgScope: product?.orgScope || "personal",
    domain: details.domain || "",
    audience: details.audience || "",
    problem: details.problem || "",
    notes: details.notes || "",
    capabilities: (details.capabilities || []).map((item) => item.text).join("\n"),
    requirements: (details.requirements || []).map((item) => item.text).join("\n"),
    pricingModel: details.pricing?.model || "undecided",
    pricingAmount: Number.isFinite(details.pricing?.amount) ? String(details.pricing.amount) : "",
    deployUrl: details.deployUrl || "",
    links: linksToText(details.links),
    nextAction: details.nextAction || "",
  };
}

// 폼 → Engine update_product/create_product 입력. 금액은 숫자만 받는다(쉼표·"원" 제거).
// 새로 적은 기능은 "점검 전"으로 들어간다 — 점검은 상세 체크리스트에서 한다.
export function formToProductInput(form, product, { newId }) {
  const current = product?.details || {};
  const amountText = String(form.pricingAmount || "").replace(/[^0-9]/g, "");
  return {
    name: String(form.name || "").trim(),
    summary: String(form.summary || "").trim(),
    details: {
      domain: String(form.domain || "").trim(),
      audience: String(form.audience || "").trim(),
      problem: String(form.problem || "").trim(),
      notes: String(form.notes || "").trim(),
      capabilities: linesToItems(form.capabilities, current.capabilities, newId).map((feature) => ({ verifiedAt: null, ...feature })),
      requirements: linesToItems(form.requirements, current.requirements, newId),
      pricing: {
        model: form.pricingModel || "undecided",
        amount: form.pricingModel === "free" ? 0 : amountText ? Number(amountText) : null,
      },
      deployUrl: String(form.deployUrl || "").trim() || null,
      links: textToLinks(form.links),
      nextAction: String(form.nextAction || "").trim(),
    },
  };
}

// Engine 오류 코드 → 운영자 문장.
const ERROR_TEXT = {
  "missing-name": "이름을 적어 주세요.",
  "missing-summary": "한 줄 설명을 적어 주세요(200자 이내).",
  "stage-reason-required": "유지·종료로 내리는 이유를 한 줄 남겨 주세요.",
  "invalid-deploy-url": "배포 URL은 https://로 시작해야 해요.",
  "invalid-link": "링크는 '이름 | https://주소' 형식으로 적어 주세요.",
  "invalid-pricing-amount": "금액은 0 이상의 숫자로 적어 주세요.",
  "invalid-repository-name": "저장소는 owner/repo 형식으로 적어 주세요.",
  "repository-already-connected": "이미 이 제품에 연결된 저장소예요.",
  "repository-owned-by-other-product": "다른 제품에 연결된 저장소예요. 저장소는 제품 하나에만 속해요.",
  "invalid-product-reference": "제품을 찾지 못했어요. 새로고침 뒤 다시 시도하세요.",
  "invalid-inquiry-reference": "문의를 찾지 못했어요. 새로고침 뒤 다시 시도하세요.",
  "invalid-domain": "분야는 40자 안으로 짧게 적어 주세요. 세부는 특이사항에.",
  "invalid-notes": "특이사항은 2000자까지 적을 수 있어요.",
  "ops-note-required": "일시 중지·종료는 이유를 한 줄 남겨 주세요.",
  "invalid-month": "달을 다시 골라 주세요.",
  "invalid-active-users": "사용자 수는 0 이상의 정수로 적어 주세요.",
  "invalid-revenue": "매출은 0 이상의 숫자로 적어 주세요.",
  "invalid-cost": "비용은 0 이상의 숫자로 적어 주세요.",
  "project-product-mismatch": "다른 제품의 일에는 붙일 수 없어요.",
  "invalid-project-reference": "일을 찾지 못했어요. 새로고침 뒤 다시 시도하세요.",
  "missing-title": "일 제목을 적어 주세요.",
  "invalid-area-id": "업무 분야를 골라 주세요.",
  "invalid-work-type": "일 종류를 다시 골라 주세요.",
  "stale-update": "다른 곳에서 먼저 바뀌었어요. 입력은 유지했으니 새로고침 뒤 다시 저장하세요.",
  "engine-not-configured": "Engine 연결이 없어 저장되지 않았어요.",
  "engine-unreachable": "Engine에 연결하지 못했어요. 잠시 뒤 다시 시도하세요.",
};

export function productErrorText(error) {
  return ERROR_TEXT[error] || (error ? `저장하지 못했어요 (${error}).` : "저장하지 못했어요.");
}

export function gateSentence(stage, item) {
  return `${withRo(productStageLabel(stage))} 올리려면 ${withI(item.label)} 필요해요`;
}

// 목록 순서: 돈에 가까운 단계가 위(성장 → 출시 → MVP → 검증 → 아이디어), 유지·종료는 아래.
const LIST_RANK = ["growth", "launch", "mvp", "validation", "idea", "maintain", "sunset"];
export function productStageOrder(stage) {
  const index = LIST_RANK.indexOf(stage);
  return index < 0 ? LIST_RANK.length : index;
}

// ── 제품 운영실 B안 (docs/superpowers/specs/2026-09-25-product-operations-room-design.md §0) ──────────

// 운영 상태 — 단계("얼마나 자랐나")와 별개인 "지금 어떤가". 색 없이 글리프 + 글자(DESIGN §5.3 lifecycle).
export const PRODUCT_OPS = [
  { value: "dev", label: "개발 중", glyph: "◌" },
  { value: "live", label: "사용 중", glyph: "●" },
  { value: "paused", label: "일시 중지", glyph: "Ⅱ" },
  { value: "ended", label: "종료", glyph: "／" },
];
const OPS_BY_VALUE = Object.fromEntries(PRODUCT_OPS.map((ops) => [ops.value, ops]));
export const OPS_REQUIRING_NOTE = new Set(["paused", "ended"]);
export function productOps(value) {
  return OPS_BY_VALUE[value] || OPS_BY_VALUE.dev;
}

// 제품에 붙는 일(프로젝트)의 종류. 보수는 반복 주기를 가질 수 있다.
export const WORK_TYPES = [
  { value: "feature", label: "신기능", glyph: "＋" },
  { value: "maintenance", label: "보수", glyph: "↻\uFE0E" },
  { value: "contact", label: "연락", glyph: "☏\uFE0E" },
];
const WORK_BY_VALUE = Object.fromEntries(WORK_TYPES.map((type) => [type.value, type]));
export function workType(value) {
  return WORK_BY_VALUE[value] || null;
}
export const RECURRENCES = [
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
  { value: "quarterly", label: "분기" },
  { value: "yearly", label: "연 1회" },
];
export function recurrenceLabel(value) {
  return RECURRENCES.find((item) => item.value === value)?.label || null;
}

const PROJECT_STATE_LABEL = { draft: "계획", active: "진행", blocked: "막힘", completed: "완료", archived: "보관" };
export function projectStateLabel(status) {
  return PROJECT_STATE_LABEL[status] || "진행";
}

export function seoulDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}
export function seoulMonth(value = new Date()) {
  return seoulDay(value)?.slice(0, 7) || null;
}
export function previousMonth(month) {
  const [y, m] = String(month).split("-").map(Number);
  if (!y || !m) return null;
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function dayDiff(fromDay, toDay) {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86400000);
}

// 흐름(오늘 → 이번 주 → 다음 → 언젠가 → 지난): 일(프로젝트)·문의·깨진 신호를 한 줄로 섞는다.
// - 일: 막힘·기한 지남·오늘 기한 → 오늘, 7일 안 → 이번 주, 그 뒤 → 다음, 기한 없음 → 언젠가, 완료 → 지난
// - 문의: 새 → 오늘, 처리 중·답변 대기 → 이번 주, 처리 완료 → 지난 (제외는 흐름에 올리지 않는다)
// - CI 실패 → 오늘
export const FLOW_BUCKETS = [
  { key: "today", label: "오늘" },
  { key: "week", label: "이번 주" },
  { key: "next", label: "다음" },
  { key: "someday", label: "언젠가" },
  { key: "past", label: "지난" },
];

function projectBucket(project, today) {
  if (project.status === "completed" || project.status === "archived") return { bucket: "past", overdue: false };
  if (project.status === "blocked") return { bucket: "today", overdue: false };
  const due = project.dueAt ? seoulDay(project.dueAt) : null;
  if (!due) return { bucket: "someday", overdue: false };
  const diff = dayDiff(today, due);
  if (diff < 0) return { bucket: "today", overdue: true };
  if (diff === 0) return { bucket: "today", overdue: false };
  if (diff <= 7) return { bucket: "week", overdue: false };
  return { bucket: "next", overdue: false };
}

const INQUIRY_BUCKET = { new: "today", in_progress: "week", waiting: "week", closed: "past" };

export function productFlow(product, { today = seoulDay() } = {}) {
  const items = [];
  for (const repo of product?.repositories || []) {
    if (repo.status !== "disabled" && repo.summary?.ci?.state === "failure") {
      items.push({ kind: "signal", key: `ci-${repo.id}`, bucket: "today", urgent: true, title: `CI 실패 · ${repo.fullName}`, url: repo.summary.ci.url || null, repositoryId: repo.id, sortAt: "" });
    }
  }
  for (const project of product?.projects || []) {
    const { bucket, overdue } = projectBucket(project, today);
    items.push({
      kind: "work",
      key: `work-${project.id}`,
      bucket,
      urgent: project.status === "blocked" || overdue,
      overdue,
      workType: project.workType || null,
      project,
      title: project.name,
      sortAt: project.dueAt || project.updatedAt || "",
    });
  }
  for (const inquiry of product?.inquiries || []) {
    const bucket = INQUIRY_BUCKET[inquiry.status];
    if (!bucket) continue;
    items.push({ kind: "inquiry", key: `inq-${inquiry.id}`, bucket, urgent: false, inquiry, title: inquiry.subject, sortAt: inquiry.receivedAt || "" });
  }
  return FLOW_BUCKETS.map((bucket) => ({
    ...bucket,
    items: items
      .filter((item) => item.bucket === bucket.key)
      .sort((a, b) => Number(b.urgent) - Number(a.urgent)
        || (bucket.key === "past" ? String(b.sortAt).localeCompare(String(a.sortAt)) : String(a.sortAt).localeCompare(String(b.sortAt)))),
  }));
}

// 거르기 칩의 키: all · feature · maintenance · contact · inquiry
export function flowFilter(item, filter) {
  if (filter === "all") return true;
  if (filter === "inquiry") return item.kind === "inquiry";
  return item.kind === "work" && item.workType === filter;
}

export function openWorkCounts(product) {
  const counts = { feature: 0, maintenance: 0, contact: 0, other: 0 };
  for (const project of product?.projects || []) {
    if (project.status === "completed" || project.status === "archived") continue;
    counts[WORK_BY_VALUE[project.workType] ? project.workType : "other"] += 1;
  }
  return counts;
}

// 한 달 숫자 — 없는 값은 null(모름). 순이익은 매출·비용이 둘 다 있을 때만 계산한다.
export function monthNumbers(product, month) {
  const row = (product?.metrics || []).find((entry) => entry.month === month) || null;
  const revenue = row?.revenue ?? null;
  const cost = row?.cost ?? null;
  return {
    month,
    activeUsers: row?.activeUsers ?? null,
    revenue,
    cost,
    net: revenue !== null && cost !== null ? revenue - cost : revenue !== null ? revenue : cost !== null ? -cost : null,
    known: Boolean(row),
  };
}

export function openInquiries(product) {
  return (product?.inquiries || []).filter((inquiry) => inquiry.status !== "closed" && inquiry.status !== "ignored");
}

// 포트폴리오 요약 4칸 — 모르는 값은 합계에서 빼고, 빠진 제품 수를 함께 돌려준다.
export function portfolioSummary(products, inquiries, month) {
  const list = products || [];
  const byOps = Object.fromEntries(PRODUCT_OPS.map((ops) => [ops.value, 0]));
  let users = 0, usersKnown = 0, revenue = 0, cost = 0, moneyKnown = 0;
  for (const product of list) {
    byOps[product.opsStatus || "dev"] = (byOps[product.opsStatus || "dev"] || 0) + 1;
    const numbers = monthNumbers(product, month);
    if (numbers.activeUsers !== null) { users += numbers.activeUsers; usersKnown += 1; }
    if (numbers.revenue !== null || numbers.cost !== null) {
      revenue += numbers.revenue || 0;
      cost += numbers.cost || 0;
      moneyKnown += 1;
    }
  }
  const open = (inquiries || []).filter((inquiry) => inquiry.status !== "closed" && inquiry.status !== "ignored");
  return {
    total: list.length,
    byOps,
    users: usersKnown ? users : null,
    usersMissing: list.filter((p) => p.opsStatus !== "ended").length - usersKnown,
    revenue, cost, net: moneyKnown ? revenue - cost : null, moneyKnown,
    openInquiries: open.length,
    newInquiries: open.filter((inquiry) => inquiry.status === "new").length,
    waitingInquiries: open.filter((inquiry) => inquiry.status === "waiting").length,
    unassignedInquiries: open.filter((inquiry) => !inquiry.productId).length,
  };
}

// 지금 볼 것 — 깨졌거나 기한이 닥친 것만. 없으면 빈 배열(섹션을 그리지 않는다).
export function portfolioAttention(products, inquiries, { today = seoulDay() } = {}) {
  const out = [];
  for (const product of products || []) {
    const blocker = productBlocker(product);
    if (blocker?.kind === "ci") out.push({ key: `ci-${product.id}`, productId: product.id, name: product.name, text: blocker.label, urgent: true });
    for (const project of product.projects || []) {
      if (project.status === "completed" || project.status === "archived") continue;
      const { overdue } = projectBucket(project, today);
      if (project.status === "blocked") out.push({ key: `blk-${project.id}`, productId: product.id, name: product.name, text: `막힘 · ${project.name}`, urgent: true });
      else if (overdue) out.push({ key: `due-${project.id}`, productId: product.id, name: product.name, text: `기한 지남 · ${project.name}`, urgent: true, when: seoulDay(project.dueAt)?.slice(5) });
    }
  }
  const fresh = (inquiries || []).filter((inquiry) => inquiry.status === "new");
  if (fresh.length) {
    const unassigned = fresh.filter((inquiry) => !inquiry.productId).length;
    out.push({ key: "inbox", inbox: true, name: "문의함", text: `새 문의 ${fresh.length}건${unassigned ? ` · 제품 미정 ${unassigned}건` : ""}`, urgent: false });
  }
  return out;
}

// 다음 행동 한 줄(포트폴리오 표): 깨진 것 → 오늘 급한 일 → 운영자가 적은 것 → 기한 가까운 일 → 단계 조건.
export function productNextStep(product, { today = seoulDay() } = {}) {
  const blocker = productBlocker(product);
  if (blocker) return blocker.label;
  const flow = productFlow(product, { today });
  const urgent = flow[0].items.find((item) => item.kind === "work" && item.urgent);
  if (urgent) return `${urgent.overdue ? "기한 지남" : "막힘"} · ${urgent.title}`;
  const explicit = typeof product?.details?.nextAction === "string" ? product.details.nextAction.trim() : "";
  if (explicit) return explicit;
  const soon = flow.slice(0, 3).flatMap((bucket) => bucket.items).find((item) => item.kind === "work");
  if (soon) return soon.title;
  return productNextAction(product, { repositories: product?.repositories?.length || 0, projects: product?.projects?.length || 0 })?.text || null;
}
