// 넓은 기록창의 오른쪽 읽기 칸 — 무엇을 어떤 말로 보일지. 순수(React · fetch 없음).
//
// 쓰는 동안 읽던 내용(약속 · 최근 기록)이 옆에 남는다(2026-09-30 넓은 기록창 ②, 권장 · 화면 확인 뒤
// 확정). 이 칸은 읽기만 한다 — 저장 · 삭제 · 약속 바꾸기는 기록 칸과 '고객 정보로'의 몫이다.
// 기록 한 줄기는 드로어가 이미 읽어 둔 것(활동 + 연결 메모, 최신순)을 그대로 받는다.

import { REACTIONS, recordReceipt } from "./contact-record.js";
import { recordTimeLabel } from "./customer-list.js";

// 기록 종류의 글리프와 이름 — 고객 드로어의 기록 줄과 읽기 칸이 같은 표를 쓴다.
export const ACTIVITY_ICON = { email: "email", meeting: "calendar", call: "signal", note: "edit", deal: "deals", kakao: "chat", quote: "orders", ai: "sparkle", info_session: "brief", demo: "play", visit: "building", update: "rhythm", memo: "pencil" };
export const ACTIVITY_LABEL = { email: "이메일", meeting: "미팅", call: "통화", note: "노트", deal: "거래", kakao: "카카오", quote: "견적", ai: "AI", info_session: "설명회", demo: "데모", visit: "방문", update: "업데이트", memo: "메모" };

const REACTION_LABEL = Object.fromEntries(REACTIONS.map((r) => [r.key, r.label]));

// 읽기 칸이 보이는 기록 수 — 쉬는 드로어와 같은 5건(전체는 '고객 정보로'에서).
export const RECORD_CONTEXT_LIMIT = 5;

// 한 줄기 안의 모양(Q-CR6) — 연락은 원, 메모는 네모, 그 밖(거래 · 견적 · 자동 기록)은 흐린 원.
// 점선 · 점은 확실성(권장 · 미정)의 몫이라 쓰지 않는다(DESIGN §5.3).
const CONTACT_TYPES = new Set(["call", "meeting", "visit", "demo", "kakao", "email", "info_session"]);
const MEMO_TYPES = new Set(["note", "memo"]);

export function recordRowShape(row = {}) {
  if (row.source === "memo" || MEMO_TYPES.has(String(row.type || ""))) return "memo";
  return CONTACT_TYPES.has(String(row.type || "")) ? "contact" : "event";
}

// 접힌 줄은 첫 문장만(두 줄까지), 누르면 그 자리에서 전부 — 쓰던 글을 떠나지 않는다.
// 두 줄 접힘은 펼칠 수 있는 줄에만 건다(스타일시트): 펼칠 수 없는 줄은 접지 않고 전부 보이므로,
// 읽을 길 없는 말줄임이 생기지 않는다. 한 줄짜리 기록은 이 길이를 넘을 때만 접는다 — 그보다 짧은
// 줄(서너 줄 안)은 그대로 다 보이는 편이 눌러서 같은 글을 다시 보는 것보다 낫다.
export const TITLE_FOLD = 72;

export function recordContextRows(stream = [], { today = new Date(), limit = RECORD_CONTEXT_LIMIT } = {}) {
  return (Array.isArray(stream) ? stream : []).slice(0, limit).map((row, index) => {
    const lines = [row.msg, row.detail]
      .flatMap((part) => String(part || "").split(/\r?\n/))
      .map((line) => line.trim())
      .filter(Boolean);
    const title = lines[0] || "—";
    const shape = recordRowShape(row);
    return {
      key: String(row.id ?? `row-${index}`),
      shape,
      icon: ACTIVITY_ICON[row.type] || "edit",
      typeLabel: ACTIVITY_LABEL[row.type] || String(row.type || ""),
      // 메모는 연락으로 세지 않는다 — 모양에 더해 글자로도 말한다(모양만으로 뜻을 나르지 않는다).
      note: shape === "memo" ? "연락 아님" : "",
      reactionLabel: row.reaction ? REACTION_LABEL[row.reaction] || String(row.reaction) : "",
      title,
      full: lines.join("\n"),
      lineCount: lines.length,
      expandable: lines.length > 1 || title.length > TITLE_FOLD,
      // 펼치는 곳의 말 — 여러 줄이면 "자세히 N줄", 긴 한 줄이면 줄 수를 세지 않고 "펼치기".
      openLabel: lines.length > 1 ? "lines" : title.length > TITLE_FOLD ? "line" : "",
      receipt: recordReceipt(row),
      when: recordTimeLabel(row.occurredAt, today, row.at || ""),
    };
  });
}

// 읽기 칸의 출처 정직성 — 드로어가 이미 아는 읽기 상태를 그대로 옮긴다(새 읽기를 만들지 않는다).
//   loading — 활동을 읽는 중(Skeleton).          error — 활동 읽기 실패(없는 게 아니라 못 읽은 것).
//   preview — 연결 전.                           partial — 활동은 읽었고 연결 메모는 못 읽었다.
// retry는 어느 읽기를 다시 할지("activities" | "memos")다. 어느 경우에도 쓰기는 막지 않는다.
export function recordContextTruth({ actSync = "loading", memoEnabled = false, memoStatus = "" } = {}) {
  if (actSync === "loading") return { state: "loading", reason: "", retry: null };
  if (actSync === "error") return { state: "error", reason: "활동 기록을 읽지 못했어요", retry: "activities" };
  if (actSync !== "live") return { state: "preview", reason: "", retry: null };
  if (memoEnabled && memoStatus === "error") return { state: "partial", reason: "연결 메모를 읽지 못했어요", retry: "memos" };
  return { state: "live", reason: "", retry: null };
}
