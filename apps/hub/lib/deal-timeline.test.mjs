import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEAL_VIEW_OPTIONS,
  closeDatePresets,
  dateInputValue,
  dealCustomerKey,
  dealDockItem,
  dealPromise,
  formatSignedWon,
  formatWon,
  isoFromDateInput,
  kstDayNumber,
  resolveDealView,
  sameCloseDay,
  timelineContext,
} from "./deal-timeline.js";

// 2026-09-24(목) 10:00 KST — 이번 주 9/21(월)–9/27(일), 다음 주 9/28–10/4, 그 뒤 10/5부터.
const NOW = new Date("2026-09-24T01:00:00Z");
const ctx = timelineContext(NOW);
const kst = (ymd) => `${ymd}T03:00:00.000Z`; // KST 정오

test("보기 키는 돈·단계 둘이고 옛 보기(언제·결제·지역)와 모르는 값은 돈으로 떨어진다", () => {
  assert.deepEqual(DEAL_VIEW_OPTIONS.map((o) => o.label), ["돈", "단계"]);
  assert.deepEqual(DEAL_VIEW_OPTIONS.map((o) => o.key), ["money", "stage"]);
  assert.equal(resolveDealView(null), "money");
  assert.equal(resolveDealView("stage"), "stage");
  assert.equal(resolveDealView("MONEY"), "money");
  for (const legacy of ["time", "payments", "region", "kanban"]) assert.equal(resolveDealView(legacy), "money", legacy);
});

test("주 경계는 KST 월요일 시작이고 UTC 자정 직전 시각도 KST 날짜로 읽는다", () => {
  assert.equal(ctx.monthLabel, "9월");
  assert.equal(ctx.thisWeekStart, kstDayNumber("2026-09-21"));
  assert.equal(ctx.nextWeekStart, kstDayNumber("2026-09-28"));
  assert.equal(ctx.laterStart, kstDayNumber("2026-10-05"));
  assert.equal(ctx.monthStart, kstDayNumber("2026-09-01"));
  assert.equal(ctx.nextMonthStart, kstDayNumber("2026-10-01"));
  // 9/27 20:00 UTC = 9/28 05:00 KST
  assert.equal(kstDayNumber("2026-09-27T20:00:00Z"), kstDayNumber("2026-09-28"));
  assert.equal(kstDayNumber("not-a-date"), null);
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

test("예상일 프리셋은 이번 주 금 · 다음 주 금 · 다음 달 15일 · 미정", () => {
  const presets = closeDatePresets(NOW);
  assert.deepEqual(presets.map((p) => p.label), ["이번 주 금", "다음 주", "다음 달", "미정"]);
  assert.equal(presets[0].dateLabel, "9/25 금");
  assert.equal(presets[1].dateLabel, "10/2 금");
  assert.equal(presets[2].dateLabel, "10/15 목");
  assert.equal(presets[3].iso, "");
  // 토요일에는 이번 주 금요일이 지났으므로 오늘
  const saturday = new Date("2026-09-26T01:00:00Z");
  assert.equal(closeDatePresets(saturday)[0].dateLabel, "9/26 토");
  // 다음 달 프리셋은 월말이 일요일이어도 다음 주 뒤에 떨어진다
  const sundayEnd = new Date("2026-05-31T01:00:00Z");
  const sundayCtx = timelineContext(sundayEnd);
  assert.ok(kstDayNumber(closeDatePresets(sundayEnd)[2].iso) >= sundayCtx.laterStart);
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

test("차이 금액은 부호를 붙인다 — 음수는 U+2212, 0은 부호 없이", () => {
  assert.equal(formatSignedWon(-200000), "−₩200K");
  assert.equal(formatSignedWon(300000), "+₩300K");
  assert.equal(formatSignedWon(0), "₩0");
  assert.equal(formatSignedWon("nope"), "₩0");
});

test("독 항목은 거래 하나 — 전액 입금된 거래도 열 수 있다", () => {
  const done = { id: "done", stage: "closing", value: 900000, closeAt: kst("2026-09-10"), companyName: "끝난 곳",
    payments: [{ id: "q", expectedAmount: 900000, expectedAt: kst("2026-09-10"), status: "paid", paidAmount: 900000, paidAt: kst("2026-09-10") }] };
  const item = dealDockItem(done, { now: NOW });
  assert.equal(item.id, "done");
  assert.equal(item.deal, done);
  assert.equal(item.amount, 900000);
  assert.equal(item.closeLabel, "9/10 목");
  assert.equal(item.explicitPayment, false, "독의 예상일 바꾸기는 거래의 예상일");
  assert.equal(item.certainty.key, "confirmed");
  assert.equal(dealDockItem(null), null);
});
