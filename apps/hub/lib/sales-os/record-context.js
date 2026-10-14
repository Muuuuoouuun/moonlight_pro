// 넓은 기록창의 오른쪽 읽기 칸 — 무엇을 어떤 말로 보일지. 순수(React · fetch 없음).
//
// 쓰는 동안 읽던 내용(약속 · 최근 기록)이 옆에 남는다(2026-09-30 넓은 기록창 ②, 권장 · 화면 확인 뒤
// 확정). 이 칸은 읽기만 한다 — 저장 · 삭제 · 약속 바꾸기는 기록 칸과 '고객 정보로'의 몫이다.
// 기록 한 줄기는 드로어가 이미 읽어 둔 것(활동 + 연결 메모, 최신순)을 그대로 받는다.

import { REACTIONS, recordReceipt } from "./contact-record.js";
import { recordTimeLabel } from "./customer-list.js";

// 기록 종류의 글리프와 이름 — 고객 드로어의 기록 줄과 읽기 칸이 같은 표를 쓴다.
export const ACTIVITY_ICON = { email: "email", meeting: "calendar", call: "signal", note: "edit", deal: "deals", kakao: "chat", quote: "orders", ai: "sparkle", info_session: "brief", demo: "play", visit: "building", update: "rhythm", memo: "pencil" };
export const ACTIVITY_LABEL = { email: "이메일", meeting: "미팅", call: "통화", note: "메모", deal: "거래", kakao: "카카오", quote: "견적", ai: "AI", info_session: "설명회", demo: "데모", visit: "방문", update: "업데이트", memo: "메모" };

const REACTION_LABEL = Object.fromEntries(REACTIONS.map((r) => [r.key, r.label]));

// 읽기 칸이 보이는 기록 수 — 쉬는 드로어와 같은 5건(전체는 '고객 정보로'에서).
export const RECORD_CONTEXT_LIMIT = 5;

// 한 줄기 안의 모양(Q-CR6) — 연락은 원, 메모는 네모, 그 밖(거래 · 견적 · 자동 기록)은 흐린 원.
// 점선 · 점은 확실성(권장 · 미정)의 몫이라 쓰지 않는다(DESIGN §5.3).
const CONTACT_TYPES = new Set(["call", "meeting", "visit", "demo", "kakao", "email", "info_session"]);
const MEMO_TYPES = new Set(["note", "memo"]);
const MEMO_LABEL = "메모";

export function recordRowShape(row = {}) {
  if (row.source === "memo" || MEMO_TYPES.has(String(row.type || ""))) return "memo";
  return CONTACT_TYPES.has(String(row.type || "")) ? "contact" : "event";
}

// 한 줄의 모양 · 이름 · 덧말 — 읽기 칸과 쉬는 드로어의 기록 줄이 같은 말을 쓴다(한 드로어 안에서 같은 줄이
// '메모'와 '노트' 두 이름으로 서지 않게). 메모는 연락으로 세지 않는다 — 모양(네모)에 더해 글자로도 말한다
// (모양만으로 뜻을 나르지 않는다). 활동 노트(crm_activities note)와 연결 메모(journal)는 같은 이름 '메모'다.
export function recordRowKind(row = {}) {
  const shape = recordRowShape(row);
  return {
    shape,
    typeLabel: shape === "memo" ? MEMO_LABEL : ACTIVITY_LABEL[row.type] || String(row.type || ""),
    note: shape === "memo" ? "연락 아님" : "",
  };
}

// 기록 거르기(Q-CR6) — 전체 · 연락 · 메모. 모양과 같은 구분을 쓴다(연락 = 원, 메모 = 네모).
// 거래 · 견적 · 자동 기록(흐린 원)은 '전체'에서만 보인다.
export const RECORD_FILTERS = [
  { key: "all", label: "전체" },
  { key: "contact", label: "연락" },
  { key: "memo", label: "메모" },
];
const FILTER_KEYS = new Set(RECORD_FILTERS.map((f) => f.key));

export function filterRecordStream(stream = [], filter = "all") {
  const rows = Array.isArray(stream) ? stream : [];
  if (!FILTER_KEYS.has(filter) || filter === "all") return rows;
  return rows.filter((row) => recordRowShape(row) === filter);
}

// 거른 뒤 아무것도 없을 때의 말 — "기록 없음"과 "이 종류가 없음"을 나눠 말한다.
const FILTER_EMPTY = { contact: "연락 기록이 아직 없어요.", memo: "메모가 아직 없어요." };
export function recordFilterEmptyCopy(filter = "all") {
  return FILTER_EMPTY[filter] || "아직 기록이 없어요.";
}

