import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLeadEnrichmentView } from "../sales-os/lead-view.js";

test("keeps lead score separate from monetary value and exposes enrichment", () => {
  const lead = resolveLeadEnrichmentView({
      id: "lead-1",
      name: "메티우스 수학",
      status: "won",
      score: 83,
      next_action: "활용 상태와 갱신·업셀 기회 정리",
      source: "eeocrm",
      meta: {
        owner_scope: "junhyuk",
        enrichment: {
          pipeline: { lane: "customer_success" },
          tags: ["owner:junhyuk", "region:서울", "subject:math"],
        },
      },
  });

  assert.equal(lead.score, 83);
  assert.equal(lead.valueAmount, null);
  assert.equal(lead.owner, "Me");
  assert.equal(lead.priorityLane, "customer_success");
  assert.equal(lead.nextAction, "활용 상태와 갱신·업셀 기회 정리");
  assert.equal(lead.region, "서울");
  assert.deepEqual(lead.enrichmentTags, ["owner:junhyuk", "region:서울", "subject:math"]);
});

test("uses explicit monetary meta value without deriving money from score", () => {
  const lead = resolveLeadEnrichmentView({
      id: "lead-2",
      name: "예시",
      status: "new",
      score: 50,
      meta: { value: 2500000 },
  });

  assert.equal(lead.valueAmount, 2500000);
  assert.equal(lead.score, 50);
});
