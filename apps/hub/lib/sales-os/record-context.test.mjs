import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTIVITY_ICON,
  ACTIVITY_LABEL,
  RECORD_CONTEXT_LIMIT,
  RECORD_FILTERS,
  TITLE_FOLD,
  filterRecordStream,
  memoStreamRows,
  recordActivityQuery,
  recordContextRows,
  recordContextTruth,
  recordEmptyPlan,
  recordFilterEmptyCopy,
  recordRowKind,
  recordRowShape,
  recordStream,
  savedMemoSnapshot,
  upsertSavedMemo,
} from "./record-context.js";

const TODAY = "2026-09-30";
// 기록 시각은 실행하는 기기의 달력 날짜로 세운다 — 고정 UTC 시각은 서쪽 시간대에서 하루 밀린다.
const localNoon = (month, day) => new Date(2026, month - 1, day, 12).toISOString();
const act = (patch = {}) => ({ id: "a1", source: "activity", type: "call", msg: "견적 검토 통화", occurredAt: localNoon(9, 28), ...patch });

// Q-CR6: 한 줄기, 모양으로 나눈다 — 연락은 원, 메모는 네모, 그 밖은 흐린 원.
test("shape separates contacts from memos without inventing a contact", () => {
  for (const type of ["call", "meeting", "visit", "demo", "kakao", "email", "info_session"]) {
    assert.equal(recordRowShape({ type }), "contact", type);
  }
  // 연결 메모(journal)와 활동 노트(crm_activities note)는 둘 다 연락이 아니다.
  assert.equal(recordRowShape({ source: "memo", type: "memo" }), "memo");
  assert.equal(recordRowShape({ type: "note" }), "memo");
  // 거래 · 견적 · 자동 기록은 연락으로도 메모로도 세지 않는다.
  for (const type of ["deal", "quote", "update", "ai", "", undefined]) assert.equal(recordRowShape({ type }), "event", String(type));
  assert.equal(recordRowShape(), "event");
});

test("the context column shows the newest five rows as read-only lines", () => {
  assert.equal(RECORD_CONTEXT_LIMIT, 5);
  const stream = Array.from({ length: 8 }, (_, i) => act({ id: `a${i}`, msg: `기록 ${i}` }));
  const rows = recordContextRows(stream, { today: TODAY });
  assert.deepEqual(rows.map((r) => r.title), ["기록 0", "기록 1", "기록 2", "기록 3", "기록 4"], "받은 순서(최신순) 그대로 앞에서 다섯");
  assert.deepEqual(rows.map((r) => r.key), ["a0", "a1", "a2", "a3", "a4"]);

  const [row] = recordContextRows([act({ reaction: "positive" })], { today: TODAY });
  assert.deepEqual(
    { shape: row.shape, icon: row.icon, typeLabel: row.typeLabel, note: row.note, reactionLabel: row.reactionLabel, when: row.when, receipt: row.receipt },
    { shape: "contact", icon: ACTIVITY_ICON.call, typeLabel: ACTIVITY_LABEL.call, note: "", reactionLabel: "긍정", when: "2일 전", receipt: null },
  );
  // 메모는 모양에 더해 글자로도 말한다 — 모양만으로 뜻을 나르지 않는다.
  const [memo] = recordContextRows([{ id: "memo:1", source: "memo", type: "memo", msg: "원장님 성향", occurredAt: localNoon(9, 29) }], { today: TODAY });
  assert.deepEqual([memo.shape, memo.typeLabel, memo.note], ["memo", "메모", "연락 아님"]);
  // 활동 노트(crm_activities note)도 이 줄기에서는 같은 이름 '메모'다 — 네모 하나에 이름 둘을 두지 않는다.
  const [note] = recordContextRows([act({ type: "note", msg: "연락이 아닌 한 줄" })], { today: TODAY });
  assert.deepEqual([note.shape, note.typeLabel, note.note, note.icon], ["memo", "메모", "연락 아님", ACTIVITY_ICON.note]);
  // 모르는 종류 · id 없는 줄도 던지지 않는다.
  const [odd] = recordContextRows([{ type: "fax", msg: "" }], { today: TODAY });
  assert.deepEqual([odd.key, odd.typeLabel, odd.icon, odd.title, odd.when], ["row-0", "fax", "edit", "—", ""]);
  assert.deepEqual(recordContextRows(null), []);
  assert.deepEqual(recordContextRows(undefined, { today: TODAY }), []);
});

