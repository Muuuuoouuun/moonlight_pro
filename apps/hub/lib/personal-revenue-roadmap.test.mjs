import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPersonalRevenueRoadmap,
  recommendDealAction,
} from "./personal-revenue-roadmap.js";

const referenceDate = new Date(2026, 7, 31, 9, 0, 0);

const deals = [
  {
    id: "confirmed",
    name: "확정 잔금",
    stage: "closing",
    value: 6_800_000,
    closeAt: new Date(2026, 7, 31, 15, 0, 0).toISOString(),
    nextAction: "입금 확인",
  },
  {
    id: "waiting",
    name: "결제 일정 대기",
    stage: "final",
    value: 4_200_000,
    closeAt: new Date(2026, 8, 8, 12, 0, 0).toISOString(),
    nextAction: "담당자에게 결제일 확인",
  },
  {
    id: "likely",
    name: "자문 제안",
    stage: "quote",
    value: 3_200_000,
    closeAt: new Date(2026, 8, 30, 18, 0, 0).toISOString(),
    nextAction: "",
  },
  {
    id: "outside",
    name: "31일 밖",
    stage: "consult",
    value: 9_000_000,
    closeAt: new Date(2026, 9, 1, 9, 0, 0).toISOString(),
  },
  {
    id: "lost",
    name: "종료 딜",
    stage: "lost",
    value: 20_000_000,
    closeAt: new Date(2026, 8, 4, 9, 0, 0).toISOString(),
  },
  {
    id: "unscheduled",
    name: "날짜 미정",
    stage: "contact",
    value: 1_000_000,
    closeAt: "",
  },
];

test("builds an inclusive today-to-day-30 roadmap from actual close dates", () => {
  const model = buildPersonalRevenueRoadmap(deals, { now: referenceDate, days: 30 });

  assert.deepEqual(model.events.map((event) => event.id), ["confirmed", "waiting", "likely"]);
  assert.equal(model.events[0].dayOffset, 0);
  assert.equal(model.events[0].position, 0);
  assert.equal(model.events[2].dayOffset, 30);
  assert.equal(model.events[2].position, 100);
  assert.equal(model.window.days, 30);
});

test("aggregates expected inflow by explicit certainty labels", () => {
  const model = buildPersonalRevenueRoadmap(deals, { now: referenceDate, days: 30 });

  assert.deepEqual(model.summary, {
    expectedInflow: 14_200_000,
    confirmed: 6_800_000,
    waiting: 4_200_000,
    likely: 3_200_000,
    possible: 0,
    missingNextAction: 1,
    scheduledDeals: 3,
  });
  assert.deepEqual(
    model.events.map(({ id, certainty }) => [id, certainty.key, certainty.label]),
    [
      ["confirmed", "confirmed", "확정"],
      ["waiting", "waiting", "입금 대기"],
      ["likely", "likely", "가능성 높음"],
    ],
  );
});

test("keeps confirmed next actions separate from stage-based recommendations", () => {
  const model = buildPersonalRevenueRoadmap(deals, { now: referenceDate, days: 30 });
  const waiting = model.events.find((event) => event.id === "waiting");
  const likely = model.events.find((event) => event.id === "likely");

  assert.deepEqual(waiting.action, {
    text: "담당자에게 결제일 확인",
    source: "confirmed",
    label: "확정",
  });
  assert.deepEqual(likely.action, {
    text: "견적 피드백을 확인하고 다음 미팅 제안",
    source: "recommended",
    label: "권장",
  });
  assert.equal(recommendDealAction("contact"), "다음 연락 일정을 확정");
});

test("orders this-week actions by timing, then impact, without confirmed cash", () => {
  const model = buildPersonalRevenueRoadmap(deals, { now: referenceDate, days: 30 });

  assert.deepEqual(model.actions.map((action) => action.id), ["waiting", "likely"]);
  assert.equal(model.changeableAmount, 7_400_000);
});
