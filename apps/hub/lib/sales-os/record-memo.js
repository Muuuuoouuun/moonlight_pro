// 넓은 기록창의 메모 모드 — 저장 줄이 무엇을 어떤 말로 보일지. 순수(React · fetch 없음).
//
// 메모는 새 저장소를 만들지 않는다: 일지 메모 작성기(useMemoDocument · createJournalWriter)가 그대로 쓴다.
// 그 작성기의 계약 — 요청은 브라우저에 먼저 남고(pending), 서버가 saved | duplicate로 답해야 저장됨이며,
// 답을 못 받으면 같은 요청으로 다시 확인한다(중복으로 생기지 않는다) — 을 기록창의 말로 옮길 뿐이다.
// "저장됨"은 서버가 답한 뒤에만 선다(DESIGN §8.1 Save envelope). 실패는 글을 지우지 않는다.

import { draftHintCopy, receiptTimeLabel } from "./contact-record.js";
import { initialMemoContexts, noteToDraft } from "../journal-client.js";

// 메모 칸이 어디까지 왔는가.
//   booting     — 메모 저장소(워크스페이스)를 확인하는 중. 아직 쓸 칸이 없다.
//   boot-error  — 저장소를 확인하지 못했다(없는 게 아니라 못 읽은 것). 다시 불러온다.
//   saving      — 요청을 보냈고 서버의 답을 기다린다.
//   unconfirmed — 보냈지만 답을 받지 못했다. 같은 요청으로 다시 확인한다.
//   conflict    — 다른 창이 같은 메모를 먼저 저장했다. 어느 쪽을 쓸지 고른다.
//   failed      — 서버가 거절했다. 글은 그대로다.
//   preview     — 연결 전. 저장되지 않는다.
//   missing     — 빈 메모로 저장을 눌렀다.
//   saved       — 방금 저장이 확인됐다: 칸이 비어 다음 메모를 쓸 수 있거나, 작성기가 저장본을 든 채
//                 아직 다음 메모로 넘어가기 전이다(stored — 저장된 글을 '서버에 없는 초안'이라고 하지 않는다).
//   draft       — 쓰는 중. 서버에는 아직 없다.
//   idle        — 빈 칸.
// handoff: 저장이 확인된 직후, 다음 메모의 작성기가 서는 한 박자(미리 세워 둔 빈 초안을 읽는 동안)다. 그
// 사이를 '확인 중'으로 되돌리지 않는다 — 방금 받은 저장 확인(영수증)이 곧바로 서고 칸은 그대로 서 있다.
export function recordMemoPhase({ boot = "ready", ready = false, source = "loading", busy = false, pending = false, conflict = false, saveState = "idle", empty = true, attempted = false, savedAt = null, stored = false, handoff = false } = {}) {
  if (boot === "error") return "boot-error";
  if (boot !== "ready") return "booting";
  if (!ready) return handoff && savedAt ? "saved" : "booting";
  if (busy) return "saving";
  if (pending) return "unconfirmed";
  if (conflict) return "conflict";
  if (saveState === "error") return "failed";
  if (stored) return "saved";
  if (source !== "live") return "preview";
  if (empty && attempted) return "missing";
  if (empty && savedAt) return "saved";
  return empty ? "idle" : "draft";
}

// 초안이 놓인 곳 — 일지 작성기는 탭 저장소(sessionStorage)에 쓰고, 막힌 창에서는 메모리 사본만 든다.
export function memoDraftPlace({ localError = false } = {}) {
  return localError ? "memory" : "tab";
}

const PRIMARY = {
  booting: { label: "메모 저장", action: null, disabled: true },
  "boot-error": { label: "다시 불러오기", action: "reload", disabled: false },
  saving: { label: "저장 중…", action: null, disabled: true },
  unconfirmed: { label: "저장 결과 확인", action: "confirm", disabled: false },
  conflict: { label: "내 글로 저장", action: "overwrite", disabled: false },
  // 연결 전에는 저장할 길이 없다 — 눌러도 아무 일 없는 '메모 저장'을 두지 않는다(이유는 저장 줄이 말한다).
  preview: { label: "저장할 수 없음", action: null, disabled: true },
};
const SAVE = { label: "메모 저장", action: "save", disabled: false };

