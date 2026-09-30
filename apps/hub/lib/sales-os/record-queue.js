// 오늘 연락의 '저장하고 다음'(2026-09-30 넓은 기록창 ④ · Q-CR2 · Q-CR8, 권장 · 화면 확인 뒤 확정).
// 순수 — React · fetch 없음.
//
// 오늘 연락에서 연 기록창은 저장하면 닫히지 않고 다음 사람으로 넘어간다. 여기에는 그 흐름의 규칙 둘이 있다.
//   줄   — "다음"이 누구인가. 화면에 보이는 순서 그대로다(놓친 약속 → 기록할까요 → 오늘 약속 → 펼친 나머지).
//   영수증 — 앞 사람의 저장이 어디까지 갔는가. 창이 이미 다음 사람으로 넘어갔으므로 창 머리의 '이전' 줄이
//           그 진행(기록 중 → 저장 중 → 저장됨 hh:mm)과 되돌리기, 실패했을 때 돌아갈 길을 든다.
// "저장됨"은 서버가 답한 뒤에만 선다(DESIGN §8.1 Save envelope). 저장하지 못한 기록이 남아 있으면 줄은 앞으로
// 가지 않는다 — 다음 멈출 곳이 그 사람이다(쓰던 글과 원인이 그대로 돌아온다).

import { recordReceipt } from "./contact-record.js";
import { customerPromise } from "./customer-list.js";

// ── 줄 ───────────────────────────────────────────────────────────────────────

// 기록 후보(기록할까요)의 줄 자리 — 고객 행의 키(`lead:<id>` · `deal:<id>`)와 겹치지 않는다.
export const candidateQueueKey = (id) => `cand:${id}`;

// 고객 행의 줄 자리 — 오늘 연락이 행을 가리키는 키(`lead:<id>` · `deal:<id>`)와 같다.
export const rowQueueKey = (item) => `${item?.kind}:${item?.id}`;

// 이어 쓰기의 줄 — 화면에 보이는 순서 그대로다: 놓친 약속 → 기록할까요 → 오늘 약속 → (펼쳤을 때만) 다가오는 약속 →
// 기약 없음 → 약속 비어 있음. more는 접힌 줄을 펼쳤을 때만 준다(접혀 있으면 화면에 없다 — 줄에도 없다).
// '기록' 버튼이 없는 줄은 서지 않는다: 등록되지 않은 번호의 후보(새 고객으로) · 다시 볼 기약 없음(시점 정하기).
// 방금 기록해 빠지는 행도 제자리에 둔다 — 지금 사람의 자리를 찾아야 한다(건너뛰기는 nextQueueEntry의 skip이 한다).
export function buildRecordQueue({ missed = [], candidates = [], today = [], more = null } = {}) {
  const rows = (list, variant) => (Array.isArray(list) ? list : []).map((item) => ({ key: rowQueueKey(item), name: item.name || "고객", item, variant }));
  return [
    ...rows(missed, "missed"),
    ...(Array.isArray(candidates) ? candidates : []).filter((candidate) => candidate?.id && !candidate.customer?.isUnregistered).map((candidate) => ({
      key: candidateQueueKey(candidate.id),
      name: candidate.customer?.name || candidate.customer?.org || "고객",
      candidate,
    })),
    ...rows(today, "today"),
    ...(more ? [
      ...rows(more.upcoming, "upcoming"),
      ...rows((Array.isArray(more.dormant) ? more.dormant : []).filter((item) => !item.recheck), "dormant"),
      ...rows(more.open, "open"),
    ] : []),
  ];
}

// 지금 사람 다음에 설 사람. queue는 화면 순서의 [{ key, name, … }], skip은 방금 기록해 빠지는 자리들이다.
// 지금 사람이 줄에 없으면(고객을 직접 골라 연 창) 다음도 없다 — 어디서부터 이을지 지어내지 않는다.
export function nextQueueEntry(queue = [], currentKey = null, skip = []) {
  const list = Array.isArray(queue) ? queue : [];
  if (currentKey == null) return null;
  const at = list.findIndex((entry) => entry?.key === currentKey);
  if (at < 0) return null;
  const skipped = skip instanceof Set ? skip : new Set(skip || []);
  return list.slice(at + 1).find((entry) => entry?.key != null && !skipped.has(entry.key)) || null;
}

