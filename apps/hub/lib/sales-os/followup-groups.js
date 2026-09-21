// 고객 연락 묶음 계약 — 순수, import 없음.
//
// 서버(followups-ledger)와 클라이언트(followups.jsx)가 같은 정의를 봐야 하는데, 페이지가
// 저장소 모듈을 import하면 server-read/server-write까지 클라이언트 청크로 끌려온다.
// 그래서 묶음 규칙만 여기 따로 둔다.
//
// 화면은 세 묶음만 본다: 내가 어긴 약속 → 오늘 하기로 한 약속 → 나머지(접힘).
// Q117 계층 전체(트래킹·단계·무접촉)를 정렬 축으로 쓰는 것은 후속(2a)이고, 여기서는
// "약속"만 위로 올린다. 묶음 안 순서는 기존 priority를 그대로 쓴다.

export const FOLLOWUP_GROUPS = [
  { key: "missed", label: "먼저 정리할 것", hint: "약속한 연락일이 지났어요" },
  { key: "today", label: "오늘 연락하기로 한 고객", hint: null },
  { key: "rest", label: "지켜보는 고객", hint: "약속 날짜가 아직 없거나 남은 건" },
];

// 빨강 예산(DESIGN §5.3): 어긴 약속에도 레일은 상단 3개까지.
export const MAX_DANGER_RAILS = 3;

export function groupFollowups(items = []) {
  const groups = { missed: [], today: [], rest: [] };
  for (const item of items) {
    if (item?.bucket === "overdue") groups.missed.push(item);
    else if (item?.bucket === "today") groups.today.push(item);
    else groups.rest.push(item);
  }
  return groups;
}