test("a row expands in place only when there is more to read", () => {
  const [short] = recordContextRows([act()], { today: TODAY });
  assert.deepEqual([short.expandable, short.lineCount, short.full, short.openLabel], [false, 1, "견적 검토 통화", ""]);

  // 긴 기록(자세히 · 받아쓰기) — 접힌 줄은 첫 문장, 펼치면 빈 줄을 걷어 낸 전부.
  const long = "[요약]\n원장님과 50분 미팅.\n\n[결정사항]\n- 10월 셋째 주 시범 채점  ";
  const [detail] = recordContextRows([act({ type: "note", msg: long })], { today: TODAY });
  assert.equal(detail.title, "[요약]");
  assert.equal(detail.lineCount, 4);
  assert.equal(detail.expandable, true);
  assert.equal(detail.openLabel, "lines", "여러 줄이면 줄 수로 말한다(자세히 N줄)");
  assert.equal(detail.full, "[요약]\n원장님과 50분 미팅.\n[결정사항]\n- 10월 셋째 주 시범 채점");
  // 연결 메모는 제목 + 발췌가 한 줄기로 펼쳐진다.
  const [memo] = recordContextRows([{ id: "memo:1", source: "memo", type: "memo", msg: "원장님 성향", detail: "숫자로 설명해야 움직이심" }], { today: TODAY });
  assert.deepEqual([memo.title, memo.lineCount, memo.expandable], ["원장님 성향", 2, true]);
  // 한 줄이어도 길면 접고 펼칠 수 있다 — 줄 수를 세지 않고 "펼치기"라고 말한다(1줄이라고 하지 않는다).
  assert.equal(TITLE_FOLD, 72);
  const [longLine] = recordContextRows([act({ msg: "가".repeat(TITLE_FOLD + 1) })], { today: TODAY });
  assert.deepEqual([longLine.expandable, longLine.openLabel, longLine.lineCount], [true, "line", 1]);
  // 그보다 짧은 한 줄은 접지 않는다 — 접힘(두 줄)은 펼칠 수 있는 줄에만 걸리므로(record-window.css)
  // 누를 수 없는 줄이 말줄임으로 잘리는 일이 없다.
  const [fits] = recordContextRows([act({ msg: "가".repeat(TITLE_FOLD) })], { today: TODAY });
  assert.deepEqual([fits.expandable, fits.openLabel], [false, ""]);
});

test("a just-saved row carries its receipt instead of a time that reads as stored", () => {
  const stream = [
    act({ id: "local-1", at: "방금", occurredAt: new Date().toISOString(), pending: true }),
    act({ id: "local-2", pending: true, receipt: "sending" }),
    act({ id: "srv-3", receipt: "partial", savedAt: "2026-09-30T01:42:00Z" }),
    act({ id: "srv-4", receipt: "saved", savedAt: "2026-09-30T01:42:00Z" }),
    act({ id: "srv-5" }),
  ];
  const rows = recordContextRows(stream, { today: TODAY });
  assert.deepEqual(rows.map((r) => r.receipt?.phase || null), ["pending", "sending", "partial", "saved", null]);
  assert.deepEqual(rows.map((r) => r.receipt?.label || ""), ["기록 중", "저장 중", "일부 저장", "저장됨", ""]);
  assert.deepEqual(rows.map((r) => r.receipt?.time || ""), ["", "", "10:42", "10:42", ""]);
});

