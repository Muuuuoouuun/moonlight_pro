// 연락으로 세는 crm_activities.kind — record_contact_outcome_v1이 쓰는 채널 값. update/note/deal/ai는
// 고객과의 접촉이 아니라 내부 기록이라 제외한다. 주간 리포트와 저녁 리뷰가 같은 정의를 쓴다
// (2026-09-20 세 축·Action KPI 기획 §6.3·§7.3).
//
// 정의 자체는 고객 연락 화면(followup-scoring.js CONTACT_KINDS, CRM 0a)이 정본이다 — 2026-09-23
// 통합 때 같은 8종이 두 곳에 따로 선언돼 있던 것을 하나로 모았다. 여기서는 행 판정 헬퍼만 둔다.
import { CONTACT_KINDS } from "./sales-os/followup-scoring.js";

export const CONTACT_ACTIVITY_KINDS = CONTACT_KINDS;

export function isContactActivity(row) {
  return CONTACT_KINDS.has(String(row?.kind || "").toLowerCase());
}
