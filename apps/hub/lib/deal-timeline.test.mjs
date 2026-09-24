import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEAL_VIEW_OPTIONS,
  MAX_DANGER_RAILS,
  buildDealTimeline,
  closeDatePresets,
  dateInputValue,
  dealCustomerKey,
  dealLaneKey,
  dealPromise,
  formatWon,
  isTimelineDeal,
  isoFromDateInput,
  kstDayNumber,
  laneDropDate,
  resolveDealView,
  sameCloseDay,
  timelineContext,
} from "./deal-timeline.js";
import { STALLED_DAYS } from "./deal-stages.js";
import { CERTAINTY_BY_STAGE } from "./personal-revenue-roadmap.js";

// 2026-09-24(목) 10:00 KST — 이번 주 9/21(월)–9/27(일), 다음 주 9/28–10/4, 나중에 10/5부터.
const NOW = new Date("2026-09-24T01:00:00Z");
const ctx = timelineContext(NOW);
const kst = (ymd) => `${ymd}T03:00:00.000Z`; // KST 정오

test("보기 키는 언제·단계·지역 셋이고 모르는 값은 언제로 떨어진다", () => {
  assert.deepEqual(DEAL_VIEW_OPTIONS.map((o) => o.label), ["언제", "단계", "지역"]);
  assert.equal(resolveDealView(null), "time");
  assert.equal(resolveDealView("stage"), "stage");
  assert.equal(resolveDealView("REGION"), "region");
  assert.equal(resolveDealView("kanban"), "time");
});

test("주 경계는 KST 월요일 시작이고 UTC 자정 직전 시각도 KST 날짜로 읽는다", () => {
  assert.equal(ctx.monthLabel, "9월");
  assert.equal(ctx.thisWeekStart, kstDayNumber("2026-09-21"));
  assert.equal(ctx.nextWeekStart, kstDayNumber("2026-09-28"));
  assert.equal(ctx.laterStart, kstDayNumber("2026-10-05"));
  // 9/27 20:00 UTC = 9/28 05:00 KST → 다음 주 칸
  assert.equal(dealLaneKey({ closeAt: "2026-09-27T20:00:00Z" }, ctx), "next-week");
  assert.equal(dealLaneKey({ closeAt: "2026-09-27" }, ctx), "this-week");
  assert.equal(dealLaneKey({ closeAt: "2026-09-02" }, ctx), "this-week", "지난 예상일은 지금 처리할 일");
  assert.equal(dealLaneKey({ closeAt: "2026-10-05" }, ctx), "later");
  assert.equal(dealLaneKey({ closeAt: "" }, ctx), "undated");
  assert.equal(dealLaneKey({ closeAt: "not-a-date" }, ctx), "undated");
});

test("Lost·숨김은 빠지고 클로징은 이번 달 이후 예상일일 때만 입금 대기로 남는다", () => {
  assert.equal(isTimelineDeal({ stage: "lost", closeAt: kst("2026-09-25") }, ctx), false);
  assert.equal(isTimelineDeal({ stage: "quote", hidden: true }, ctx), false);
  assert.equal(isTimelineDeal({ stage: "quote" }, ctx), true, "날짜 없는 열린 거래는 날짜 미정 칸");
  assert.equal(isTimelineDeal({ stage: "closing", closeAt: kst("2026-09-03") }, ctx), true);
  assert.equal(isTimelineDeal({ stage: "closing", closeAt: kst("2026-08-30") }, ctx), false);
  assert.equal(isTimelineDeal({ stage: "closing" }, ctx), false);
});

