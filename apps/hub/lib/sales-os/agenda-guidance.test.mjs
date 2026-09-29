import assert from "node:assert/strict";
import { test } from "node:test";

import { GURU_CARDS } from "@com-moon/guru-guidance";
import { AGENDA_GUIDANCE_RULES, matchAgendaGuidance } from "./agenda-guidance.js";

test("every agenda rule points at an existing card in its own lane's domain", () => {
  const byId = new Map(GURU_CARDS.map((card) => [card.id, card]));
  for (const rule of AGENDA_GUIDANCE_RULES) {
    const card = byId.get(rule.cardId);
    assert.ok(card, `${rule.id} → ${rule.cardId}`);
    if (rule.lane === "classin") assert.equal(card.domain, "sales", rule.id);
    else assert.ok(["marketing", "content"].includes(card.domain), rule.id);
  }
});

test("the operator's own words are the stated reason", () => {
  const [rec] = matchAgendaGuidance("한빛학원 견적 보낸 뒤 원장님 내부 검토가 2주째 멈춤", { scope: "classin" });
  assert.equal(rec.cardId, "sales-meddic");
  assert.equal(rec.basis, "agenda");
  assert.equal(rec.matched, "견적");
  assert.match(rec.facts[0], /^안건 문구 “.*견적.*”$/);
  assert.equal(rec.reason, "안건에 ‘견적’이(가) 있어 연결");
});

test("at most two distinct techniques, in rule order", () => {
  const recs = matchAgendaGuidance("견적 뒤 우려를 들었고 계약 후 온보딩도 걱정", { scope: "classin" });
  assert.deepEqual(recs.map((rec) => rec.cardId), ["sales-meddic", "sales-carnegie-listen"]);
});

test("the lane decides which playbook can answer", () => {
  assert.deepEqual(matchAgendaGuidance("인스타 카피 첫 문장이 약함", { scope: "classin" }), []);
  assert.equal(matchAgendaGuidance("인스타 카피 첫 문장이 약함", { scope: "personal" })[0].cardId, "content-three-tests");
  assert.equal(matchAgendaGuidance("인스타 카피 첫 문장이 약함", { scope: "all" })[0].cardId, "content-three-tests");
});

test("generic wording connects nothing", () => {
  assert.deepEqual(matchAgendaGuidance("이번 주 문제와 어려움 정리", { scope: "all" }), []);
  assert.deepEqual(matchAgendaGuidance("", { scope: "all" }), []);
  assert.deepEqual(matchAgendaGuidance(null), []);
});
