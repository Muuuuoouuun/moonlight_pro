export const CONTENT_BRANDS = [
  { value: "all", label: "All Brands" },
  { value: "moonlight", label: "Moonlight" },
  { value: "classin", label: "ClassIn" },
  { value: "operator", label: "Operator Notes" },
];

export const WORK_CONTEXTS = [
  { value: "all", label: "All Work" },
  { value: "growth", label: "Growth" },
  { value: "content", label: "Content" },
  { value: "ops", label: "Ops" },
];

const BRAND_REFERENCES = {
  all: {
    label: "All Brands",
    rule: "Keep the writing concrete, calm, and useful.",
    messages: ["signal first", "one point per card", "clear next action"],
  },
  moonlight: {
    label: "Moonlight",
    rule: "Cool operating-system tone. Strategy desk, not generic SaaS copy.",
    messages: ["decision-first", "quiet premium", "Korean-first"],
  },
  classin: {
    label: "ClassIn",
    rule: "Education operator tone. Practical, specific, proof-backed.",
    messages: ["student outcome", "teacher workflow", "parent trust"],
  },
  operator: {
    label: "Operator Notes",
    rule: "Founder memo tone. Short, directional, and grounded in what changed.",
    messages: ["what moved", "why it matters", "next move"],
  },
};

const STUDIO_CONFIG = {
  all: {
    brand: "moonlight",
    templateId: "hook-proof-cta",
    channel: "Insights",
    storyAngle: "운영 신호를 독자가 바로 쓰는 판단 기준으로 바꿉니다.",
    operatorPrompt: "한 카드에는 한 메시지만 남기고, 마지막은 실제 행동으로 닫으세요.",
  },
  growth: {
    brand: "moonlight",
    templateId: "problem-shift-action",
    channel: "Landing",
    storyAngle: "리드가 지금 겪는 병목을 명확한 선택지로 좁힙니다.",
    operatorPrompt: "CTA는 상담 요청보다 먼저 문제를 한 줄로 쓰게 만드세요.",
  },
  content: {
    brand: "operator",
    templateId: "hook-proof-cta",
    channel: "Newsletter",
    storyAngle: "운영 메모를 재사용 가능한 콘텐츠 자산으로 정리합니다.",
    operatorPrompt: "초안보다 재사용 가능한 구조를 먼저 남기세요.",
  },
  ops: {
    brand: "moonlight",
    templateId: "ops-note",
    channel: "Insights",
    storyAngle: "내부 실행 로그를 외부가 이해하는 교훈으로 번역합니다.",
    operatorPrompt: "상태 설명보다 다음 행동을 더 선명하게 쓰세요.",
  },
};

function resolveFromList(list, value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return list.find((item) => item.value === normalized) || list[0];
}

export function resolveContentBrand(value) {
  return resolveFromList(CONTENT_BRANDS, value);
}

export function resolveWorkContext(value) {
  return resolveFromList(WORK_CONTEXTS, value);
}

export function getContentBrandReference(value) {
  const brand = resolveContentBrand(value);
  return BRAND_REFERENCES[brand.value] || BRAND_REFERENCES.all;
}

export function getProjectStudioConfig(value) {
  const context = resolveWorkContext(value);
  return STUDIO_CONFIG[context.value] || STUDIO_CONFIG.all;
}

export function appendQueryParam(path, key, value) {
  const url = new URL(path, "https://moonlight.local");

  if (value) {
    url.searchParams.set(key, value);
  } else {
    url.searchParams.delete(key);
  }

  return `${url.pathname}${url.search}`;
}

export function buildContentStudioHref({ project, brand, template, channel } = {}) {
  let href = "/dashboard/content/studio";
  href = appendQueryParam(href, "project", project === "all" ? "" : project);
  href = appendQueryParam(href, "brand", brand === "all" ? "" : brand);
  href = appendQueryParam(href, "template", template);
  href = appendQueryParam(href, "channel", channel);
  return href;
}
