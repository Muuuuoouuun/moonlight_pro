import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTIVITY_ICON,
  ACTIVITY_LABEL,
  RECORD_CONTEXT_LIMIT,
  TITLE_FOLD,
  recordContextRows,
  recordContextTruth,
  recordRowShape,
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
  assert.deepEqual(recordContextTruth(), { state: "loading", reason: "", retry: null });
  assert.deepEqual(recordContextTruth({ actSync: "loading", memoEnabled: true, memoStatus: "error" }), { state: "loading", reason: "", retry: null });
  // 읽기 실패는 "기록 없음"이 아니다 — 원인과 다시 읽을 대상을 말한다.
  assert.deepEqual(recordContextTruth({ actSync: "error" }), { state: "error", reason: "활동 기록을 읽지 못했어요", retry: "activities" });
  assert.deepEqual(recordContextTruth({ actSync: "preview" }), { state: "preview", reason: "", retry: null });
  assert.equal(recordContextTruth({ actSync: "unknown" }).state, "preview", "모르는 상태를 실시간으로 읽지 않는다");
  assert.deepEqual(recordContextTruth({ actSync: "live" }), { state: "live", reason: "", retry: null });
  // 활동은 읽었고 연결 메모만 못 읽었다 — 일부 데이터, 빠진 출처를 이름으로.
  assert.deepEqual(recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "error" }), { state: "partial", reason: "연결 메모를 읽지 못했어요", retry: "memos" });
  // 메모를 읽지 않는 고객(uuid 아님)은 메모 실패가 있을 수 없다.
  assert.equal(recordContextTruth({ actSync: "live", memoEnabled: false, memoStatus: "error" }).state, "live");
  assert.equal(recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "loading" }).state, "live");
});