// 저장 줄 — { phase, line: { progress, note }, receipt, primary }.
//   line    — RecordSaveLine이 그대로 그린다(연락 기록의 저장 줄과 같은 문법: 진행 · 말 한 줄 · 실패는 레일 + 제목).
//   receipt — 방금 저장이 확인된 메모의 영수증(RecordReceipt). line 대신 선다.
//   primary — 이 화면의 하나뿐인 주 버튼. 죽은 버튼은 확인 중(booting) · 저장 중 · 연결 전(preview)뿐이고,
//             그때는 line이 이유를 말한다.
// message는 작성기(서버 · 저장소)가 준 원인이다. 쓰는 중에는 저장을 눌러 본 뒤(attempted)에만 보인다 —
// 작성기가 여는 순간 남기는 안내(업무 연결 고르기 등)는 이 칸에 없는 조작을 가리키므로 옮기지 않는다.
export function recordMemoLine({ boot = "ready", bootMessage = "", ready = false, source = "loading", busy = false, pending = false, conflict = false, saveState = "idle", message = "", localError = false, empty = true, attempted = false, savedAt = null, stored = false, handoff = false } = {}) {
  const phase = recordMemoPhase({ boot, ready, source, busy, pending, conflict, saveState, empty, attempted, savedAt, stored, handoff });
  const place = memoDraftPlace({ localError });
  const kept = place === "tab" ? "쓰던 글은 이 탭에 남아 있어요." : "쓰던 글은 이 창에 남아 있어요(새로고침하면 사라져요).";
  let progress = null;
  let note = null;
  let receipt = null;

  if (phase === "booting") progress = { label: "메모 저장소 확인 중", canUndo: false };
  else if (phase === "boot-error") note = { tone: "error", title: "메모 칸을 열지 못함", text: bootMessage || "메모 저장소를 확인하지 못했어요. 다시 불러와 주세요." };
  else if (phase === "saving") progress = { label: "저장 중", canUndo: false };
  else if (phase === "unconfirmed") note = { tone: "error", title: "저장 확인 못 함", text: `저장됐는지 확인하지 못했어요 — 같은 요청으로 다시 확인하면 두 번 생기지 않아요. ${kept}` };
  else if (phase === "conflict") note = { tone: "error", title: "저장 못 함", text: `다른 창에서 이 메모를 먼저 저장했어요 — 내 글로 저장하면 그 저장본을 고쳐 써요. ${kept}` };
  else if (phase === "failed") note = { tone: "error", title: "저장 못 함", text: `${message || "메모를 저장하지 못했어요."} ${kept}` };
  else if (phase === "preview") note = { tone: "warn", text: `Preview · 연결 필요 — 메모가 저장되지 않아요.${empty ? "" : ` ${kept}`}` };
  else if (phase === "missing") note = { tone: "missing", text: "메모를 한 줄 쓰면 저장돼요." };
  else if (phase === "saved") receipt = { phase: "saved", label: "메모 저장됨", time: receiptTimeLabel(savedAt), detail: "연락으로 세지 않았어요", settled: true };
  else if (attempted && message) note = { tone: "warn", text: message };
  else note = { tone: "hint", text: draftHintCopy(place, { dirty: phase === "draft" }) };

  return { phase, line: { progress, note }, receipt, primary: PRIMARY[phase] || SAVE };
}

// 다시 연 메모 칸이 쓰던 글을 되살렸는가 — 처음 준비된 순간 본문이 있으면 되살린 초안이다.
export function memoRestoredCopy({ localError = false } = {}) {
  return localError ? "초안 · 새로고침 전까지 · 쓰던 메모를 불러왔어요" : "초안 · 이 탭 · 쓰던 메모를 불러왔어요";
}

// 다음 메모의 빈 초안 — 저장이 확인된 직후 같은 고객의 다음 메모가 기다림 없이 서도록, 작성기의 탭 사본
// (journal-browser-store)으로 미리 둘 것. 작성기는 자기 사본이 있으면 문맥을 다시 확인하러 가지 않는다 —
// 그 왕복 동안 글쓰기 칸이 사라지고(Skeleton) 커서가 문서로 떨어져, 이어 친 글자가 전역 단축키로 새던 자리다.
//   id       — 새로 받은 메모 ID.
//   contexts — 서버가 방금 돌려준 메모의 문맥(entry.contexts: 확인된 이름 그대로).
//   seeds    — 이 칸이 붙이는 고객(호출처의 contexts).
//   scope    — 앞 메모의 명시 범위. 새 메모의 기본값은 작성기와 같은 personal이다.
// 문맥은 서버가 확인해 준 것만 쓴다 — 이 칸의 고객 가운데 하나라도 거기 없으면 null(작성기가 지금처럼 확인한다).
// 빈 초안이라 dirty가 아니다: 다른 곳(메모 창)에서 이어 열어도 '쓰던 글을 불러왔다'고 말하지 않는다.
export function nextMemoSeed({ id, contexts = [], seeds = [], scope = "personal", now = new Date() } = {}) {
  if (!id) return null;
  const key = (value) => `${value?.type}:${String(value?.id || "").toLowerCase()}`;
  const confirmed = new Map((Array.isArray(contexts) ? contexts : []).filter((value) => value?.type && value?.id).map((value) => [key(value), value]));
  const linked = initialMemoContexts(null, seeds).map((seed) => confirmed.get(key(seed)));
  if (!linked.length || linked.some((value) => !value)) return null;
  return { draft: noteToDraft({ id, occurredAt: now.toISOString(), contexts: linked, noteMeta: { scope } }), entry: null, dirty: false, pending: null, reuseDraft: null };
}