test("context truth mirrors what the drawer already knows and never blocks writing on a read", () => {
  assert.deepEqual(recordContextTruth(), { state: "loading", reason: "", retry: null, memos: "off" });
  assert.deepEqual(recordContextTruth({ actSync: "loading", memoEnabled: true, memoStatus: "error" }), { state: "loading", reason: "", retry: null, memos: "error" });
  // 읽기 실패는 "기록 없음"이 아니다 — 원인과 다시 읽을 대상을 말한다.
  assert.deepEqual(recordContextTruth({ actSync: "error" }), { state: "error", reason: "활동 기록을 읽지 못했어요", retry: "activities", memos: "off" });
  assert.deepEqual(recordContextTruth({ actSync: "preview" }), { state: "preview", reason: "", retry: null, memos: "off" });
  assert.equal(recordContextTruth({ actSync: "unknown" }).state, "preview", "모르는 상태를 실시간으로 읽지 않는다");
  assert.deepEqual(recordContextTruth({ actSync: "live" }), { state: "live", reason: "", retry: null, memos: "off" });
  // 활동은 읽었고 연결 메모만 못 읽었다 — 일부 데이터, 빠진 출처를 이름으로.
  assert.deepEqual(recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "error" }), { state: "partial", reason: "연결 메모를 읽지 못했어요", retry: "memos", memos: "error" });
  // 메모를 읽지 않는 고객(uuid 아님)은 메모 실패가 있을 수 없다.
  assert.deepEqual(recordContextTruth({ actSync: "live", memoEnabled: false, memoStatus: "error" }), { state: "live", reason: "", retry: null, memos: "off" });
  // 연결 메모를 읽는 중에도 읽은 활동은 보인다(칸 전체는 live) — 다만 메모를 읽었다고는 하지 않는다.
  assert.deepEqual(recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "loading" }), { state: "live", reason: "", retry: null, memos: "loading" });
  assert.equal(recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "live" }).memos, "live");
  // 모르는 메모 상태(연결 전 · 빈 값)를 읽은 것으로 치지 않는다.
  assert.equal(recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "preview" }).memos, "preview");
  assert.equal(recordContextTruth({ actSync: "live", memoEnabled: true }).memos, "preview");
});

test("an empty place says 없어요 only about what was read — memos still loading or unread are never 'no memos'", () => {
  const plan = (patch) => recordEmptyPlan({ total: 3, state: "live", memos: "live", ...patch });
  // 읽었고 없다 — 그 종류가 없다고 말한다.
  assert.deepEqual(plan({ filter: "memo" }), { kind: "text", text: "메모가 아직 없어요." });
  assert.deepEqual(plan({ filter: "contact" }), { kind: "text", text: "연락 기록이 아직 없어요." });
  assert.deepEqual(recordEmptyPlan(), { kind: "text", text: "아직 기록이 없어요." });
  // 메모를 붙일 수 없는 고객(연결 메모 읽기 없음)은 활동 노트만이 메모다 — 읽은 것이므로 없다고 말해도 된다.
  assert.deepEqual(plan({ filter: "memo", memos: "off" }), { kind: "text", text: "메모가 아직 없어요." });
  // 연결 메모를 읽는 중 — 빈 말이 아니라 읽는 중이다.
  assert.deepEqual(plan({ filter: "memo", memos: "loading" }), { kind: "loading", label: "메모 불러오는 중" });
  assert.deepEqual(recordEmptyPlan({ total: 0, state: "live", memos: "loading" }), { kind: "loading", label: "메모 불러오는 중" });
  // 연결 메모를 못 읽었다 — 없는 게 아니라 못 읽은 것이다(머리 줄에 '일부 데이터 · 다시 읽기'가 함께 선다).
  const unread = plan({ filter: "memo", state: "partial", memos: "error" });
  assert.deepEqual(unread, { kind: "text", text: "메모를 읽지 못했어요 — 없는 게 아니라 못 읽은 거예요." });
  assert.deepEqual(recordEmptyPlan({ total: 0, state: "partial", memos: "error" }), { kind: "text", text: "활동 기록은 없어요 · 연결 메모는 읽지 못했어요." });
  assert.deepEqual(plan({ filter: "memo", memos: "preview" }), { kind: "text", text: "연결 전이라 메모를 읽을 수 없어요." });
  for (const memos of ["loading", "error", "preview"]) {
    for (const filter of ["memo", "all"]) {
      const said = recordEmptyPlan({ filter, total: filter === "all" ? 0 : 2, state: "live", memos });
      assert.doesNotMatch(said.text || "", /메모가 아직 없어요|아직 기록이 없어요/, `${memos}/${filter}`);
    }
    // 연락만 거른 줄은 메모 읽기와 무관하다 — 활동은 이미 읽었다.
    assert.deepEqual(plan({ filter: "contact", memos }), { kind: "text", text: "연락 기록이 아직 없어요." });
  }
  // 거르기 칸은 줄이 있을 때만 선다 — 줄이 없으면 남아 있던 거르기 값이 아니라 '전체'로 말한다.
  assert.deepEqual(recordEmptyPlan({ filter: "memo", total: 0 }), { kind: "text", text: "아직 기록이 없어요." });
  assert.deepEqual(recordEmptyPlan({ filter: "unknown", total: 2 }), { kind: "text", text: "아직 기록이 없어요." });
  // 연결 전(활동도 못 읽음)은 지금 말 그대로다.
  assert.deepEqual(recordEmptyPlan({ total: 0, state: "preview", memos: "loading" }), { kind: "text", text: "연결 전이라 지난 기록을 읽을 수 없어요." });
});