// 지금 창(entry — 호출처가 연 맥락, queueKey가 줄 자리다) 다음에 설 사람. 화면에 보이는 '다음'과 저장한 뒤
// 실제로 넘어가는 곳이 이 한 규칙을 쓴다 — 둘이 어긋나면 줄이 말한 사람과 다른 창이 열린다.
//   leaving — 방금 기록해 빠지는 자리.
//   done    — 이 창에서 이미 기록한 자리: 저장이 확인되면 목록이 새 약속으로 다시 세우지만(펼친 '다가오는
//             약속') 같은 창의 '다음'으로 다시 부르지 않는다.
//   target  — 지금 쓰는 고객(고객과 맞지 않은 기록 후보에서 직접 고른 고객일 수 있다). 그 고객의 행도 건너뛴다:
//             이 기록을 저장하면 그 행도 함께 빠진다(쓰고 있는 사람을 '다음'이라고 부르지 않는다).
export function nextRecordEntry(queue = [], entry = null, { leaving = [], done = [], target = null } = {}) {
  if (!entry?.queueKey) return null;
  const skip = new Set([...(leaving || []), ...(done || [])]);
  const who = target?.id ? target : entry.target;
  if (who?.id) skip.add(rowQueueKey(who));
  return nextQueueEntry(queue, entry.queueKey, skip);
}

// 기록 후보(기록할까요) → 기록창의 대상 | null(고객과 맞지 않은 후보 — 이름으로 고르기부터 연다).
// 회사를 같이 든다: 읽기 칸의 기록 읽기는 회사 우선이고(recordActivityQuery — live 활동은 대부분 company_id로만
// 이어져 있어, 자신의 id로만 읽으면 기록이 있는 고객도 "아직 기록이 없어요"로 보인다) 자세히(note)도 행에서 연
// 창과 같은 회사에 붙는다.
const CANDIDATE_KINDS = ["lead", "deal", "account"];
export function candidateRecordTarget(candidate) {
  const customer = candidate?.customer || {};
  const [keyKind, keyId] = String(customer.key || "").split(":");
  const kind = CANDIDATE_KINDS.includes(customer.kind) ? customer.kind : ["lead", "account"].includes(keyKind) ? keyKind : null;
  const id = customer.id || (kind && keyId) || null;
  if (!kind || !id) return null;
  return { kind, id, companyId: customer.companyId || null, name: customer.name || customer.org || "고객", org: customer.org || null };
}

// 오늘 연락의 행 → 읽기 칸의 약속(customerPromise와 같은 모양). 행이 아는 것은 무엇 · 언제 · 기약 없음뿐이다.
// 날짜는 이 화면의 기준(KST day-key)으로 이미 접은 값을 받는다 — 목록의 '지남' 판정과 하루도 어긋나지 않게.
// 목록에 없는 고객(직접 고른 고객)은 null이다: 약속이 '없는' 게 아니라 이 창이 모른다.
export function followupPromise(item, { todayKey = "", promiseKey = "" } = {}) {
  if (!item) return null;
  return customerPromise({
    nextAction: item.promiseText || "",
    nextActionAt: promiseKey || null,
    dormant: Boolean(item.dormant),
    dormantSince: item.dormantSince || null,
  }, todayKey || new Date());
}

// ── 앞 사람의 영수증 ─────────────────────────────────────────────────────────
// 한 줄 = { id(낙관 ID), name, target, targetKey, entry(호출처가 연 맥락 — 돌아갈 때 그대로 돌려준다),
//           phase, startedAt(되돌리기 창이 열린 시각), at(서버의 답을 받은 시각), message, form, undo,
//           scoped(초안이 그 고객의 자리가 아니라 그 기록의 자리에 있다 — 기록 후보), note(저장 뒤의 덧말) }
// targetKey는 그 기록의 자리다 — 고객(`lead:<id>`)이고, 같은 고객의 다른 기록(행과 기록 후보)은 자리가 다르다.
//   pending — 되돌리기 창(3.5초). 아직 보내지 않았다.      sending — 보냈고 답을 기다린다.
//   saved   — 서버가 saved로 답했다.                        partial — 요약만 저장됐다(긴 글은 아직).
//   failed  — 저장하지 못했다. 쓰던 글(form)과 원인(message)을 든다.
//   undone  — 되돌렸다. 쓰던 글은 그 고객의 초안으로 남아 있다.