test("제목 금액은 이번 달 확정만, 잘 풀리면은 확정 + 가능성 높음 — 확인 필요는 더하지 않는다", () => {
  const timeline = buildDealTimeline([
    { id: "won", stage: "closing", value: 1800000, closeAt: kst("2026-09-25") },
    { id: "quote", stage: "quote", value: 2400000, closeAt: kst("2026-09-30") },
    { id: "contact", stage: "contact", value: 1200000, closeAt: kst("2026-09-29") },
    { id: "october", stage: "final", value: 4800000, closeAt: kst("2026-10-12") },
    { id: "undated", stage: "potential", value: 600000 },
  ], { now: NOW });
  assert.equal(timeline.month.confirmed, 1800000);
  assert.equal(timeline.month.upside, 4200000);
  assert.equal(timeline.month.total, 5400000);
  assert.equal(timeline.month.count, 3, "예상일이 10월·미정인 건은 이번 달 리본 밖");
  assert.deepEqual(timeline.month.segments.map((s) => [s.key, s.label]), [
    ["confirmed", CERTAINTY_BY_STAGE.closing.label],
    ["recommended", CERTAINTY_BY_STAGE.final.label],
    ["unknown", CERTAINTY_BY_STAGE.potential.label],
  ]);
  assert.equal(timeline.count, 5);
});

test("칸은 이번 주·다음 주·나중에·날짜 미정 넷이고 나중에는 월별로 묶인다", () => {
  const timeline = buildDealTimeline([
    { id: "a", stage: "quote", value: 100, closeAt: kst("2026-09-25") },
    { id: "late", stage: "consult", value: 50, closeAt: kst("2026-09-10") },
    { id: "b", stage: "quote", value: 200, closeAt: kst("2026-10-01") },
    { id: "c", stage: "final", value: 300, closeAt: kst("2026-10-20") },
    { id: "d", stage: "final", value: 400, closeAt: kst("2027-01-05") },
    { id: "e", stage: "potential", value: 0 },
  ], { now: NOW });
  assert.deepEqual(timeline.lanes.map((lane) => lane.key), ["this-week", "next-week", "later", "undated"]);
  const [thisWeek, nextWeek, later, undated] = timeline.lanes;
  assert.equal(thisWeek.current, true);
  assert.equal(thisWeek.rangeLabel, "9/21–9/27");
  assert.equal(nextWeek.rangeLabel, "9/28–10/4");
  assert.equal(later.rangeLabel, "10/5부터");
  assert.deepEqual(thisWeek.items.map((i) => i.id), ["late", "a"], "지난 예상일이 먼저");
  assert.equal(thisWeek.items[0].closeOverdue, true);
  assert.equal(thisWeek.total, 150);
  assert.deepEqual(nextWeek.items.map((i) => i.id), ["b"]);
  assert.deepEqual(later.groups.map((g) => g.label), ["10월", "2027년 1월"]);
  assert.deepEqual(undated.items.map((i) => i.id), ["e"]);
  assert.deepEqual(timeline.ordered.map((i) => i.id), ["late", "a", "b", "c", "d", "e"]);
});

test("다음 약속은 기록의 next_action이 먼저, 지난 날짜는 N일 지남으로 말한다", () => {
  assert.deepEqual(dealPromise({ nextAction: "견적서 보내기", nextActionAt: "2026-09-22" }, ctx), {
    text: "견적서 보내기", overdue: true, dueLabel: "2일 지남", overdueDays: 2,
  });
  assert.equal(dealPromise({ nextAction: "회신 받기", nextActionAt: "2026-09-24" }, ctx).dueLabel, "오늘");
  assert.equal(dealPromise({ nextAction: "회신 받기", nextActionAt: "2026-09-25" }, ctx).dueLabel, "내일");
  assert.equal(dealPromise({ nextAction: "데모", nextActionAt: "2026-09-29" }, ctx).dueLabel, "9/29 화");
  assert.equal(dealPromise({ nextAction: "날짜 없는 약속" }, ctx).dueLabel, null);
  assert.equal(dealPromise({ nextMeeting: { summary: "킥오프", startAt: "2026-09-26T05:00:00Z" } }, ctx).text, "미팅 · 킥오프");
  assert.equal(dealPromise({ nextAction: "  " }, ctx), null);
});