test("one row has one name in the whole drawer — 메모 · 연락 아님 for both memo kinds, the activity name otherwise", () => {
  assert.deepEqual(recordRowKind({ type: "call" }), { shape: "contact", typeLabel: "통화", note: "" });
  assert.deepEqual(recordRowKind({ type: "deal" }), { shape: "event", typeLabel: "거래", note: "" });
  // 활동 노트(crm_activities note)와 연결 메모(journal)는 같은 네모, 같은 이름이다 — '노트'라는 둘째 이름은 없다.
  assert.deepEqual(recordRowKind({ type: "note" }), { shape: "memo", typeLabel: "메모", note: "연락 아님" });
  assert.deepEqual(recordRowKind({ source: "memo", type: "memo" }), { shape: "memo", typeLabel: "메모", note: "연락 아님" });
  assert.deepEqual(recordRowKind({ type: "custom" }), { shape: "event", typeLabel: "custom", note: "" });
  assert.deepEqual(recordRowKind(), { shape: "event", typeLabel: "", note: "" });
  // 읽기 칸의 줄은 같은 규칙에서 나온다.
  const [row] = recordContextRows([act({ type: "note", msg: "한 줄" })], { today: TODAY });
  assert.deepEqual([row.shape, row.typeLabel, row.note], ["memo", "메모", "연락 아님"]);
});

// ── 2026-09-30 넓은 기록창 ⑥ — 거르기와 메모 줄(Q-CR6) ─────────────────────────────────────

test("the filter splits one stream by the same shapes — 전체 · 연락 · 메모, newest five after filtering", () => {
  assert.deepEqual(RECORD_FILTERS, [{ key: "all", label: "전체" }, { key: "contact", label: "연락" }, { key: "memo", label: "메모" }]);
  const stream = [
    act({ id: "c1" }),
    { id: "memo:1", source: "memo", type: "memo", msg: "원장님 성향" },
    act({ id: "e1", type: "deal", msg: "계약 · 클로징" }),
    act({ id: "n1", type: "note", msg: "연락이 아닌 한 줄" }),
    act({ id: "c2", type: "kakao" }),
  ];
  assert.equal(filterRecordStream(stream, "all"), stream, "전체는 받은 줄기 그대로(새 배열을 만들지 않는다)");
  assert.deepEqual(filterRecordStream(stream, "contact").map((r) => r.id), ["c1", "c2"]);
  // 메모 = 연결 메모(journal) + 활동 노트. 거래 · 견적 · 자동 기록은 '전체'에서만 보인다.
  assert.deepEqual(filterRecordStream(stream, "memo").map((r) => r.id), ["memo:1", "n1"]);
  // 순서는 받은 순서(최신순) 그대로다.
  assert.deepEqual(filterRecordStream([...stream].reverse(), "contact").map((r) => r.id), ["c2", "c1"]);
  // 모르는 값 · 빈 입력은 던지지 않는다.
  assert.equal(filterRecordStream(stream, "deals"), stream);
  assert.deepEqual(filterRecordStream(null, "memo"), []);
  // 다섯 줄 상한은 거른 뒤에 건다 — 메모 여섯 줄 사이에 낀 연락도 '연락'에서는 보인다.
  const crowded = [...Array.from({ length: 6 }, (_, i) => ({ id: `memo:${i}`, source: "memo", type: "memo", msg: `메모 ${i}` })), act({ id: "late-contact" })];
  assert.deepEqual(recordContextRows(crowded, { today: TODAY }).map((r) => r.shape), ["memo", "memo", "memo", "memo", "memo"]);
  assert.deepEqual(recordContextRows(filterRecordStream(crowded, "contact"), { today: TODAY }).map((r) => r.key), ["late-contact"]);
  // 거른 결과가 없으면 "기록 없음"이 아니라 그 종류가 없다고 말한다.
  assert.equal(recordFilterEmptyCopy("all"), "아직 기록이 없어요.");
  assert.equal(recordFilterEmptyCopy("contact"), "연락 기록이 아직 없어요.");
  assert.equal(recordFilterEmptyCopy("memo"), "메모가 아직 없어요.");
  assert.equal(recordFilterEmptyCopy("unknown"), "아직 기록이 없어요.");
});

