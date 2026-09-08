import assert from "node:assert/strict";
import { test } from "node:test";

import {
  businessTruthCompleteness,
  buildBusinessTruthMeta,
  buildWeeklyScorecard,
  normalizeCampaignBusinessTruth,
} from "./campaign-business-truth.js";

test("normalizes a persisted campaign business truth without inventing zero actuals", () => {
  const truth = normalizeCampaignBusinessTruth({
    business_truth: {
      version: 1,
      icp: "  5~20인 학원 원장  ",
      problem: "상담 후속 관리가 끊긴다",
      promise: "매주 놓친 매출 기회를 복구한다",
      offer: "도입 진단 + 운영 자동화",
      price_label: "월 49만원",
      primary_metric: "유효 상담 수",
      weekly_target: "12",
      weekly_actual: "",
      wedge: "원장 업무 흐름에 직접 연결",
      enemy: "기록만 쌓이는 범용 CRM",
    },
  });

  assert.deepEqual(truth, {
    version: 1,
    icp: "5~20인 학원 원장",
    problem: "상담 후속 관리가 끊긴다",
    promise: "매주 놓친 매출 기회를 복구한다",
    offer: "도입 진단 + 운영 자동화",
    priceLabel: "월 49만원",
    primaryMetric: "유효 상담 수",
    weeklyTarget: 12,
    weeklyActual: null,
    wedge: "원장 업무 흐름에 직접 연결",
    enemy: "기록만 쌓이는 범용 CRM",
    updatedAt: null,
  });
});

test("buildBusinessTruthMeta preserves unrelated campaign metadata", () => {
  const meta = buildBusinessTruthMeta(
    { origin: "hub-campaigns", channels: ["Email"] },
    {
      icp: "개인 지식 사업가",
      problem: "판매 활동이 산발적이다",
      promise: "한 주의 판매 행동을 한 화면에서 끝낸다",
      offer: "운영 OS 구축",
      priceLabel: "300만원",
      primaryMetric: "유료 진단 예약",
      weeklyTarget: 5,
      weeklyActual: 2,
    },
    "2026-09-07T00:00:00.000Z",
  );

  assert.equal(meta.origin, "hub-campaigns");
  assert.deepEqual(meta.channels, ["Email"]);
  assert.deepEqual(meta.business_truth, {
    version: 1,
    icp: "개인 지식 사업가",
    problem: "판매 활동이 산발적이다",
    promise: "한 주의 판매 행동을 한 화면에서 끝낸다",
    offer: "운영 OS 구축",
    price_label: "300만원",
    primary_metric: "유료 진단 예약",
    weekly_target: 5,
    weekly_actual: 2,
    wedge: "",
    enemy: "",
    updated_at: "2026-09-07T00:00:00.000Z",
  });
});

test("weekly scorecard reports target, actual, gap, and progress", () => {
  const scorecard = buildWeeklyScorecard({
    primaryMetric: "유료 진단 예약",
    weeklyTarget: 5,
    weeklyActual: 2,
  });

  assert.deepEqual(scorecard, {
    metric: "유료 진단 예약",
    target: 5,
    actual: 2,
    gap: -3,
    progress: 40,
  });
  assert.equal(buildWeeklyScorecard({ primaryMetric: "예약", weeklyTarget: null }), null);
});

test("business truth completeness tracks the seven founder-critical fields", () => {
  assert.deepEqual(businessTruthCompleteness({}), { completed: 0, total: 7, percent: 0 });
  assert.deepEqual(businessTruthCompleteness({
    icp: "원장",
    problem: "후속 누락",
    promise: "복구",
    offer: "진단",
    priceLabel: "49만원",
    primaryMetric: "예약",
    weeklyTarget: 5,
  }), { completed: 7, total: 7, percent: 100 });
});
