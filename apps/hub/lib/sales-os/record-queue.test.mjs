import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyTrailEvent,
  buildRecordQueue,
  candidateQueueKey,
  candidateRecordTarget,
  followupPromise,
  nextQueueEntry,
  nextRecordEntry,
  recordNextHint,
  recordNextLabel,
  recordNextStop,
  rowQueueKey,
  trailHandoff,
  trailItems,
  trailTracks,
  trailWithoutTarget,
} from "./record-queue.js";
import { promiseReadout } from "./customer-list.js";
import { recordActivityQuery } from "./record-context.js";

// 오늘 연락의 '저장하고 다음'(2026-09-30 넓은 기록창 ④ · Q-CR8, 권장 · 화면 확인 뒤 확정).

// 화면 순서: 놓친 약속 → 기록할까요 → 오늘 약속 → 펼친 나머지.
const QUEUE = [
  { key: "lead:missed-1", name: "놓친 고객" },
  { key: candidateQueueKey("c1"), name: "후보 가" },
  { key: candidateQueueKey("c2"), name: "후보 나" },
  { key: "lead:today-1", name: "오늘 고객 가" },
  { key: "deal:today-2", name: "오늘 고객 나" },
];

// ── 줄 ───────────────────────────────────────────────────────────────────────

test("the queue is the screen order: 놓친 약속 → 기록할까요 → 오늘 약속 → the unfolded rest", () => {
  const row = (kind, id, name, extra = {}) => ({ kind, id, name, ...extra });
  const cand = (id, customer) => ({ id, customer });
  const lists = {
    missed: [row("lead", "m1", "놓친 가"), row("deal", "m2", "놓친 나")],
    candidates: [
      cand("c1", { kind: "lead", id: "x1", name: "후보 가" }),
      // 등록되지 않은 번호 — 그 줄의 버튼은 '새 고객으로'다(기록 버튼이 없다). 줄에 서지 않는다.
      cand("c2", { name: "010-0000-0000", isUnregistered: true }),
      // 고객과 맞지 않은 후보 — 기록 버튼이 있다(고객 고르기부터 연다). 이름이 없으면 학원 이름으로.
      cand("c3", { key: null, org: "후보 학원" }),
    ],
    today: [row("lead", "t1", "오늘 가")],
    more: {
      upcoming: [row("lead", "u1", "다가오는 가")],
      // 30일이 지난 기약 없음 — 그 줄의 버튼은 '시점 정하기'다. 줄에 서지 않는다.
      dormant: [row("lead", "d1", "기약 없음 가"), row("lead", "d2", "다시 볼 고객", { recheck: true })],
      open: [row("deal", "o1", "약속 비어 있음 가")],
    },
  };
  const queue = buildRecordQueue(lists);
  assert.deepEqual(queue.map((entry) => [entry.key, entry.name]), [
    ["lead:m1", "놓친 가"], ["deal:m2", "놓친 나"],
    ["cand:c1", "후보 가"], ["cand:c3", "후보 학원"],
    ["lead:t1", "오늘 가"],
    ["lead:u1", "다가오는 가"], ["lead:d1", "기약 없음 가"], ["deal:o1", "약속 비어 있음 가"],
  ]);
  // 줄의 자리는 그 자리를 여는 데 필요한 것을 든다 — 행은 어느 묶음의 행인지, 후보는 후보 그대로.
  assert.deepEqual(queue.map((entry) => entry.variant || (entry.candidate ? "candidate" : "")), ["missed", "missed", "candidate", "candidate", "today", "upcoming", "dormant", "open"]);
  assert.equal(queue[0].item, lists.missed[0]);
  assert.equal(queue[2].candidate, lists.candidates[0]);
  // 접힌 줄이 닫혀 있으면(more 없음) 화면에 없다 — 줄에도 없다.
  assert.deepEqual(buildRecordQueue({ ...lists, more: null }).map((entry) => entry.key), ["lead:m1", "deal:m2", "cand:c1", "cand:c3", "lead:t1"]);
  // 행의 자리는 오늘 연락이 행을 가리키는 키와 같다.
  assert.equal(rowQueueKey({ kind: "deal", id: "m2" }), "deal:m2");
  assert.deepEqual(buildRecordQueue(), []);
  assert.deepEqual(buildRecordQueue({ missed: null, candidates: null, today: undefined, more: {} }), []);
});

