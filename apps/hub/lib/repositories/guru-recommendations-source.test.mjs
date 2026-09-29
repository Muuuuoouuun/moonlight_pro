// 원장 매퍼 → 기록 기반 추천 왕복. 순수 엔진 테스트는 이미 투영된 모양을 넣기 때문에, 실제
// DB 행(meta.stage_detail·meta.next_action_at·meta.last_reaction·status)이 엔진이 읽는 필드로
// 도착하는지는 여기서만 확인된다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { mapDeal, mapLead } from "./revenue-ledger.js";
import { buildGuruRecommendations } from "../sales-os/guru-recommendations.js";

const NOW = Date.parse("2026-09-25T03:00:00Z"); // KST todayKey 2026-09-25
const day = (offset) => new Date(NOW + offset * 86400000).toISOString();

test("ledger rows carry the stage, own date, reaction and cutover facts the engine reads", () => {
  const quoteDeal = mapDeal({
    id: "deal-1", title: "한빛 도입", company_id: "co-1", stage: "proposal", owner_id: "me",
    meta: { stage_detail: "quote", next_action_at: "2026-09-20" },
  }, new Map());
  const wonDeal = mapDeal({ id: "deal-2", title: "푸른 계약", company_id: "co-3", stage: "won", owner_id: "me" }, new Map());
  const freshLead = mapLead({
    id: "lead-1", name: "새봄학원", company_id: "co-2", status: "new",
    created_at: day(-7), updated_at: day(-7), meta: {},
  }, new Map(), new Map());
  const positiveLead = mapLead({
    id: "lead-2", name: "해오름학원", company_id: "co-4", status: "nurturing",
    created_at: day(-40), last_touch_at: day(-3), meta: { last_reaction: "positive" },
  }, new Map(), new Map());

  const recs = buildGuruRecommendations({
    leads: [freshLead, positiveLead],
    deals: [quoteDeal, wonDeal],
    activities: [{ id: "a1", kind: "call", reaction: "positive", companyId: "co-4", leadId: "lead-2", occurredAt: day(-3) }],
    activitiesSince: day(-45),
    now: NOW,
  });
  const byId = Object.fromEntries(recs.map((rec) => [rec.subject.id, rec]));

  assert.equal(byId["deal-1"].ruleId, "quote-date-passed");
  assert.deepEqual(byId["deal-1"].facts, ["견적 단계", "내가 정한 9/20에서 5일 지남", "그 뒤 연락 기록 없음"]);
  assert.equal(byId["deal-2"].ruleId, "after-contract");
  assert.equal(byId["lead-1"].ruleId, "new-uncontacted");
  assert.equal(byId["lead-2"].ruleId, "positive-no-date");
  // 목록 표면은 지금 할 것만 받는다.
  const act = buildGuruRecommendations({ leads: [freshLead], deals: [wonDeal], activities: [], now: NOW, severity: "act" });
  assert.deepEqual(act, []);
});
