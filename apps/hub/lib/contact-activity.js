// 연락으로 세는 crm_activities.kind — record_contact_outcome_v1이 쓰는 채널 값. update/note/deal/ai는
// 고객과의 접촉이 아니라 내부 기록이라 제외한다. 주간 리포트와 저녁 리뷰가 같은 정의를 쓴다
// (2026-09-20 세 축·Action KPI 기획 §6.3·§7.3).
export const CONTACT_ACTIVITY_KINDS = new Set(["call", "meeting", "info_session", "demo", "visit", "email", "kakao", "quote"]);

export function isContactActivity(row) {
  return CONTACT_ACTIVITY_KINDS.has(String(row?.kind || "").toLowerCase());
}
