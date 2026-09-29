import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LEGEND_IDS as LIBRARY_IDS, LEGEND_MICRO_CARDS } from "@com-moon/guru-guidance";
import {
  LEGEND_CARDS,
  LEGEND_IDS,
  RECOMMENDED_TRIADS,
  getLegendCard,
  getTriad,
  getAllTriads,
} from "./council-legends.js";
import { requestCouncilAdvice } from "./council-client.js";
import { GURU_LENS_CHIPS, GURU_LENS_MAP, isGuruLens } from "./persona-client.js";
import { isValidAdvisorInput } from "../../lib/advisor-input.js";

test("council-legends: contains all 16 official legends with complete fields", () => {
  const expectedIds = [
    "socrates", "einstein", "lincoln", "theodore-roosevelt", "franklin-roosevelt",
    "jobs", "bezos", "buffett", "chouinard",
    "feynman", "deming", "drucker", "ostrom", "epictetus",
    "carnegie", "hill",
  ];

  assert.equal(Object.keys(LEGEND_CARDS).length, 16);
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
  assert.equal(triads.length, 6);

  for (const triad of triads) {
    assert.ok(triad.id && triad.label && triad.desc);
    assert.equal(triad.legendIds.length, 3);
    for (const legendId of triad.legendIds) {
      assert.ok(getLegendCard(legendId), `Triad ${triad.id} refers to unknown legend ${legendId}`);
    }
    assert.equal(getTriad(triad.id), triad);
  }
});

test("council-legends: cards and ids are the shared library, the same text the Engine prompt uses", () => {
  assert.equal(LEGEND_CARDS, LEGEND_MICRO_CARDS);
  assert.equal(LEGEND_IDS, LIBRARY_IDS);
  assert.deepEqual(Object.keys(LEGEND_CARDS), [...LEGEND_IDS]);
  for (const id of LEGEND_IDS) {
    assert.ok(LEGEND_CARDS[id].pivotCondition && LEGEND_CARDS[id].boundaryCondition && LEGEND_CARDS[id].sourceCitation, id);
  }
  assert.equal(LEGEND_CARDS.chouinard.category, "management");
  assert.doesNotMatch(LEGEND_CARDS.feynman.piercingQuestion, /초등학생|전문 용어/);
  assert.doesNotMatch(LEGEND_CARDS.bezos.piercingQuestion, /70%|10년/);
  for (const id of ["constructor", "__proto__", "unknown"]) assert.equal(getLegendCard(id), null, id);
});

test("council-legends: header counts match the catalogue and Triad notes follow the shared cards", () => {
  const header = readFileSync(new URL("./council-legends.js", import.meta.url), "utf8").split(/\r?\n/).slice(0, 5).join("\n");
  assert.match(header, new RegExp(`the ${LEGEND_IDS.length} Legend micro-cards`));
  assert.match(header, new RegExp(`${RECOMMENDED_TRIADS.length} curated Triads`));
  assert.match(header, /packages\/guru-guidance\/legend-library\.ts/);
  const notes = RECOMMENDED_TRIADS.map((triad) => triad.desc).join(" ");
  assert.doesNotMatch(notes, /역발상|1원칙/);
});

test("advisor input accepts exactly the shared library's Legend ids", () => {
  assert.equal(isValidAdvisorInput({ legendIds: [...LEGEND_IDS] }), true);
  assert.equal(isValidAdvisorInput({ directives: { values: { legendIds: ["jobs", "bezos", "chouinard"] } } }), true);
  for (const legendIds of ["jobs", ["jobs", "unknown"], ["jobs", "jobs"], ["constructor"], ["__proto__"], [null]]) {
    assert.equal(isValidAdvisorInput({ legendIds }), false, JSON.stringify(legendIds));
    assert.equal(isValidAdvisorInput({ values: { legendIds } }), false, JSON.stringify(legendIds));
  }
});

test("persona-chat lenses are Guru-only because Legend lives only as the weekly card (§2.1 ⑧)", () => {
  assert.deepEqual(Object.keys(GURU_LENS_MAP), ["voss", "ogilvy", "godin", "rackham", "goldratt"]);
  for (const id of Object.keys(GURU_LENS_MAP)) assert.ok(!LIBRARY_IDS.includes(id), id);
  assert.deepEqual([...GURU_LENS_CHIPS], ["voss", "ogilvy"]);
  for (const id of GURU_LENS_CHIPS) assert.ok(isGuruLens(id), id);
  for (const id of ["jobs", "carnegie", "hill", "constructor", "__proto__", ""]) assert.equal(isGuruLens(id), false, id);
});

test("the Hub lens menu and the Engine lens list are the same keys, so no choice is silently dropped", () => {
  const route = readFileSync(new URL("../../../engine/app/api/ai/persona-chat/route.ts", import.meta.url), "utf8").replace(/\r\n?/g, "\n");
  const start = route.indexOf("const GURU_LENSES");
  assert.ok(start >= 0);
  const block = route.slice(start, route.indexOf("\n};", start));
  const engineKeys = [...block.matchAll(/^ {2}([a-z]+): \{$/gm)].map(([, id]) => id);
  assert.deepEqual(engineKeys, Object.keys(GURU_LENS_MAP));
  for (const surface of ["./pages/agents.jsx", "./floating-mentor-widget.jsx"]) {
    const source = readFileSync(new URL(surface, import.meta.url), "utf8");
    assert.doesNotMatch(source, /LEGEND_LENS_MAP|'jobs', 'bezos'|"jobs", "bezos"/, surface);
    assert.match(source, /GURU_LENS_CHIPS\.map/, surface);
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

test("council-client: an explicit brand question forwards its source card and never asks for a work order", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return Response.json({ status: "generated", text: "자료 기반 조언" });
  };
  try {
    const result = await requestCouncilAdvice({ mode: "open-question", guidanceId: "content-hook", draft: "첫 장과 본문이 맞나요?" });
    assert.equal(result.state, "done");
    assert.equal(capturedBody.guidanceId, "content-hook");
    assert.equal(capturedBody.createWorkOrder, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