test("linked memos become stream rows; a memo this window just saved carries its receipt even before the re-read", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const entries = [
    { id: A, title: "원장님 성향", excerpt: "숫자로 설명해야 움직이심", occurredAt: localNoon(9, 27) },
    { id: B, title: "", excerpt: "국어과 선생님 3명", occurredAt: localNoon(9, 25) },
  ];
  // 읽어 온 메모 — 제목이 있으면 제목 + 발췌, 없으면 발췌가 첫 줄. 영수증은 없다.
  assert.deepEqual(memoStreamRows(entries), [
    { id: `memo:${A}`, noteId: A, source: "memo", type: "memo", msg: "원장님 성향", detail: "숫자로 설명해야 움직이심", occurredAt: localNoon(9, 27) },
    { id: `memo:${B}`, noteId: B, source: "memo", type: "memo", msg: "국어과 선생님 3명", detail: "", occurredAt: localNoon(9, 25) },
  ]);
  assert.equal(memoStreamRows([{ id: A, title: "", excerpt: "" }])[0].msg, "제목 없는 메모");

  // 방금 저장이 확인된 메모(다시 읽기 전) — 본문 그대로 줄로 서고 "저장됨 hh:mm"을 단다.
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const saved = [{ id: C, title: "", body: "결정은 원장님이 직접\n부원장은 매일 쓸 사람", occurredAt: "2026-09-30T01:52:00Z", savedAt: "2026-09-30T01:52:03Z" }];
  const withNew = memoStreamRows(entries, saved);
  assert.deepEqual(withNew.map((r) => r.noteId), [A, B, C]);
  const fresh = withNew[2];
  assert.deepEqual([fresh.id, fresh.source, fresh.msg, fresh.detail, fresh.receipt, fresh.savedAt], [`memo:${C}`, "memo", "결정은 원장님이 직접\n부원장은 매일 쓸 사람", "", "saved", "2026-09-30T01:52:03Z"]);
  const [line] = recordContextRows([fresh], { today: TODAY });
  assert.deepEqual([line.shape, line.typeLabel, line.note, line.receipt.label, line.receipt.time, line.lineCount], ["memo", "메모", "연락 아님", "저장됨", "10:52", 2]);
  // 다시 읽기가 닿으면 같은 메모가 두 줄이 되지 않는다 — 읽어 온 줄이 영수증과 쓴 본문을 이어받는다.
  const reread = memoStreamRows([{ id: C, title: "", excerpt: "결정은 원장님이 직접…", occurredAt: "2026-09-30T01:52:00Z" }, ...entries], saved);
  assert.deepEqual(reread.map((r) => r.noteId), [C, A, B]);
  assert.deepEqual([reread[0].msg, reread[0].receipt, reread[0].savedAt], ["결정은 원장님이 직접\n부원장은 매일 쓸 사람", "saved", "2026-09-30T01:52:03Z"]);
  assert.equal(reread[1].receipt, undefined, "읽어 온 다른 메모에는 영수증이 없다");
  // 메모 읽기가 실패해도(entries 없음) 방금 저장한 메모는 줄로 선다.
  assert.deepEqual(memoStreamRows([], saved).map((r) => [r.noteId, r.receipt]), [[C, "saved"]]);
  // 서버가 답하지 않은 메모는 여기 오지 않는다 — 낙관 줄(pending)을 만들지 않는다.
  for (const row of withNew) assert.equal(row.pending, undefined);
  // 빈 입력 · id 없는 줄 · 같은 id 두 번은 던지지 않고 걸러진다.
  assert.deepEqual(memoStreamRows(null, undefined), []);
  assert.deepEqual(memoStreamRows([{ title: "id 없음" }, entries[0], entries[0]], [{ body: "id 없음" }]).map((r) => r.noteId), [A]);
});

