#!/usr/bin/env node

// Unit checks for the pure follow-up scoring (outcome -> triage learning loop).
// No framework, no live IO — mirrors the repo's other check:* scripts.

import process from "node:process";

import {
  ACTION_MOMENTUM,
  DORMANT_RESURFACE_DAYS,
  momentumScore,
  outcomeBoost,
  priorityFor,
  shouldResurfaceDormant,
} from "../apps/hub/lib/sales-os/followup-scoring.js";

const failures = [];

function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`[PASS] ${label}`);
  } else {
    console.log(`[FAIL] ${label}: expected ${e}, got ${a}`);
    failures.push(label);
  }
}

function ok(label, cond) {
  eq(label, Boolean(cond), true);
}

// --- outcomeBoost (recency-decayed momentum) ---
eq("no action -> 0", outcomeBoost({}), 0);
eq("fresh meeting -> full", outcomeBoost({ action: "meeting", ageDays: 0 }), ACTION_MOMENTUM.meeting);
ok("meeting decays at 7d (~2/3)", outcomeBoost({ action: "meeting", ageDays: 7 }) < ACTION_MOMENTUM.meeting && outcomeBoost({ action: "meeting", ageDays: 7 }) > 15);
eq("meeting beyond 21d -> 0", outcomeBoost({ action: "meeting", ageDays: 30 }), 0);
ok("lost is strongly negative", outcomeBoost({ action: "lost", ageDays: 0 }) <= -40);
eq("unknown age -> half weight", outcomeBoost({ action: "replied", ageDays: null }), Math.round(ACTION_MOMENTUM.replied * 0.5 * 10) / 10);
eq("won is terminal -> 0", outcomeBoost({ action: "won", ageDays: 0 }), 0);

// --- priorityFor ---
eq("priority basic", priorityFor({ sinceDays: 5, threshold: 3, valueTerm: 2, boost: 0 }), 52);
eq("priority null since uses threshold", priorityFor({ sinceDays: null, threshold: 3, valueTerm: 0, boost: 0 }), 30);
ok("positive boost raises priority", priorityFor({ sinceDays: 4, threshold: 3, valueTerm: 0, boost: 20 }) > priorityFor({ sinceDays: 4, threshold: 3, valueTerm: 0, boost: 0 }));
ok("negative boost lowers priority", priorityFor({ sinceDays: 4, threshold: 3, valueTerm: 0, boost: -30 }) < priorityFor({ sinceDays: 4, threshold: 3, valueTerm: 0, boost: 0 }));

// --- momentumScore (0-100 lead score) ---
eq("neutral baseline (no history)", momentumScore({}), 40);
ok("recent meeting raises score", momentumScore({ lastAction: "meeting", ageDays: 0 }) > 60);
ok("repeated no_response lowers score", momentumScore({ lastAction: "no_response", ageDays: 1, noResponses: 3 }) < 25);
ok("meetings compound", momentumScore({ lastAction: "replied", ageDays: 2, replies: 2, meetings: 2 }) > momentumScore({ lastAction: "replied", ageDays: 2 }));
ok("clamped to 0..100", momentumScore({ lastAction: "meeting", ageDays: 0, meetings: 20 }) <= 100 && momentumScore({ lastAction: "lost", ageDays: 0, noResponses: 20 }) >= 0);

// --- shouldResurfaceDormant (기약없음 30일 재확인 gate) ---
eq("null since dormant never resurfaces", shouldResurfaceDormant(null), false);
eq("just under threshold stays hidden", shouldResurfaceDormant(DORMANT_RESURFACE_DAYS - 1), false);
eq("at threshold resurfaces", shouldResurfaceDormant(DORMANT_RESURFACE_DAYS), true);
eq("past threshold resurfaces", shouldResurfaceDormant(DORMANT_RESURFACE_DAYS + 10), true);

console.log("");
if (failures.length) {
  console.log(`[FAIL] followup-scoring: ${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("[PASS] followup-scoring: all checks passed");
}