test("from a candidate the next stop is the next candidate, then today's first row", () => {
  const queue = buildRecordQueue({
    missed: [{ kind: "lead", id: "m1", name: "놓친 가" }],
    candidates: [{ id: "c1", customer: { name: "후보 가" } }, { id: "c2", customer: { name: "후보 나" } }],
    today: [{ kind: "lead", id: "t1", name: "오늘 가" }],
  });
  assert.equal(nextQueueEntry(queue, candidateQueueKey("c1"), new Set([candidateQueueKey("c1")])).name, "후보 나");
  assert.equal(nextQueueEntry(queue, candidateQueueKey("c2"), new Set([candidateQueueKey("c1"), candidateQueueKey("c2")])).name, "오늘 가");
  // 후보의 고객이 오늘 약속 행에도 있고 방금 기록해 빠지는 중이면 그 행은 건너뛴다(같은 사람을 다시 열지 않는다).
  assert.equal(nextQueueEntry(queue, candidateQueueKey("c2"), new Set([candidateQueueKey("c2"), "lead:t1"])), null);
});

test("the next person is the next row in screen order", () => {
  assert.equal(nextQueueEntry(QUEUE, "lead:missed-1").name, "후보 가");
  assert.equal(nextQueueEntry(QUEUE, candidateQueueKey("c1")).name, "후보 나");
  // 기록할까요의 마지막 후보 다음은 오늘 약속의 첫 사람이다(화면에서 그 아래에 있다).
  assert.equal(nextQueueEntry(QUEUE, candidateQueueKey("c2")).name, "오늘 고객 가");
  assert.equal(nextQueueEntry(QUEUE, "lead:today-1").name, "오늘 고객 나");
  // 후보의 자리와 고객 행의 자리는 겹치지 않는다.
  assert.equal(candidateQueueKey("lead:today-1"), "cand:lead:today-1");
});

test("rows that were just recorded are skipped, not revisited", () => {
  // 방금 기록해 빠지는 자리(leaving) — Set이든 배열이든 같다.
  assert.equal(nextQueueEntry(QUEUE, "lead:missed-1", new Set([candidateQueueKey("c1")])).name, "후보 나");
  assert.equal(nextQueueEntry(QUEUE, "lead:missed-1", [candidateQueueKey("c1"), candidateQueueKey("c2")]).name, "오늘 고객 가");
  // 지금 사람 자신이 빠지는 중이어도(저장 직후) 자리를 찾는다 — 줄은 빠지는 행을 걷지 않고 건너뛸 뿐이다.
  assert.equal(nextQueueEntry(QUEUE, "lead:today-1", new Set(["lead:today-1"])).name, "오늘 고객 나");
  // 앞사람으로 되돌아가지 않는다 — 줄은 앞으로만 간다.
  assert.equal(nextQueueEntry(QUEUE, "deal:today-2", new Set()), null);
});

test("at the end of the list there is no next — the window closes", () => {
  assert.equal(nextQueueEntry(QUEUE, "deal:today-2"), null);
  assert.equal(nextQueueEntry(QUEUE, "lead:today-1", ["deal:today-2"]), null);
  assert.equal(nextQueueEntry([], "lead:today-1"), null);
  assert.equal(nextQueueEntry(undefined, "lead:today-1"), null);
});

test("a window opened outside the list has no next — nothing is invented", () => {
  // 고객을 직접 골라 연 창(N)은 줄에 자리가 없다.
  assert.equal(nextQueueEntry(QUEUE, null), null);
  assert.equal(nextQueueEntry(QUEUE, undefined), null);
  // 줄에 없는 자리(접힌 줄을 닫았거나 목록이 바뀌었다)에서 첫 사람으로 튀지 않는다.
  assert.equal(nextQueueEntry(QUEUE, "lead:gone"), null);
});

// ── 지금 창 다음에 설 사람(화면의 '다음'과 저장 뒤 넘어가는 곳이 쓰는 한 규칙) ────────────────

const rowTarget = (key) => ({ kind: key.split(":")[0], id: key.split(":")[1], name: key });

