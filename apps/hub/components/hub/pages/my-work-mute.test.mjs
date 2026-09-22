import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  MUTE_LIMIT,
  MUTE_STORAGE_KEY,
  applyMute,
  clearMute,
  isMutedEntry,
  mutedIdSet,
  pruneMuted,
  readMuteStore,
  seoulDayKey,
  writeMuteStore,
} from "./my-work-mute.js";

const page = readFileSync(new URL("./my-work.jsx", import.meta.url), "utf8");

// 가짜 Storage — 실제 localStorage 없이 read/write 왕복을 검증한다.
function fakeStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    peek: () => value,
  };
}

const deal = { id: "deal-1", lane: "deal", title: "행복한성적표수학 SW 구입 문의 (데모)" };

test("'오늘 안 보기'는 그날만 숨기고 다음 날 스스로 돌아온다", () => {
  const now = new Date("2026-09-20T09:00:00+09:00");
  const entries = applyMute({}, deal, "today", now);
  const today = seoulDayKey(now);
  const tomorrow = seoulDayKey(new Date("2026-09-21T09:00:00+09:00"));

  assert.equal(entries[deal.id].until, today);
  assert.equal(isMutedEntry(entries[deal.id], today), true);
  assert.equal(isMutedEntry(entries[deal.id], tomorrow), false);
  // 만료 항목은 다음 읽기에서 저장소에서도 사라진다 — 쌓이지 않는다.
  assert.deepEqual(Object.keys(pruneMuted(entries, tomorrow)), []);
});

test("'아예 안 보기'는 날짜가 지나도 유지되고, 다시 보기로만 풀린다", () => {
  const now = new Date("2026-09-20T09:00:00+09:00");
  const entries = applyMute({}, deal, "forever", now);
  const muchLater = "2027-03-01";

  assert.equal(entries[deal.id].until, null);
  assert.equal(isMutedEntry(entries[deal.id], muchLater), true);
  assert.deepEqual(Object.keys(pruneMuted(entries, muchLater)), [deal.id]);
  assert.deepEqual(Object.keys(clearMute(entries, deal.id)), []);
});

test("숨김 집합은 만료된 항목을 포함하지 않는다", () => {
  const entries = {
    "task-1": { until: "2026-09-19" }, // 어제까지
    "task-2": { until: "2026-09-20" }, // 오늘까지
    "deal-3": { until: null }, // 무기한
    "deal-4": { until: "깨짐" }, // 손상된 값 — 숨김으로 인정하지 않는다
  };
  assert.deepEqual([...mutedIdSet(entries, "2026-09-20")].sort(), ["deal-3", "task-2"]);
});

test("저장소 왕복은 손상된 값과 차단된 storage를 조용히 견딘다", () => {
  const now = new Date("2026-09-20T09:00:00+09:00");
  const storage = fakeStorage();
  const entries = applyMute({}, deal, "forever", now);
  writeMuteStore(storage, entries);

  const restored = readMuteStore(storage, seoulDayKey(now));
  assert.equal(restored[deal.id].until, null);
  assert.equal(restored[deal.id].title, deal.title); // 관리 목록이 이름을 보여줄 수 있게
  assert.equal(JSON.parse(storage.peek())[deal.id].lane, "deal");

  assert.deepEqual(readMuteStore(fakeStorage("{ 깨진 JSON"), "2026-09-20"), {});
  assert.deepEqual(readMuteStore(fakeStorage("[1,2,3]"), "2026-09-20"), {});
  const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } };
  assert.deepEqual(readMuteStore(blocked, "2026-09-20"), {});
  assert.doesNotThrow(() => writeMuteStore(blocked, entries));
});

test("숨김 목록은 상한을 넘으면 오래된 것부터 버린다", () => {
  let entries = {};
  for (let i = 0; i < MUTE_LIMIT + 5; i += 1) {
    entries = applyMute(entries, { id: `task-${i}`, lane: "task", title: `할 일 ${i}` }, "forever", new Date(Date.parse("2026-09-20T00:00:00Z") + i * 1000));
  }
  assert.equal(Object.keys(entries).length, MUTE_LIMIT);
  assert.equal("task-0" in entries, false); // 가장 오래된 숨김이 밀려났다
  assert.equal(`task-${MUTE_LIMIT + 4}` in entries, true);
});

// 계약 고정: 숨긴 항목이 목록에서만 빠지고 카운트·첫 화면 신호는 거짓말하지 않는다.
test("내 작업 페이지가 숨김 모듈을 쓰고, 숨긴 항목을 카운트에서도 뺀다", () => {
  assert.match(page, /from ["']\.\/my-work-mute\.js["']/);
  // visible(목록) / bucketCounts(시그널 타일) / laneCounts(레인 세그먼트) 세 곳 모두
  // 같은 mutedIds를 통과해야 타일 숫자와 보이는 행 수가 어긋나지 않는다.
  const filterHits = page.match(/mutedIds\.has\(/g) || [];
  assert.ok(filterHits.length >= 3, `mutedIds 필터가 ${filterHits.length}곳 — 목록·기한·레인 카운트 모두에 걸려야 한다`);
  // 숨김이 있는데 "모든 할 일 완료" 축하를 띄우면 거짓 신호다.
  assert.match(page, /mutedCount === 0/);
});

test("저장 키는 페이지의 다른 보기 설정과 같은 네임스페이스", () => {
  assert.equal(MUTE_STORAGE_KEY, "mlp.mywork.muted");
});

// 오늘 3개 별 토글의 활성 색은 CSS가 소유한다 — customers.jsx와 같은 정본 클래스.
// 인라인 color를 되돌리면 활성 별의 hover 피드백과 글리프 채움이 함께 죽는다.
test("오늘 3개 별 토글은 인라인 color 대신 hub-iconbtn--star-active 클래스를 쓴다", () => {
  assert.match(page, /className=\{item\.focusToday \? 'hub-iconbtn--star-active' : ''\}/);
  assert.doesNotMatch(page, /color: item\.focusToday \? 'var\(--moon-300\)'/);
});
