// 고객 삭제 가드의 **순수** 계약 — 상수와 표시 문자열만. 서버 read/write를 import하지
// 않으므로 클라이언트 번들에서도 안전하게 쓸 수 있다. 실제 참조 조회는 customer-delete.js
// (서버 전용)가 하고, 이 파일은 양쪽이 같은 단어를 쓰게 하는 용도다.

// delete payload에 이 값을 실으면 서버가 참조 검사를 강제한다. 값이 없으면 종전처럼
// 무조건 삭제 — Leads 화면의 기존 삭제 경로가 그대로 동작하도록 opt-in으로 둔다.
export const UNREFERENCED_GUARD = "unreferenced";

export const REFERENCE_LABELS = {
  deals: "딜",
  projects: "프로젝트",
  cases: "운영 케이스",
  activities: "활동 기록",
};

// { deals: 2, activities: 5 } → "딜 2건 · 활동 기록 5건"
export function describeReferences(counts = {}) {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${REFERENCE_LABELS[key] || key} ${n}건`)
    .join(" · ");
}