test("a customer picked inside the window is never their own next", () => {
  // 고객과 맞지 않은 기록 후보(target 없음)에서 연 창 — 고르기 전에는 줄의 다음 자리가 다음이다.
  const unmatched = { queueKey: candidateQueueKey("c2"), target: null };
  assert.equal(nextRecordEntry(QUEUE, unmatched).key, "lead:today-1");
  // 그 창에서 오늘 고객 가를 골랐다 — 쓰고 있는 사람을 '다음'이라고 부르지 않고 그 뒤 사람이 다음이다.
  assert.equal(nextRecordEntry(QUEUE, unmatched, { target: rowTarget("lead:today-1") }).key, "deal:today-2");
  // 고른 고객이 줄에 남은 마지막 사람이면 다음이 없다 — '저장' 하나이고, 저장하면 닫힌다(지금의 토스트 되돌리기).
  assert.equal(nextRecordEntry(QUEUE, unmatched, { target: rowTarget("deal:today-2"), leaving: ["lead:today-1"] }), null);
  const short = [{ key: candidateQueueKey("c9"), name: "후보" }, { key: "lead:only", name: "하나 남은 고객" }];
  assert.equal(nextRecordEntry(short, { queueKey: candidateQueueKey("c9"), target: null }).key, "lead:only");
  assert.equal(nextRecordEntry(short, { queueKey: candidateQueueKey("c9"), target: null }, { target: rowTarget("lead:only") }), null);
  // 고객이 정해진 창(행 · 맞은 후보)은 그 고객이 기준이다 — 직접 고른 고객이 있으면 그 고객이 이긴다.
  const matched = { queueKey: candidateQueueKey("c1"), target: rowTarget("lead:today-1") };
  assert.equal(nextRecordEntry(QUEUE, matched).key, candidateQueueKey("c2"));
  assert.equal(nextRecordEntry(QUEUE, { ...matched, queueKey: candidateQueueKey("c2") }).key, "deal:today-2");
  // 줄에 자리가 없는 창(N)은 다음이 없다.
  assert.equal(nextRecordEntry(QUEUE, { target: rowTarget("lead:today-1") }), null);
  assert.equal(nextRecordEntry(QUEUE, null), null);
});

test("a person already recorded in this window is not offered again when the list puts them back", () => {
  // 펼친 '다가오는 약속' — 저장이 확인되면 행이 leaving에서 풀리고 새 약속으로 줄 뒤쪽에 다시 선다.
  const reappeared = [
    { key: "lead:a", name: "가" },
    { key: "lead:b", name: "나" },
    { key: "lead:d", name: "라" },
    { key: "lead:a", name: "가 (새 약속)" },
    { key: "lead:b", name: "나 (새 약속)" },
    { key: "lead:e", name: "마" },
  ];
  const at = (key) => ({ queueKey: key, target: rowTarget(key) });
  // leaving만 보면 가 · 나가 다시 온다 — 이 창에서 기록한 자리(done)가 그것을 막는다.
  assert.equal(nextRecordEntry(reappeared, at("lead:d"), { leaving: [] }).name, "가 (새 약속)");
  assert.equal(nextRecordEntry(reappeared, at("lead:d"), { leaving: [], done: new Set(["lead:a", "lead:b", "lead:d"]) }).name, "마");
  // 되돌렸거나 실패한 기록은 done에서 빠진다 — 그 사람은 다시 줄에 선다.
  assert.equal(nextRecordEntry(reappeared, at("lead:d"), { done: ["lead:a", "lead:d"] }).name, "나 (새 약속)");
  // 끝까지 기록했으면 다음이 없다.
  assert.equal(nextRecordEntry(reappeared, at("lead:e"), { done: ["lead:a", "lead:b", "lead:d", "lead:e"] }), null);
});

test("a candidate's window carries the customer's company — the read column reads company-first like a row's", () => {
  const calendar = { id: "calendar:lead:L1:ev1", customer: { key: "lead:L1", kind: "lead", id: "L1", name: "새봄 학원", org: null, companyId: "CO-9" } };
  const target = candidateRecordTarget(calendar);
  assert.deepEqual(target, { kind: "lead", id: "L1", companyId: "CO-9", name: "새봄 학원", org: null });
  assert.equal(recordActivityQuery(target), "companyId=CO-9");
  // 회사를 모르는 후보만 자신의 id로 읽는다.
  assert.equal(recordActivityQuery(candidateRecordTarget({ customer: { kind: "account", id: "A1", name: "가온" } })), "accountId=A1");
  // 종류 · id가 customer.key에만 있는 후보(통화 기록).
  assert.deepEqual(candidateRecordTarget({ customer: { key: "lead:L7", name: "", org: "별빛 학원", companyId: "CO-7" } }), { kind: "lead", id: "L7", companyId: "CO-7", name: "별빛 학원", org: "별빛 학원" });
  // 고객과 맞지 않은 후보는 대상이 없다 — 이름으로 고르기부터 연다.
  assert.equal(candidateRecordTarget({ customer: { key: null, kind: null, id: null, name: "김원장" } }), null);
  assert.equal(candidateRecordTarget({ customer: { key: "contact:c1", name: "김원장" } }), null);
  assert.equal(candidateRecordTarget(null), null);
});