// 풀릴 때까지 줄에 남는 단계 — 새 기록이 줄에 서도 밀려나지 않는다(되돌리기 · 실패를 조용히 잃지 않는다).
const HELD = new Set(["pending", "sending", "partial", "failed"]);
// 돌아갈 길이 있는 단계.
const RETURNABLE = new Set(["partial", "failed", "undone"]);
// 줄이 앞으로 가지 않는 단계 — 저장하지 못한 글이 남아 있다.
const BLOCKING = new Set(["partial", "failed"]);

const TRAIL_PATCH = {
  sending: () => ({ phase: "sending", undo: null }),
  saved: (event) => ({ phase: "saved", at: event.at ?? null, undo: null }),
  partial: (event) => ({ phase: "partial", at: event.at ?? null, undo: null }),
  failed: (event) => ({ phase: "failed", message: String(event.message || ""), form: event.form || null, undo: null }),
  undone: () => ({ phase: "undone", undo: null }),
  // 저장은 됐고 곁가지 하나가 빠졌다(실제 연락 시각) — 단계는 그대로 두고 덧말만 단다.
  noted: (event) => ({ note: String(event.note || "") }),
};

export function trailTracks(trail = [], id) {
  return id != null && (Array.isArray(trail) ? trail : []).some((receipt) => receipt?.id === id);
}

// 저장 사건을 '이전' 줄에 얹는다.
//   queued — 새 기록이 줄에 선다(맨 앞). 끝난 옛 줄(저장됨 · 되돌림)은 이때 비킨다.
//   sending · saved · partial · failed · undone · noted — 같은 ID의 줄만 바꾼다(줄에 없는 기록은 건드리지 않는다).
//   drop — 그 줄을 걷는다(돌아가서 다시 쓰기 시작했다).
export function applyTrailEvent(trail = [], event = {}) {
  const list = Array.isArray(trail) ? trail : [];
  const { type, id } = event || {};
  if (id == null) return list;
  if (type === "queued") {
    const receipt = {
      id,
      name: event.name || "고객",
      target: event.target || null,
      targetKey: event.targetKey || "",
      entry: event.entry ?? null,
      phase: "pending",
      startedAt: event.startedAt ?? null,
      at: null,
      message: "",
      form: null,
      undo: typeof event.undo === "function" ? event.undo : null,
      scoped: Boolean(event.scoped),
      note: "",
    };
    return [receipt, ...list.filter((row) => row.id !== id && HELD.has(row.phase))];
  }
  if (!trailTracks(list, id)) return list;
  if (type === "drop") return list.filter((row) => row.id !== id);
  const patch = TRAIL_PATCH[type]?.(event);
  return patch ? list.map((row) => (row.id === id ? { ...row, ...patch } : row)) : list;
}

// 지금 창이 그 사람의 것이면 돌아갈 길은 필요 없다 — 쓰던 글이 이미 이 창에 있다.
export function trailWithoutTarget(trail = [], targetKey = "") {
  const list = Array.isArray(trail) ? trail : [];
  if (!targetKey) return list;
  const next = list.filter((row) => !(row.targetKey === targetKey && RETURNABLE.has(row.phase)));
  return next.length === list.length ? list : next;
}

// 저장하면 어디로 가는가 — { kind: "return" | "next", name, … } | null(마지막 — 창이 닫힌다).
//   return — 저장하지 못한 기록이 남아 있다. 앞으로 가지 않고 그 사람으로 돌아간다(오래된 것부터).
//   next   — 호출처가 화면 순서에서 고른 다음 사람.
export function recordNextStop({ next = null, trail = [], targetKey = "" } = {}) {
  const list = Array.isArray(trail) ? trail : [];
  const stuck = [...list].reverse().find((row) => BLOCKING.has(row.phase) && row.targetKey !== targetKey);
  if (stuck) return { kind: "return", id: stuck.id, name: stuck.name, reason: stuck.phase };
  return next ? { kind: "next", name: next.name || "고객" } : null;
}

