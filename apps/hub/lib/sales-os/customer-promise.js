// 약속만 옮기는 쓰기 계약 — 고객 드로어의 "약속 정하기 · 날짜 다시"(2026-09-24 목업 02).
//
// 약속(next_action + meta.next_action_at)은 지금까지 연락 기록 RPC(record_contact_outcome_v1)만
// 썼다. 그런데 날짜를 다시 잡는 건 연락이 아니다 — RPC로 보내면 활동 한 줄이 생기고
// last_touch_at이 오늘로 바뀌어 "마지막 연락 · 오늘"과 주간 연락 수가 거짓이 된다. 그래서
// 리드·계정 update 라우트가 약속 필드만 따로 받는다.
//
// 키는 일부러 snake_case다. 표시 모델(mapLead·mapAccount)은 nextActionAt(camel)을 싣고 있고,
// Leads 편집 드로어는 그 모델을 통째로 저장한다 — 같은 키를 받으면 페이지를 연 뒤 다른 곳에서
// 바뀐 약속 날짜를 오래된 값으로 되돌린다. snake 키는 명시적으로 보낸 호출만 쓴다
// (next_action·snooze_until과 같은 관례).
//
// 순수, import 없음.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// → meta 부분 patch. 날짜를 정하면 기약 없음이 풀린다(buildFollowupWrite·RPC와 같은 계약).
// 빈 값은 날짜만 지운다. 형식이 틀린 날짜는 쓰지 않는다(빈 patch → 라우트가 noop으로 답한다).
export function promiseMetaPatch(payload = {}) {
  if (!payload || payload.next_action_at === undefined) return {};
  const at = String(payload.next_action_at ?? "").trim();
  if (!at) return { next_action_at: null };
  if (!DATE_ONLY.test(at)) return {};
  return { next_action_at: at, dormant: false, dormant_since: null };
}

// 무엇(next_action)은 리드·계정 모두 실제 컬럼이다. undefined면 건드리지 않고 ""는 비운다.
export function promiseColumns(payload = {}) {
  if (!payload || payload.next_action === undefined) return {};
  return { next_action: String(payload.next_action ?? "").trim() || null };
}