// ── 앞 사람의 영수증 ─────────────────────────────────────────────────────────

const queued = (id, name, extra = {}) => ({ type: "queued", id, name, target: { kind: "lead", id: `t-${id}`, name }, targetKey: `lead:t-${id}`, entry: { queueKey: `lead:t-${id}` }, startedAt: 1000, undo: () => true, ...extra });

test("a queued record walks 기록 중 → 저장 중 → 저장됨, and 저장됨 only comes from the saved event", () => {
  let trail = applyTrailEvent([], queued("a", "가온"));
  assert.deepEqual(trail.map((r) => [r.id, r.phase]), [["a", "pending"]]);
  assert.equal(typeof trail[0].undo, "function");
  assert.equal(trail[0].at, null, "서버의 답을 받기 전에는 시각이 없다");

  trail = applyTrailEvent(trail, { type: "sending", id: "a" });
  assert.equal(trail[0].phase, "sending");
  assert.equal(trail[0].undo, null, "보낸 뒤에는 되돌릴 수 없다");

  trail = applyTrailEvent(trail, { type: "saved", id: "a", at: "2026-09-30T01:41:00.000Z" });
  assert.equal(trail[0].phase, "saved");
  assert.equal(trail[0].at, "2026-09-30T01:41:00.000Z");
  // 어느 사건도 입력을 바꾸지 않는다.
  const frozen = Object.freeze([Object.freeze({ ...trail[0], phase: "sending" })]);
  assert.equal(applyTrailEvent(frozen, { type: "saved", id: "a", at: "x" })[0].phase, "saved");
  assert.equal(frozen[0].phase, "sending");
});

test("events for records the line does not track change nothing", () => {
  const trail = applyTrailEvent([], queued("a", "가온"));
  // '저장만'으로 보낸 기록(줄에 없다)의 사건은 줄을 건드리지 않는다 — 같은 배열이 돌아온다.
  assert.equal(applyTrailEvent(trail, { type: "saved", id: "other", at: "x" }), trail);
  assert.equal(applyTrailEvent(trail, { type: "failed", id: "other", message: "x" }), trail);
  assert.equal(applyTrailEvent(trail, { type: "drop", id: "other" }), trail);
  assert.equal(applyTrailEvent(trail, { type: "saved" }), trail);
  assert.equal(applyTrailEvent(trail, { type: "unknown", id: "a" }), trail);
  assert.equal(trailTracks(trail, "a"), true);
  assert.equal(trailTracks(trail, "other"), false);
  assert.equal(trailTracks(trail, undefined), false);
  assert.equal(trailTracks(undefined, "a"), false);
});

test("a failure keeps the text and the cause; an undo keeps a way back", () => {
  const form = { summary: "견적 검토 통화", body: "긴 글" };
  let trail = applyTrailEvent(applyTrailEvent([], queued("a", "가온")), { type: "sending", id: "a" });
  // 폼은 실패를 알릴 때 먼저 낙관 행을 걷는다(onUndone) — 그 뒤의 실패가 이긴다.
  trail = applyTrailEvent(trail, { type: "undone", id: "a" });
  trail = applyTrailEvent(trail, { type: "failed", id: "a", message: "서버에 닿지 않았어요", form });
  assert.equal(trail[0].phase, "failed");
  assert.equal(trail[0].message, "서버에 닿지 않았어요");
  assert.equal(trail[0].form, form);
  assert.deepEqual(trail[0].target, { kind: "lead", id: "t-a", name: "가온" });
  assert.deepEqual(trail[0].entry, { queueKey: "lead:t-a" }, "돌아갈 때 그 창을 열었던 맥락을 그대로 돌려준다");

  const undone = applyTrailEvent(applyTrailEvent([], queued("b", "새봄")), { type: "undone", id: "b" });
  assert.equal(undone[0].phase, "undone");
  assert.equal(undone[0].undo, null);
  // 돌아가면 그 줄을 걷는다.
  assert.deepEqual(applyTrailEvent(undone, { type: "drop", id: "b" }), []);
});