test("a memo saved here and then edited elsewhere shows the edit once it is re-read — the old snapshot never hides a newer save", () => {
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const at = "2026-09-30T01:52:03Z";
  const first = { id: C, title: "", body: "결정은 부원장", occurredAt: "2026-09-30T01:52:00Z", revision: 1 };
  const saved = upsertSavedMemo([], first, at);
  assert.deepEqual(saved, [{ id: C, title: "", body: "결정은 부원장", occurredAt: "2026-09-30T01:52:00Z", revision: 1, savedAt: at }]);
  assert.deepEqual(savedMemoSnapshot(first, at), saved[0]);
  // 같은 판(revision)의 다시 읽기 — 발췌(180자)보다 쓴 본문 그대로가 낫다: 스냅숏이 남는다.
  const same = memoStreamRows([{ id: C, title: "", excerpt: "결정은 부…", occurredAt: first.occurredAt, revision: 1 }], saved);
  assert.deepEqual([same[0].msg, same[0].receipt], ["결정은 부원장", "saved"]);
  // 다른 창(또는 메모 창)에서 고쳐 저장한 뒤의 다시 읽기 — 새 판이 이긴다. 영수증은 남는다(이 창이 남긴 메모다).
  const edited = memoStreamRows([{ id: C, title: "결정권", excerpt: "결정은 원장님이 직접 (부원장 아님)", occurredAt: first.occurredAt, revision: 2 }], saved);
  assert.deepEqual(edited.map((r) => [r.msg, r.detail, r.receipt, r.savedAt]), [["결정권", "결정은 원장님이 직접 (부원장 아님)", "saved", at]]);
  const [line] = recordContextRows(edited, { today: TODAY });
  assert.equal(line.full, "결정권\n결정은 원장님이 직접 (부원장 아님)");
  assert.doesNotMatch(line.full, /결정은 부원장$/);

  // 같은 드로어의 메모 창에서 고쳐 저장하면(서버의 답) 스냅숏 자체가 새 글 · 새 판 · 새 시각이 된다 —
  // 다시 읽기가 닿기 전에도 고친 글이 보인다. 줄은 늘지 않는다.
  const later = "2026-09-30T02:10:00Z";
  const second = { ...first, title: "결정권", body: "결정은 원장님이 직접 (부원장 아님)", revision: 2 };
  const replaced = upsertSavedMemo(saved, second, later, { add: false });
  assert.deepEqual(replaced, [{ id: C, title: "결정권", body: "결정은 원장님이 직접 (부원장 아님)", occurredAt: first.occurredAt, revision: 2, savedAt: later }]);
  assert.deepEqual(memoStreamRows([{ id: C, title: "", excerpt: "결정은 부…", occurredAt: first.occurredAt, revision: 1 }], replaced).map((r) => [r.msg, r.detail, r.savedAt]),
    [["결정권", "결정은 원장님이 직접 (부원장 아님)", later]], "늦게 닿은 옛 읽기가 새 스냅숏을 되돌리지 않는다");
  // 메모 창이 고친 것이 이 창이 들고 있지 않은 옛 메모면 영수증을 새로 만들지 않는다(다시 읽기가 가져온다).
  const other = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", title: "", body: "옛 메모를 고침", occurredAt: first.occurredAt, revision: 5 };
  assert.equal(upsertSavedMemo(saved, other, later, { add: false }), saved);
  // 메모 모드의 새 저장은 맨 위에 서고, 같은 ID는 한 줄이다.
  assert.deepEqual(upsertSavedMemo(saved, other, later).map((m) => m.id), [other.id, C]);
  assert.deepEqual(upsertSavedMemo(saved, second, later).map((m) => [m.id, m.revision]), [[C, 2]]);
  // id 없는 답 · 빈 답은 아무것도 바꾸지 않는다.
  assert.equal(upsertSavedMemo(saved, { body: "id 없는 답" }, later), saved);
  assert.equal(upsertSavedMemo(saved, null, later), saved);
  assert.equal(savedMemoSnapshot(null, later), null);
  // 판을 모르는 옛 스냅숏은 지금처럼 스냅숏이 남는다(비교할 수 없으면 뒤집지 않는다).
  const legacy = memoStreamRows([{ id: C, title: "", excerpt: "읽어 온 글", occurredAt: first.occurredAt, revision: 3 }], [{ id: C, title: "", body: "쓴 글", savedAt: at }]);
  assert.equal(legacy[0].msg, "쓴 글");
});

