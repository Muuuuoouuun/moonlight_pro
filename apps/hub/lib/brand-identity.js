import { canonicalOrgScopeForKey } from "./brand-org-scope.js";

export const BRAND_OPERATING_STATES = [
  { value: "", label: "운영 상태 미정" },
  { value: "active", label: "운영중" },
  { value: "experimenting", label: "실험중" },
  { value: "resting", label: "휴식중" },
];

export const BRAND_IDENTITY_FIELDS = [
  ["audience", "대상", "누구의 어떤 문제와 욕구를 다루나요?"],
  ["promise", "핵심 약속", "이 브랜드를 만나고 무엇이 달라지나요?"],
  ["philosophy", "철학 · 관점", "반복해서 전하고 싶은 생각"],
  ["direction", "방향", "어떤 형태로 쌓아갈지"],
  ["offer", "제공하는 가치", "상품·서비스·작품·경험"],
  ["keywords", "핵심 주제", "한 줄에 하나씩"],
  ["voice", "보이스", "어떤 언어로 말할지"],
  ["voiceExamples", "좋은 표현 예시", "이 브랜드다운 실제 문장"],
  ["rules", "콘텐츠 규칙", "한 줄에 하나씩"],
  ["forbidden", "하지 않을 표현과 주제", "한 줄에 하나씩"],
  ["currentFocus", "현재 집중점", "이번에 쌓거나 검증할 한 가지"],
];
const ARRAY_FIELDS = new Set(["keywords", "rules", "forbidden"]);
const text = (value) => typeof value === "string" ? value : "";
const list = (value) => Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];

export function mapBrandIdentity(row) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  return {
    id: row.id, key: row.slug, name: row.name, description: text(row.description),
    updatedAt: row.updated_at || null, glyph: text(meta.glyph) || "○",
    orgScope: text(meta.org_scope) || canonicalOrgScopeForKey(row.slug),
    philosophy: text(meta.philosophy), direction: text(meta.direction), voice: text(meta.voice),
    audience: text(meta.audience), promise: text(meta.promise), offer: text(meta.offer),
    voiceExamples: text(meta.voice_examples), currentFocus: text(meta.current_focus),
    operatingState: text(meta.operating_state), isFocused: meta.is_focused === true,
    identityConfirmedAt: meta.identity_confirmed_at || null,
    cadence: text(meta.cadence), weeklyGoal: meta.weekly_goal ?? null,
    keywords: list(meta.keywords), rules: list(meta.content_rules), forbidden: list(meta.forbidden_terms),
    channels: list(meta.channels), sourceLinks: list(meta.source_links),
  };
}

export function brandIdentityDraft(brand) {
  return {
    id: brand.id, expectedUpdatedAt: brand.updatedAt,
    ...Object.fromEntries(BRAND_IDENTITY_FIELDS.map(([key]) => [key,
      ARRAY_FIELDS.has(key) ? (brand[key] || []).join("\n") : brand[key] || "",
    ])),
    operatingState: brand.operatingState || "", isFocused: brand.isFocused ? "yes" : "no",
    confirmation: "unconfirmed",
  };
}

export function brandIdentityPayload(draft) {
  return {
    id: draft.id, expectedUpdatedAt: draft.expectedUpdatedAt,
    identity: Object.fromEntries(BRAND_IDENTITY_FIELDS.map(([key]) => [key,
      ARRAY_FIELDS.has(key) ? draft[key].split("\n").map((v) => v.trim()).filter(Boolean) : draft[key].trim(),
    ])),
    operatingState: draft.operatingState, isFocused: draft.isFocused === "yes",
    confirmIdentity: draft.confirmation === "confirmed",
  };
}