test("a new record pushes finished lines out but never an unresolved one", () => {
  let trail = applyTrailEvent([], queued("a", "가온"));
  trail = applyTrailEvent(trail, { type: "saved", id: "a", at: "x" });
  // 끝난 줄은 다음 기록이 줄에 서기 전까지 남는다(저장됨 hh:mm을 볼 시간이 있다).
  assert.deepEqual(trail.map((r) => r.id), ["a"]);
  trail = applyTrailEvent(trail, queued("b", "새봄"));
  assert.deepEqual(trail.map((r) => r.id), ["b"], "저장된 옛 줄은 비킨다");

  // 되돌리기 창 · 보낸 뒤 · 일부 저장 · 저장 못 함은 새 기록이 서도 남는다.
  trail = applyTrailEvent(trail, queued("c", "별빛"));
  assert.deepEqual(trail.map((r) => [r.id, r.phase]), [["c", "pending"], ["b", "pending"]], "아직 되돌릴 수 있는 기록을 잃지 않는다");
  trail = applyTrailEvent(trail, { type: "failed", id: "b", message: "실패" });
  trail = applyTrailEvent(trail, { type: "partial", id: "c", at: "x" });
  trail = applyTrailEvent(trail, queued("d", "온새미로"));
  assert.deepEqual(trail.map((r) => [r.id, r.phase]), [["d", "pending"], ["c", "partial"], ["b", "failed"]]);
  // 되돌린 줄은 끝난 줄이다 — 다음 기록이 서면 비킨다(쓰던 글은 그 고객의 초안에 있다).
  trail = applyTrailEvent(trail, { type: "undone", id: "d" });
  trail = applyTrailEvent(trail, queued("e", "다온"));
  assert.deepEqual(trail.map((r) => r.id), ["e", "c", "b"]);
  // 같은 ID가 다시 서면 한 줄이다.
  assert.equal(applyTrailEvent(trail, queued("e", "다온")).filter((r) => r.id === "e").length, 1);
});

// ── 저장하면 어디로 가는가 ───────────────────────────────────────────────────

const trailOf = (...events) => events.reduce((trail, event) => applyTrailEvent(trail, event), []);

test("with nothing unresolved, saving goes to the next person; with none it closes", () => {
  assert.deepEqual(recordNextStop({ next: { name: "새봄" }, trail: [], targetKey: "lead:t-a" }), { kind: "next", name: "새봄" });
  assert.equal(recordNextStop({ next: null, trail: [], targetKey: "lead:t-a" }), null);
  assert.equal(recordNextStop(), null);
  // 앞 사람이 아직 가는 중이거나 저장됐으면 줄은 그대로 앞으로 간다.
  const flying = trailOf(queued("a", "가온"), { type: "sending", id: "a" });
  assert.equal(recordNextStop({ next: { name: "별빛" }, trail: flying, targetKey: "lead:t-b" }).kind, "next");
  const saved = trailOf(queued("a", "가온"), { type: "saved", id: "a", at: "x" });
  assert.equal(recordNextStop({ next: { name: "별빛" }, trail: saved, targetKey: "lead:t-b" }).kind, "next");
});

test("failure does not advance — the next stop is the person whose record was not saved", () => {
  const failed = trailOf(queued("a", "가온"), { type: "failed", id: "a", message: "서버에 닿지 않았어요" });
  // 다음 사람이 있어도 앞으로 가지 않는다.
  assert.deepEqual(recordNextStop({ next: { name: "별빛" }, trail: failed, targetKey: "lead:t-b" }), { kind: "return", id: "a", name: "가온", reason: "failed" });
  // 마지막 사람이어도 닫히지 않는다 — 저장 못 한 기록으로 돌아간다.
  assert.equal(recordNextStop({ next: null, trail: failed, targetKey: "lead:t-b" }).kind, "return");
  // 요약만 저장된 기록(자세히는 아직)도 같다.
  const partial = trailOf(queued("a", "가온"), { type: "partial", id: "a", at: "x" });
  assert.deepEqual(recordNextStop({ next: { name: "별빛" }, trail: partial, targetKey: "lead:t-b" }), { kind: "return", id: "a", name: "가온", reason: "partial" });
  // 여럿이면 오래된 것부터 돌아간다.
  const two = trailOf(queued("a", "가온"), queued("b", "새봄"), { type: "failed", id: "a", message: "x" }, { type: "failed", id: "b", message: "x" });
  assert.equal(recordNextStop({ next: { name: "별빛" }, trail: two, targetKey: "lead:t-c" }).id, "a");
  // 되돌린 기록은 막지 않는다 — 운영자가 스스로 되돌린 것이다(돌아갈 길은 줄에 있다).
  const undone = trailOf(queued("a", "가온"), { type: "undone", id: "a" });
  assert.equal(recordNextStop({ next: { name: "별빛" }, trail: undone, targetKey: "lead:t-b" }).kind, "next");
});