// 2026-09-30 넓은 기록창 ④ — 오늘 연락에서 연 창의 읽기 칸은 고객 드로어와 같은 길로 읽는다.
test("the activity read follows the customer drawer's join rule — company first, else the record's own id", () => {
  // live crm_activities는 대부분 company_id로만 이어져 있다 — 회사가 있으면 회사로 읽는다.
  assert.equal(recordActivityQuery({ kind: "lead", id: "lead-1", companyId: "co-1" }), "companyId=co-1");
  assert.equal(recordActivityQuery({ kind: "deal", id: "deal-1", companyId: "co-1" }), "companyId=co-1");
  // 회사가 없을 때만 자신의 id로.
  assert.equal(recordActivityQuery({ kind: "lead", id: "lead-1" }), "leadId=lead-1");
  assert.equal(recordActivityQuery({ kind: "account", id: "acc-1", companyId: null }), "accountId=acc-1");
  assert.equal(recordActivityQuery({ kind: "deal", id: "deal-1" }), "dealId=deal-1");
  assert.equal(recordActivityQuery({ id: "lead-2" }), "leadId=lead-2");
  // 값은 질의 문자열로 안전하게 옮긴다.
  assert.equal(recordActivityQuery({ kind: "lead", id: "a b&c" }), "leadId=a%20b%26c");
  // 저장된 고객이 아니면 읽을 것이 없다.
  assert.equal(recordActivityQuery({ kind: "lead", companyId: "co-1" }), "");
  assert.equal(recordActivityQuery(), "");
  assert.equal(recordActivityQuery(null), "");
});

test("one stream: activities and linked memos interleave newest first", () => {
  const acts = [
    { id: "a-old", type: "call", msg: "옛 통화", occurredAt: localNoon(9, 20) },
    { id: "a-new", type: "meeting", msg: "최근 미팅", occurredAt: localNoon(9, 28) },
  ];
  const memos = memoStreamRows([{ id: "m1", title: "", excerpt: "결정은 원장님", occurredAt: localNoon(9, 25), revision: 1 }]);
  const stream = recordStream(acts, memos);
  assert.deepEqual(stream.map((r) => r.id), ["a-new", "memo:m1", "a-old"]);
  // 활동 줄에는 출처를 붙이고, 메모 줄은 메모 그대로다(모양은 recordRowShape가 읽는다).
  assert.deepEqual(stream.map((r) => r.source), ["activity", "memo", "activity"]);
  assert.deepEqual(stream.map((r) => recordRowShape(r)), ["contact", "memo", "contact"]);
  // 시각을 못 읽는 줄(저장 전 낙관 줄)은 맨 위다.
  assert.equal(recordStream([...acts, { id: "local-1", type: "call", msg: "방금" }], memos)[0].id, "local-1");
  // 입력을 바꾸지 않고, 빈 입력에도 던지지 않는다.
  assert.equal(acts[0].source, undefined);
  assert.deepEqual(recordStream(), []);
  assert.deepEqual(recordStream(null, null), []);
});