// 보일 줄이 하나도 없을 때 그 자리에 무엇을 둘지 — { kind: "loading", label } | { kind: "text", text }.
// "없어요"는 읽은 것에만 말한다: 연결 메모를 아직 읽는 중이거나 읽지 못했으면 메모가 '없는' 게 아니다
// (읽기 실패를 빈 상태로 그리지 않는다 — DESIGN §5.3 · §11). 다시 읽기는 머리 줄의 '일부 데이터' 옆에 있다.
//   filter — 고른 거르기.  total — 거르기 전 줄 수(0이면 거르기 칸이 없으므로 '전체'로 읽는다).
//   state  — recordContextTruth(...).state.  memos — recordContextTruth(...).memos.
const MEMO_UNREAD = {
  error: { memo: "메모를 읽지 못했어요 — 없는 게 아니라 못 읽은 거예요.", all: "활동 기록은 없어요 · 연결 메모는 읽지 못했어요." },
  preview: { memo: "연결 전이라 메모를 읽을 수 없어요.", all: "활동 기록은 없어요 · 연결 전이라 메모는 읽을 수 없어요." },
};
export function recordEmptyPlan({ filter = "all", total = 0, state = "live", memos = "live" } = {}) {
  if (state === "preview" && total === 0) return { kind: "text", text: "연결 전이라 지난 기록을 읽을 수 없어요." };
  const shown = total > 0 && FILTER_KEYS.has(filter) ? filter : "all";
  // 연락만 거른 줄은 메모 읽기와 무관하다 — 활동은 이미 읽었다.
  if (shown !== "contact") {
    if (memos === "loading") return { kind: "loading", label: "메모 불러오는 중" };
    if (MEMO_UNREAD[memos]) return { kind: "text", text: MEMO_UNREAD[memos][shown] };
  }
  return { kind: "text", text: recordFilterEmptyCopy(shown) };
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
    return {
      key: String(row.id ?? `row-${index}`),
      ...recordRowKind(row),
      icon: ACTIVITY_ICON[row.type] || "edit",
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

// 연결 메모(journal)를 기록 줄기의 줄로 — 읽어 온 메모 + 방금 이 창에서 저장이 확인된 메모.
//   entries — journal-search가 돌려준 메모({ id, title, excerpt, occurredAt, revision }).
//   saved   — 서버의 답(saved | duplicate)을 받은 메모의 스냅숏(savedMemoSnapshot).
// 저장이 확인된 메모는 다시 읽기가 닿기 전에도 줄로 서고(본문 그대로), 영수증 "저장됨 hh:mm"을 단다 —
// 서버가 답하기 전의 메모는 여기 오지 않는다(메모에는 되돌리기 창이 없다: 낙관 줄을 만들지 않는다).
// 다시 읽은 메모가 스냅숏보다 새 판(revision)이면 — 다른 창이나 메모 창에서 그 뒤에 고쳐 저장했다 — 읽어 온
// 글이 이긴다: 옛 스냅숏이 새 저장본을 가려 '고친 게 저장되지 않은 것처럼' 보이지 않게. 영수증은 남는다.
export function memoStreamRows(entries = [], saved = []) {
  const receipts = new Map((Array.isArray(saved) ? saved : []).filter((m) => m?.id).map((m) => [m.id, m]));
  const seen = new Set();
  const rows = [];
  const line = (id, title, text, occurredAt) => ({
    id: `memo:${id}`, noteId: id, source: "memo", type: "memo",
    msg: title || text || "제목 없는 메모",
    detail: title ? text : "",
    occurredAt,
  });
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const mine = receipts.get(entry.id);
    const read = line(entry.id, entry.title, entry.excerpt, entry.occurredAt);
    if (!mine) { rows.push(read); continue; }
    const stale = Number(entry.revision) > Number(mine.revision);
    rows.push({
      ...(stale ? read : line(entry.id, mine.title || entry.title, mine.body || entry.excerpt, entry.occurredAt || mine.occurredAt)),
      receipt: "saved", savedAt: mine.savedAt,
    });
  }
  for (const mine of receipts.values()) {
    if (seen.has(mine.id)) continue;
    rows.push({ ...line(mine.id, mine.title, mine.body, mine.occurredAt), receipt: "saved", savedAt: mine.savedAt });
  }
  return rows;
}

// 기록 한 줄기 — 활동(crm_activities)과 연결 메모 줄을 최신순으로 섞는다. 시각을 못 읽는 줄(저장 전 낙관 줄)은
// 맨 위에 선다. 고객 드로어의 줄기와 같은 규칙이다(오늘 연락에서 연 기록창의 읽기 칸이 쓴다).
export function recordStream(activities = [], memoRows = []) {
  const time = (value) => {
    const n = Date.parse(value || "");
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  const acts = (Array.isArray(activities) ? activities : []).map((row) => ({ ...row, source: "activity" }));
  return [...acts, ...(Array.isArray(memoRows) ? memoRows : [])].sort((a, b) => time(b.occurredAt) - time(a.occurredAt));
}

// 이 고객의 활동을 읽는 질의 — 고객 드로어와 같은 길(`/api/hub/revenue/activity`), 같은 조인 규칙이다:
// live crm_activities는 대부분 company_id로만 이어져 있으므로 회사가 있으면 회사로 읽고, 없을 때만 자신의
// id로 읽는다(계약 고객 accountId · 거래 dealId · 그 밖은 leadId). id가 없으면 읽을 것이 없다(빈 문자열).
export function recordActivityQuery(target = {}) {
  if (!target?.id) return "";
  if (target.companyId) return `companyId=${encodeURIComponent(target.companyId)}`;
  const param = target.kind === "account" ? "accountId" : target.kind === "deal" ? "dealId" : "leadId";
  return `${param}=${encodeURIComponent(target.id)}`;
}

// 저장이 확인된 메모의 스냅숏 — 서버가 돌려준 메모(entry)에서 줄기가 쓰는 것만. at은 답을 받은 시각이다.
export function savedMemoSnapshot(entry, at) {
  if (!entry?.id) return null;
  return { id: entry.id, title: entry.title || "", body: entry.body || "", occurredAt: entry.occurredAt || at, revision: entry.revision, savedAt: at };
}

// 스냅숏 목록에 방금 확인된 저장을 얹는다 — 순수.
//   add: true  — 메모 모드가 저장한 새 메모: 맨 위에 세운다(같은 ID면 바꾼다).
//   add: false — 메모 창에서 고쳐 저장한 메모: 이 창이 이미 들고 있는 스냅숏만 새 글로 바꾼다
//                (들고 있지 않은 옛 메모는 다시 읽기가 가져온다 — 영수증을 새로 만들지 않는다).
export function upsertSavedMemo(list = [], entry, at, { add = true } = {}) {
  const prev = Array.isArray(list) ? list : [];
  const snapshot = savedMemoSnapshot(entry, at);
  if (!snapshot) return prev;
  if (add) return [snapshot, ...prev.filter((m) => m.id !== snapshot.id)];
  return prev.some((m) => m.id === snapshot.id) ? prev.map((m) => (m.id === snapshot.id ? snapshot : m)) : prev;
}

// 읽기 칸의 출처 정직성 — 드로어가 이미 아는 읽기 상태를 그대로 옮긴다(새 읽기를 만들지 않는다).
//   loading — 활동을 읽는 중(Skeleton).          error — 활동 읽기 실패(없는 게 아니라 못 읽은 것).
//   preview — 연결 전.                           partial — 활동은 읽었고 연결 메모는 못 읽었다.
// retry는 어느 읽기를 다시 할지("activities" | "memos")다. 어느 경우에도 쓰기는 막지 않는다.
// memos는 연결 메모 읽기만의 상태다 — "off"(이 고객에는 연결 메모가 없다: uuid 아님) | "loading" | "error" |
// "preview" | "live". 빈 자리가 "메모가 없어요"라고 말해도 되는지는 이 값이 정한다(recordEmptyPlan).
const MEMO_READ = new Set(["loading", "error", "live"]);
export function recordContextTruth({ actSync = "loading", memoEnabled = false, memoStatus = "" } = {}) {
  const memos = !memoEnabled ? "off" : MEMO_READ.has(memoStatus) ? memoStatus : "preview";
  if (actSync === "loading") return { state: "loading", reason: "", retry: null, memos };
  if (actSync === "error") return { state: "error", reason: "활동 기록을 읽지 못했어요", retry: "activities", memos };
  if (actSync !== "live") return { state: "preview", reason: "", retry: null, memos };
  if (memos === "error") return { state: "partial", reason: "연결 메모를 읽지 못했어요", retry: "memos", memos };
  return { state: "live", reason: "", retry: null, memos };
}