test("once the window is back on that person the line lets go and the queue moves on", () => {
  const failed = trailOf(queued("a", "가온"), { type: "failed", id: "a", message: "x" });
  // 지금 창이 그 사람의 것이면 돌아갈 곳이 아니다 — 저장하면 다음으로 간다.
  assert.deepEqual(recordNextStop({ next: { name: "별빛" }, trail: failed, targetKey: "lead:t-a" }), { kind: "next", name: "별빛" });
  // 그 사람의 창이 서면 '이전' 줄의 돌아갈 길도 걷는다(쓰던 글이 이미 이 창에 있다).
  assert.deepEqual(trailWithoutTarget(failed, "lead:t-a"), []);
  // 아직 가는 중인 같은 사람의 기록은 남는다(같은 고객의 다음 기록 후보로 넘어온 창) — 되돌리기를 잃지 않는다.
  const pending = trailOf(queued("a", "가온"));
  assert.equal(trailWithoutTarget(pending, "lead:t-a"), pending);
  assert.equal(trailWithoutTarget(failed, "lead:t-z"), failed);
  assert.equal(trailWithoutTarget(failed, ""), failed);
});

test("the save line names where the primary button leads", () => {
  assert.equal(recordNextHint({ kind: "next", name: "새봄" }), "저장하면 다음 · 새봄");
  assert.equal(recordNextHint({ kind: "return", name: "가온" }), "저장하면 저장 못 한 기록으로 돌아가요 · 가온");
  assert.equal(recordNextHint(null), "");
});

test("a partial save is not called 'not saved' — the summary is on the server, only 자세히 is left", () => {
  const partial = trailOf(queued("a", "가온"), { type: "partial", id: "a", at: "2026-09-30T01:41:00.000Z" });
  const stop = recordNextStop({ next: { name: "별빛" }, trail: partial, targetKey: "lead:t-b" });
  assert.equal(stop.reason, "partial");
  assert.equal(recordNextLabel(stop), "다음 · 자세히가 남은 기록");
  assert.equal(recordNextHint(stop), "저장하면 자세히가 남은 기록으로 돌아가요 · 가온");
  // 같은 줄의 영수증은 "요약만 저장됐어요"다 — 두 말이 어긋나지 않는다.
  assert.match(trailItems(partial)[0].receipt.detail, /요약만 저장됐어요/);
  // 저장하지 못한 기록은 그대로 그렇게 부른다.
  const failed = trailOf(queued("a", "가온"), { type: "failed", id: "a", message: "x" });
  const stuck = recordNextStop({ next: { name: "별빛" }, trail: failed, targetKey: "lead:t-b" });
  assert.equal(recordNextLabel(stuck), "다음 · 저장 못 한 기록");
  assert.equal(recordNextHint(stuck), "저장하면 저장 못 한 기록으로 돌아가요 · 가온");
  assert.equal(recordNextLabel({ kind: "next", name: "별빛" }), "다음");
  assert.equal(recordNextLabel(null), "");
});

test("a record of the same customer in another slot (row vs candidate) is still a way back", () => {
  // 같은 고객의 행 기록이 실패했고 지금 창은 그 고객의 기록 후보다 — 자리가 다르므로 돌아갈 곳이다.
  const failed = trailOf(queued("a", "가온", { targetKey: "lead:t-a" }), { type: "failed", id: "a", message: "x" });
  assert.equal(recordNextStop({ next: { name: "별빛" }, trail: failed, targetKey: "lead:t-a|cand:c1" }).kind, "return");
  assert.equal(trailWithoutTarget(failed, "lead:t-a|cand:c1"), failed);
  // 같은 자리로 돌아왔을 때만 줄을 걷는다.
  assert.deepEqual(trailWithoutTarget(failed, "lead:t-a"), []);
});

