import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTION_MOMENTUM,
  CONTACT_KINDS,
  activityToOutcomeAction,
  outcomeBoost,
  priorityFor,
} from "./followup-scoring.js";

// 0a: crm_activities(kind·reaction) → outreach 어휘. 큐 boost·momentum이 이 어휘를 읽는다.
test("activityToOutcomeAction folds kind·reaction into the outreach vocabulary", () => {
  const cases = [
    [{ kind: "call", reaction: "positive" }, "replied"],
    [{ kind: "call", reaction: "neutral" }, "replied"],
    [{ kind: "call", reaction: "concern" }, "replied"],
    [{ kind: "call", reaction: "rejected" }, "lost"],
    [{ kind: "call", reaction: "no_response" }, "no_response"],
    [{ kind: "kakao", reaction: null }, "sent"],
    [{ kind: "email", reaction: "" }, "sent"],
    [{ kind: "meeting", reaction: "neutral" }, "meeting"],
    [{ kind: "demo", reaction: "positive" }, "meeting"],
    [{ kind: "visit", reaction: null }, "meeting"],
    [{ kind: "info_session", reaction: null }, "meeting"],
    [{ kind: "meeting", reaction: "rejected" }, "lost"],
    [{ kind: "quote", reaction: "neutral" }, "proposal"],
    [{ kind: "QUOTE", reaction: "POSITIVE" }, "proposal"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(activityToOutcomeAction(input), expected, JSON.stringify(input));
  }
});

test("non-contact kinds produce no action and therefore no boost", () => {
  for (const kind of ["note", "update", "deal", "ai", "", null, "unknown"]) {
    assert.equal(activityToOutcomeAction({ kind, reaction: "positive" }), null, String(kind));
    assert.ok(!CONTACT_KINDS.has(String(kind)));
  }
  assert.equal(outcomeBoost({ action: null, ageDays: 0 }), 0);
});

test("every produced action has a momentum entry", () => {
  const produced = new Set(["replied", "lost", "no_response", "sent", "meeting", "proposal"]);
  for (const action of produced) assert.ok(action in ACTION_MOMENTUM, action);
});

test("priorityFor/outcomeBoost regression — staleness primary, decayed momentum additive", () => {
  assert.equal(priorityFor({ sinceDays: 5, threshold: 3, valueTerm: 0, boost: 0 }), 50);
  assert.equal(priorityFor({ sinceDays: null, threshold: 3 }), 30);
  assert.equal(outcomeBoost({ action: "meeting", ageDays: 0 }), 30);
  // 감쇠가 0에 닿으면 -0이 나온다(JSON에서는 0) — 부호는 의미가 없으니 크기만 본다.
  assert.equal(Math.abs(outcomeBoost({ action: "no_response", ageDays: 21 })), 0);
  assert.equal(outcomeBoost({ action: "replied", ageDays: null }), 9);
});
