// 운영 제외 게이트 — 운영자 결정 D3(2026-10-07, docs/evaluations/2026-10-07-weekly-direction-check.md §5).
// 운영자 확정 전에 들어온 기능은 10/14·11월 판정까지 운영 화면에서 닫는다. 코드·API·테스트는 그대로 두고
// 진입점만 막으므로, 켜려면 값 하나를 true로 바꾸고 해당 스펙의 상태를 확정으로 고친 뒤 feature-gates.test를 맞춘다.
export const FEATURE_GATES = Object.freeze({
  // 오피스 업무 나누기(H1)와 자동 진행 — docs/superpowers/specs/2026-10-01-office-harness-work-breakdown-design.md (권장)
  officeWorkBreakdown: false,
  // 확인할 것 단계 3 막힘 풀기 — 카드 끝내기 2종과 프로젝트 상세의 막힘 풀기 섹션
  // (docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §5, 방향만 운영자 선택)
  checkItemUnblock: false,
  // 확인할 것 단계 4 결정 일지 — 카드의 `결정으로 남기기`, Decisions의 이름·출처·그래서 할 일, 회의 결정 수집 (같은 스펙 §6, 권장)
  decisionJournal: false,
});