test("a note after the save (the real contact time was not kept) rides on the line without changing its phase", () => {
  const saved = trailOf(queued("a", "가온"), { type: "sending", id: "a" }, { type: "noted", id: "a", note: "실제 연락 시각을 남기지 못했어요" }, { type: "saved", id: "a", at: "2026-09-30T01:41:00.000Z" });
  const [item] = trailItems(saved);
  assert.equal(item.phase, "saved");
  assert.equal(item.tone, "status", "기록은 저장됐다 — 위급 색이 아니다");
  assert.equal(item.note, "실제 연락 시각을 남기지 못했어요");
  assert.equal(item.receipt.label, "저장됨");
  // 덧말이 단계보다 늦게 와도 같다. 줄에 없는 기록의 덧말은 아무것도 바꾸지 않는다(호출처가 토스트로 말한다).
  const late = trailOf(queued("a", "가온"), { type: "saved", id: "a", at: "x" }, { type: "noted", id: "a", note: "덧말" });
  assert.equal(trailItems(late)[0].note, "덧말");
  assert.equal(trailItems(late)[0].phase, "saved");
  assert.equal(applyTrailEvent(late, { type: "noted", id: "ghost", note: "덧말" }), late);
  assert.equal(trailTracks(late, "ghost"), false);
  assert.equal(trailItems(trailOf(queued("a", "가온")))[0].note, "");
});

// ── 창 머리의 '이전' 줄 ──────────────────────────────────────────────────────

test("header progress: 기록 중 can be undone, 저장 중 cannot, 저장됨 carries the time of the server's answer", () => {
  const at = "2026-09-30T01:41:00.000Z"; // KST 10:41
  const [pending] = trailItems(trailOf(queued("a", "가온")));
  assert.equal(pending.name, "가온");
  assert.equal(pending.receipt.label, "기록 중");
  assert.equal(pending.receipt.time, "");
  assert.equal(pending.receipt.detail, "", "덧말은 되돌리기 버튼이 대신한다(저장 줄과 같은 모양)");
  assert.equal(pending.canUndo, true);
  assert.equal(pending.canReturn, false);

  const [sending] = trailItems(trailOf(queued("a", "가온"), { type: "sending", id: "a" }));
  assert.equal(sending.receipt.label, "저장 중");
  assert.equal(sending.canUndo, false, "보낸 뒤에는 죽은 되돌리기를 두지 않는다");
  assert.equal(sending.receipt.time, "");

  const [saved] = trailItems(trailOf(queued("a", "가온"), { type: "sending", id: "a" }, { type: "saved", id: "a", at }));
  assert.equal(saved.receipt.label, "저장됨");
  assert.equal(saved.receipt.time, "10:41");
  assert.equal(saved.canUndo, false);
  assert.equal(saved.canReturn, false);
  assert.equal(saved.tone, "status");
  // 저장됨은 saved 사건 없이는 나오지 않는다.
  for (const events of [[queued("a", "가온")], [queued("a", "가온"), { type: "sending", id: "a" }]]) {
    assert.notEqual(trailItems(trailOf(...events))[0].receipt.label, "저장됨");
  }
  // 되돌릴 수단을 받지 못한 기록에는 되돌리기를 그리지 않는다.
  assert.equal(trailItems(trailOf(queued("a", "가온", { undo: null })))[0].canUndo, false);
});

test("header progress: a failure is the one danger line and offers a way back; partial and undone offer it too", () => {
  const [failed] = trailItems(trailOf(queued("a", "가온"), { type: "failed", id: "a", message: "서버에 닿지 않았어요" }));
  assert.equal(failed.tone, "error");
  assert.equal(failed.label, "저장 못 함");
  assert.equal(failed.detail, "쓰던 글은 남아 있어요");
  assert.equal(failed.receipt, null);
  assert.equal(failed.canReturn, true);
  assert.equal(failed.canUndo, false);

  const [partial] = trailItems(trailOf(queued("a", "가온"), { type: "partial", id: "a", at: "2026-09-30T01:41:00.000Z" }));
  assert.equal(partial.receipt.label, "일부 저장");
  assert.equal(partial.receipt.time, "10:41");
  assert.equal(partial.tone, "status", "빨강은 저장하지 못한 줄 한 곳뿐이다");
  assert.equal(partial.canReturn, true);

  const [undone] = trailItems(trailOf(queued("a", "가온"), { type: "undone", id: "a" }));
  assert.equal(undone.label, "되돌렸어요");
  assert.equal(undone.tone, "status");
  assert.equal(undone.canReturn, true);
  assert.deepEqual(trailItems(), []);
});

