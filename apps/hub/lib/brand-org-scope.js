// 브랜드 org_scope의 단일 정본 (2026-09-01 2609 감사 #6·#12).
//
// 같은 3키 테이블이 operating-ledger에만 있고 content-ledger·workspace-map은 각자
// 다른 규칙(meta만 읽기 / 무조건 personal)을 쓰던 탓에, meta.org_scope가 비어 있는
// ClassIn 브랜드가 표면마다 다른 레인에 꽂혔다 — 특히 workspace-map의 문자열 키
// 경로는 항상 personal을 돌려줘 ClassIn 콘텐츠 큐가 상시 0건이었다.
//
// 정본 판정 (2026-08-29 브랜드 탭 설계 §5.2): classmoon·studyseagull·classin_side만
// ClassIn, 나머지는 개인. meta.org_scope가 오면 그것이 이긴다.
export const CANONICAL_BRAND_ORG_SCOPE = {
  classmoon: "classin",
  studyseagull: "classin",
  classin_side: "classin",
};

export function canonicalOrgScopeForKey(key) {
  return CANONICAL_BRAND_ORG_SCOPE[key] || "personal";
}
