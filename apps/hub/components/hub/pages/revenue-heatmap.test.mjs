import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// revenue-heatmap.jsx는 JSX라 node --test가 직접 import할 수 없다.
// 대신 페이지 파일이 마커로 감싼 self-contained 순수 블록(월/분기 헬퍼)을
// 소스에서 추출해 data: 모듈로 실행한다 — 블록이 JSX/외부 참조를 갖게 되면 여기서 깨진다.
const source = await readFile(new URL("./revenue-heatmap.jsx", import.meta.url), "utf8");

const START = "// [heatmap-period-pure-start]";
const END = "// [heatmap-period-pure-end]";
const startIdx = source.indexOf(START);
const endIdx = source.indexOf(END);
assert.ok(startIdx >= 0 && endIdx > startIdx, "기간 순수 블록 마커가 revenue-heatmap.jsx에 있어야 한다");

const block = source.slice(source.indexOf("\n", startIdx) + 1, endIdx);
const period = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(block)}`);

test("periodRange: 월/분기 [시작, 끝) 캘린더 경계 (로컬 타임존)", () => {
  const [mStart, mEnd] = period.periodRange("month", "2026-06");
  assert.equal(mStart, new Date(2026, 5, 1).getTime());
  assert.equal(mEnd, new Date(2026, 6, 1).getTime()); // 7/1 00:00은 미포함(반개구간)
  const midJune = new Date(2026, 5, 15).getTime();
  assert.ok(period.inPeriodRange(midJune, [mStart, mEnd]));
  assert.ok(!period.inPeriodRange(new Date(2026, 4, 31).getTime(), [mStart, mEnd]));
  assert.ok(!period.inPeriodRange(mEnd, [mStart, mEnd]));

  const [qStart, qEnd] = period.periodRange("quarter", "2025-Q4");
  assert.equal(qStart, new Date(2025, 9, 1).getTime());
  assert.equal(qEnd, new Date(2026, 0, 1).getTime()); // 연도 넘어가는 끝 경계

  // range=null은 필터 없음(전체 통과)
  assert.ok(period.inPeriodRange(midJune, null));
});

test("dealPeriodCandidates: 실존 월/분기만, lost·무날짜 제외, 최근 우선, 라벨 형식", () => {
  // 시각은 ±12h 어떤 타임존에서도 같은 월에 떨어지도록 월 중순 정오(+09:00)로 고정
  const deals = [
    { stage: "closing", closeAt: "2026-06-10T12:00:00+09:00" },
    { stage: "proposal", closeAt: null, activityAt: "2026-04-15T12:00:00+09:00" }, // activityAt 폴백
    { stage: "closing", closeAt: "2026-06-20T12:00:00+09:00" }, // 같은 달 중복 → 칩 1개
    { stage: "lost", closeAt: "2026-03-10T12:00:00+09:00" }, // lost 제외
    { stage: "contact", closeAt: null, activityAt: null }, // 무날짜 제외
    { stage: "closing", closeAt: "2025-12-15T12:00:00+09:00" },
  ];

  const months = period.dealPeriodCandidates(deals, "month", 2026);
  assert.deepEqual(months.map(m => m.key), ["2026-06", "2026-04", "2025-12"]);
  assert.deepEqual(months.map(m => m.label), ["6월", "4월", "25.12"]);

  const quarters = period.dealPeriodCandidates(deals, "quarter", 2026);
  assert.deepEqual(quarters.map(q => q.key), ["2026-Q2", "2025-Q4"]);
  assert.deepEqual(quarters.map(q => q.label), ["Q2", "25 Q4"]);

  assert.deepEqual(period.dealPeriodCandidates([], "month", 2026), []);
});

test("후보 키와 필터 구간의 일관성: 딜은 자기 월/분기 range에 항상 매칭된다", () => {
  const stamps = [
    new Date(2026, 0, 1, 0, 0, 0).getTime(), // 월 시작 경계
    new Date(2026, 11, 31, 23, 59, 59).getTime(), // 연말 경계
    new Date(2025, 2, 31, 23, 59, 59).getTime(), // 분기 끝 경계
  ];
  for (const ms of stamps) {
    assert.ok(period.inPeriodRange(ms, period.periodRange("month", period.monthKeyOf(ms))));
    assert.ok(period.inPeriodRange(ms, period.periodRange("quarter", period.quarterKeyOf(ms))));
  }
});