test("closing the window hands the undo on for the time that is left, and names unresolved failures", () => {
  const undo = () => true;
  const trail = trailOf(
    queued("a", "가온", { startedAt: 1000, undo }),
    queued("b", "새봄", { startedAt: 3000 }),
    { type: "sending", id: "b" },
    queued("c", "별빛"),
    { type: "failed", id: "c", message: "서버에 닿지 않았어요" },
    queued("d", "온새미로"),
    { type: "partial", id: "d", at: "x" },
    queued("e", "다온"),
    { type: "saved", id: "e", at: "x" },
  );
  // 되돌리기 창이 1.5초 지났다 — 남은 2초만큼 이어 준다(3.5초 계약을 줄이지도 늘리지도 않는다).
  const left = trailHandoff(trail, { now: 2500, windowMs: 3500 });
  assert.deepEqual(left, [
    { kind: "partial", id: "d", name: "온새미로" },
    { kind: "failed", id: "c", name: "별빛", message: "서버에 닿지 않았어요", scoped: false },
    { kind: "undo", id: "a", name: "가온", remaining: 2000, undo },
  ]);
  // 초안이 그 기록의 자리에 있는 기록(기록 후보)은 그렇게 넘긴다 — 쓰던 글이 고객의 행이 아니라 그 줄에 있다.
  const scoped = trailOf(queued("s", "후보 고객", { scoped: true }), { type: "failed", id: "s", message: "x" });
  assert.equal(trailHandoff(scoped)[0].scoped, true);
  // 보낸 뒤(b)와 저장된 줄(e)은 넘길 것이 없다 — 확인은 호출처의 onPersisted가 띄운다.
  assert.ok(!left.some((item) => item.id === "b" || item.id === "e"));
  // 창이 거의 닫혔으면(곧 나간다) 되돌리기를 넘기지 않는다 — 누를 수 없는 버튼을 띄우지 않는다.
  assert.ok(!trailHandoff(trail, { now: 4400, windowMs: 3500 }).some((item) => item.kind === "undo"));
  assert.ok(!trailHandoff(trail, { now: 9000, windowMs: 3500 }).some((item) => item.kind === "undo"));
  assert.deepEqual(trailHandoff([]), []);
});

// ── 읽기 칸의 약속 ───────────────────────────────────────────────────────────

test("a row's promise is read the way the customer drawer reads it", () => {
  const late = followupPromise({ promiseText: "OMR 시안 링크 보내기", promisedAt: "2026-09-27T00:00:00Z" }, { todayKey: "2026-09-30", promiseKey: "2026-09-27" });
  assert.equal(late.state, "dated");
  assert.equal(late.late, 3);
  assert.deepEqual(promiseReadout(late), { what: "OMR 시안 링크 보내기", muted: false, late: true, lateLabel: "3일 지남", when: "9/27 약속" });

  const today = followupPromise({ promiseText: "재계약 의사 확인 전화" }, { todayKey: "2026-09-30", promiseKey: "2026-09-30" });
  assert.equal(promiseReadout(today).when, "오늘 · 9/30");

  const dormant = followupPromise({ promiseText: "", dormant: true, dormantSince: "2026-09-01" }, { todayKey: "2026-09-30" });
  assert.equal(dormant.state, "dormant");
  assert.equal(promiseReadout(dormant).what, "기약 없음 · 29일째");

  // 정체로만 올라온 행 — 약속이 비어 있다.
  assert.equal(promiseReadout(followupPromise({ promiseText: null }, { todayKey: "2026-09-30" })).what, "아직 정하지 않았어요");
  // 무엇만 있고 날짜가 없다.
  assert.equal(followupPromise({ promiseText: "견적서 보내기" }, { todayKey: "2026-09-30" }).state, "undated");
});

test("a customer outside the list has an unknown promise, not an empty one", () => {
  assert.equal(followupPromise(null, { todayKey: "2026-09-30" }), null);
  assert.equal(followupPromise(undefined), null);
  const unknown = promiseReadout(null);
  assert.equal(unknown.muted, true);
  assert.match(unknown.what, /알 수 없어요/);
  assert.doesNotMatch(`${unknown.what}${unknown.when}`, /정하지 않았어요|없음/, "모르는 것을 없다고 말하지 않는다");
});
