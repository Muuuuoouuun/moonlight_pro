// 조언 레인 판정 — 한 고객·거래 레코드가 회사(ClassIn) 레인인지 개인 레인인지.
//
// 2026-09-25 Guru 경계 교정(b6a2917d)이 고객 상세에 둔 판정을 공용으로 옮긴 것이다. 범위 태그
// (workspace)·유형(type)·브랜드(brand) 셋 중 알려진 값이 모두 같은 레인을 가리킬 때만 그 레인을
// 고른다. 서로 어긋나거나 모르는 범위 값이면 막는다 — 틀린 원장으로 고객 내용을 보내는 것보다
// "소속 확인 필요"가 낫다. 레거시 회사 유형(type === 'company')은 ClassIn으로 인정한다.
//
// 이 판정은 AI 호출(영업 멘토 = ClassIn, 브랜드 멘토 = 개인) 경로를 고르는 데만 쓴다.
// 레코드를 숨기거나 거르는 데 쓰지 않는다.

import { brandInWorkspace } from "@/components/hub/workspace-map";

export function adviceScopeForRecord(row = {}) {
  const workspaceScope = row.workspace === "classin" ? "classin" : row.workspace === "brand" ? "personal" : null;
  const typeScope = row.type === "company" ? "classin" : row.type === "personal" ? "personal" : null;
  const hasBrand = Boolean(row.brand) && row.brand !== "all" && row.brand?.key !== "all";
  const brandScope = hasBrand
    ? brandInWorkspace(row.brand, "classin") ? "classin" : brandInWorkspace(row.brand, "brand") ? "personal" : null
    : null;
  // 알 수 없는 명시 범위 값과 서로 어긋난 표시는 원장을 고를 수 없다.
  const unsupportedWorkspace = row.workspace != null && row.workspace !== "" && !workspaceScope;
  const knownScopes = [workspaceScope, typeScope, brandScope].filter(Boolean);
  const blocked = unsupportedWorkspace || new Set(knownScopes).size > 1;
  return { scope: blocked ? null : knownScopes[0] || null, blocked };
}