// 돌아갈 기록의 이름 — 저장하지 못한 기록과, 요약은 저장됐고 자세히만 남은 기록을 나눠 말한다. 일부 저장을
// "저장 못 한 기록"이라고 부르면 같은 줄의 영수증("요약만 저장됐어요")과 어긋난다.
const stuckName = (stop) => (stop?.reason === "partial" ? "자세히가 남은 기록" : "저장 못 한 기록");

// 머리 아래 줄의 '다음' 글자 — 이름 앞에 서는 말.
export function recordNextLabel(stop = null) {
  if (!stop) return "";
  return stop.kind === "return" ? `다음 · ${stuckName(stop)}` : "다음";
}

// 저장 줄의 쉬는 글자 뒤에 붙는 말 — 주 버튼(저장하고 다음)이 어디로 데려가는지.
export function recordNextHint(stop = null) {
  if (!stop) return "";
  if (stop.kind === "return") return `저장하면 ${stuckName(stop)}으로 돌아가요 · ${stop.name}`;
  return `저장하면 다음 · ${stop.name}`;
}

// 창 머리의 '이전' 줄이 보이는 것 — 줄마다 { id, name, phase, tone, receipt | label · detail, canUndo, canReturn }.
// 진행 네 단계는 기록 줄 영수증(recordReceipt)의 말을 그대로 쓴다 — 같은 사실을 두 가지 말로 하지 않는다.
const TRAIL_COPY = {
  failed: { label: "저장 못 함", detail: "쓰던 글은 남아 있어요" },
  undone: { label: "되돌렸어요", detail: "쓰던 글은 초안으로 남아 있어요" },
};

export function trailItems(trail = []) {
  return (Array.isArray(trail) ? trail : []).map((row) => {
    const copy = TRAIL_COPY[row.phase] || null;
    return {
      id: row.id,
      name: row.name || "고객",
      phase: row.phase,
      // 빨강은 저장하지 못한 줄 한 곳뿐이다(DESIGN §5.2) — 일부 저장은 영수증의 반 찬 원이 말한다.
      tone: row.phase === "failed" ? "error" : "status",
      // 되돌리기 창의 덧말("아직 보내지 않았어요")은 줄에 싣지 않는다 — 바로 옆의 되돌리기 버튼이 같은 말을 한다
      // (기록 칸의 저장 줄과 같은 모양: 기록 중 + 되돌리기). 좁은 화면에서 줄이 한 줄 덜 접힌다.
      receipt: copy ? null : { ...recordReceipt({ receipt: row.phase, savedAt: row.at }), ...(row.phase === "pending" ? { detail: "" } : {}) },
      label: copy?.label || "",
      detail: copy?.detail || "",
      // 저장 뒤의 덧말(실제 연락 시각을 남기지 못했다 등) — 영수증 뒤에 선다.
      note: row.note || "",
      canUndo: row.phase === "pending" && typeof row.undo === "function",
      canReturn: RETURNABLE.has(row.phase),
    };
  });
}

// 창이 닫히면 머리의 '이전' 줄도 사라진다 — 거기 있던 것 중 잃으면 안 되는 것을 돌려준다(호출처가 토스트로 넘긴다).
//   undo    — 아직 되돌릴 수 있는 기록: 남은 시간만큼 되돌리기를 이어 준다(3.5초 계약을 줄이지 않는다).
//   failed · partial — 풀리지 않은 실패: 알린다(쓰던 글은 그 고객의 기록창에 남아 있다).
// 보낸 뒤(sending)와 끝난 줄(saved · undone)은 넘길 것이 없다 — 저장 확인은 호출처의 onPersisted가 띄운다.
const HANDOFF_MIN_MS = 300;

export function trailHandoff(trail = [], { now = Date.now(), windowMs = 3500 } = {}) {
  return (Array.isArray(trail) ? trail : []).flatMap((row) => {
    if (row.phase === "pending" && typeof row.undo === "function") {
      const remaining = windowMs - Math.max(0, now - (row.startedAt ?? now));
      return remaining >= HANDOFF_MIN_MS ? [{ kind: "undo", id: row.id, name: row.name, remaining, undo: row.undo }] : [];
    }
    if (row.phase === "failed") return [{ kind: "failed", id: row.id, name: row.name, message: row.message || "", scoped: Boolean(row.scoped) }];
    if (row.phase === "partial") return [{ kind: "partial", id: row.id, name: row.name }];
    return [];
  });
}