test("지난 약속의 danger 레일은 화면 순서대로 앞의 예산만큼만", () => {
  const deals = Array.from({ length: 5 }, (_, i) => ({
    id: `d${i}`, stage: "quote", value: 10, closeAt: kst(`2026-09-2${i + 1}`), nextAction: "회신", nextActionAt: "2026-09-20",
  }));
  const timeline = buildDealTimeline(deals, { now: NOW });
  assert.equal(timeline.overdueCount, 5);
  assert.equal(timeline.railIds.size, MAX_DANGER_RAILS);
  assert.deepEqual([...timeline.railIds], timeline.ordered.slice(0, MAX_DANGER_RAILS).map((i) => i.id));
});

test("멈춘 거래는 STALLED_DAYS 기준 하나로 고르고 오래된 순서다", () => {
  const timeline = buildDealTimeline([
    { id: "fresh", stage: "quote", age: STALLED_DAYS - 1 },
    { id: "edge", stage: "quote", age: STALLED_DAYS },
    { id: "old", stage: "contact", age: STALLED_DAYS + 18 },
    { id: "won", stage: "closing", age: 90, closeAt: kst("2026-09-30") },
  ], { now: NOW });
  assert.deepEqual(timeline.stalled.map((i) => i.id), ["old", "edge"]);
});

test("예상일 프리셋과 칸 드롭 날짜는 언제나 그 칸 안에 떨어진다", () => {
  const presets = closeDatePresets(NOW);
  assert.deepEqual(presets.map((p) => p.label), ["이번 주 금", "다음 주", "다음 달", "미정"]);
  assert.equal(presets[0].dateLabel, "9/25 금");
  assert.equal(presets[1].dateLabel, "10/2 금");
  assert.equal(presets[2].dateLabel, "10/15 목");
  assert.equal(presets[3].iso, "");
  for (const laneKey of ["this-week", "next-week", "later"]) {
    const target = laneDropDate(laneKey, NOW);
    assert.equal(dealLaneKey({ closeAt: target.iso }, ctx), laneKey, `${laneKey} 드롭`);
  }
  assert.equal(laneDropDate("undated", NOW).iso, "");
  // 토요일에는 이번 주 금요일이 지났으므로 오늘
  const saturday = new Date("2026-09-26T01:00:00Z");
  assert.equal(closeDatePresets(saturday)[0].dateLabel, "9/26 토");
  // 다음 달 프리셋은 월말이 일요일이어도 다음 주 칸과 겹치지 않는다
  const sundayEnd = new Date("2026-05-31T01:00:00Z");
  const sundayCtx = timelineContext(sundayEnd);
  assert.equal(dealLaneKey({ closeAt: closeDatePresets(sundayEnd)[2].iso }, sundayCtx), "later");
});

test("date 입력 값과 저장 ISO는 KST 날짜로 왕복한다", () => {
  const iso = isoFromDateInput("2026-10-02");
  assert.equal(iso, "2026-10-02T03:00:00.000Z");
  assert.equal(dateInputValue(iso), "2026-10-02");
  assert.equal(dateInputValue("2026-10-01T20:00:00Z"), "2026-10-02");
  assert.equal(isoFromDateInput("10/2"), null);
  assert.equal(sameCloseDay("2026-10-02", iso), true);
  assert.equal(sameCloseDay("", null), true);
});

test("고객 열기 키는 리드 id → 같은 회사 리드 → 같은 회사 계정 순서로 풀고, 못 풀면 null", () => {
  const leads = [{ id: "l1", companyId: "c1" }, { id: "l2", companyId: "c2" }];
  const accounts = [{ id: "a3", companyId: "c3" }];
  assert.equal(dealCustomerKey({ leadId: "l2", companyId: "c1" }, { leads, accounts }), "lead:l2");
  assert.equal(dealCustomerKey({ leadId: "gone", companyId: "c1" }, { leads, accounts }), "lead:l1");
  assert.equal(dealCustomerKey({ companyId: "c3" }, { leads, accounts }), "account:a3");
  assert.equal(dealCustomerKey({ companyId: "c9" }, { leads, accounts }), null);
});

test("금액 라벨은 revenue.jsx와 같은 K/M 임계값", () => {
  assert.equal(formatWon(0), "₩0");
  assert.equal(formatWon(900000), "₩900K");
  assert.equal(formatWon(1800000), "₩1.8M");
  assert.equal(formatWon(500), "₩500");
});
