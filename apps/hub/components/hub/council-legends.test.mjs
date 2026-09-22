import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LEGEND_CARDS,
  RECOMMENDED_TRIADS,
  getLegendCard,
  getTriad,
  getAllTriads,
} from "./council-legends.js";
import { requestCouncilAdvice } from "./council-client.js";

test("council-legends: contains all 14 official legends with complete fields", () => {
  const expectedIds = [
    "socrates", "einstein", "lincoln", "theodore-roosevelt", "franklin-roosevelt",
    "jobs", "bezos", "buffett", "chouinard",
    "feynman", "deming", "drucker", "ostrom", "epictetus",
  ];

  assert.equal(Object.keys(LEGEND_CARDS).length, 14);
  for (const id of expectedIds) {
    const card = LEGEND_CARDS[id];
    assert.ok(card, `Card ${id} must exist`);
    assert.equal(card.id, id);
    assert.ok(card.name && card.name.trim().length > 0);
    assert.ok(card.nameKo && card.nameKo.trim().length > 0);
    assert.ok(["philosophy", "science", "management", "governance", "resilience"].includes(card.category));
    assert.ok(card.coreValue && card.coreValue.trim().length > 0);
    assert.ok(card.acceptableCost && card.acceptableCost.trim().length > 0);
    assert.ok(card.piercingQuestion && card.piercingQuestion.trim().length > 0);
  }
});

test("council-legends: recommended triads have 3 valid legend IDs each", () => {
  const triads = getAllTriads();
  assert.equal(triads.length, 5);

  for (const triad of triads) {
    assert.ok(triad.id && triad.label && triad.desc);
    assert.equal(triad.legendIds.length, 3);
    for (const legendId of triad.legendIds) {
      assert.ok(getLegendCard(legendId), `Triad ${triad.id} refers to unknown legend ${legendId}`);
    }
    assert.equal(getTriad(triad.id), triad);
  }
});

test("council-client: requestCouncilAdvice forwards legendIds, directives, and unpacks council data", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;

  globalThis.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return Response.json({
      status: "generated",
      mode: "sparring",
      ref: "project-1",
      text: "자문 결과 텍스트",
      council: {
        lenses: [{ lens: "Jobs", verdict: "본질 집중", cost: "타협 거부" }],
        dissent: "출시 일정 지연 우려",
        conditionalVerdict: "핵심 1개 기능 검증 후 진행",
        nextAction: "프로토타입 제작",
      },
      workOrder: { persisted: true, id: "wo-1" },
      runId: "run-100",
    });
  };

  try {
    const res = await requestCouncilAdvice({
      mode: "sparring",
      ref: "project-1",
      legendIds: ["jobs", "bezos", "chouinard"],
      directives: { values: { operatorEnergy: 4 } },
      createWorkOrder: true,
    });

    assert.equal(res.state, "done");
    assert.equal(res.text, "자문 결과 텍스트");
    assert.equal(res.mode, "sparring");
    assert.equal(res.ref, "project-1");
    assert.ok(res.council);
    assert.equal(res.council.dissent, "출시 일정 지연 우려");
    assert.equal(res.workOrder.id, "wo-1");
    assert.equal(res.runId, "run-100");

    assert.deepEqual(capturedBody.legendIds, ["jobs", "bezos", "chouinard"]);
    assert.deepEqual(capturedBody.directives, { values: { operatorEnergy: 4 } });
    assert.equal(capturedBody.createWorkOrder, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
