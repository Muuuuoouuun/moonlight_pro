#!/usr/bin/env node

// Unit checks for the pure 360 context-schema (normalization + focus assembly).
// No framework, no live IO — mirrors check-sheets-normalize / check-persona-registry.

import process from "node:process";

import {
  BRAND_FALLBACK,
  OWNER_ID,
  buildFocusOperatingContext,
  cadenceStatusString,
  normalizeOutcome,
  outcomesForEntity,
  selectBrand,
} from "../apps/hub/lib/sales-os/context-schema.js";

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

// --- normalizeOutcome (camelCase -> logical snake_case; occurredAt -> at) ---
const no = normalizeOutcome({
  id: "o1", leadId: "L1", dealId: "D1", companyId: "C1", play: "first-touch",
  channel: "kakao", action: "replied", note: "관심", occurredAt: "2026-06-18T01:00:00Z",
});
eq("normalizeOutcome lead_id", no.lead_id, "L1");
eq("normalizeOutcome at<-occurredAt", no.at, "2026-06-18T01:00:00Z");
eq("normalizeOutcome asset_id null", no.asset_id, null);
eq("normalizeOutcome keeps deal_id extra", no.deal_id, "D1");
eq("normalizeOutcome non-object -> null", normalizeOutcome(null), null);

// --- outcomesForEntity ---
const pool = [
  normalizeOutcome({ dealId: "D1", action: "sent", occurredAt: "2026-06-17T00:00:00Z" }),
  normalizeOutcome({ dealId: "D2", action: "sent", occurredAt: "2026-06-18T00:00:00Z" }),
  normalizeOutcome({ leadId: "L9", action: "replied", occurredAt: "2026-06-18T05:00:00Z" }),
];
eq("outcomesForEntity by dealId", outcomesForEntity(pool, { dealId: "D1" }).length, 1);
eq("outcomesForEntity by leadId", outcomesForEntity(pool, { leadId: "L9" }).length, 1);
eq("outcomesForEntity no match", outcomesForEntity(pool, { dealId: "ZZ" }).length, 0);

// --- cadenceStatusString ---
eq("cadence behind", cadenceStatusString({ published: 2, goal: 5, behind: true }), "2/5 발행 · behind");
eq("cadence on-track", cadenceStatusString({ published: 5, goal: 5, behind: false }), "5/5 발행 · on-track");
eq("cadence null -> null", cadenceStatusString(null), null);

// --- selectBrand ---
eq("selectBrand fallback when no classmoon", selectBrand([{ key: "gore", rules: ["x"] }]), { ...BRAND_FALLBACK });
eq("selectBrand from classmoon row", selectBrand([{ key: "classmoon", rules: ["R1"], forbidden: ["F1"] }]),
  { voice: "classmoon", rules: ["R1"], forbidden: ["F1"] });
eq("selectBrand classmoon empty rules -> fallback rules",
  selectBrand([{ key: "classmoon", rules: [], forbidden: [] }]).rules, BRAND_FALLBACK.rules);

// --- buildFocusOperatingContext ---
const focus = buildFocusOperatingContext({
  deal: { id: "D1", name: "강남학원 도입", stage: "prop", value: 3000000 },
  account: { name: "강남학원" },
  entityOutcomes: [
    normalizeOutcome({ dealId: "D1", action: "sent", occurredAt: "2026-06-15T00:00:00Z" }),
    normalizeOutcome({ dealId: "D1", action: "meeting", occurredAt: "2026-06-18T00:00:00Z" }),
  ],
  brand: { voice: "classmoon", rules: ["R"], forbidden: ["F"] },
});
eq("focus item_type deal", focus.item_type, "deal");
eq("focus found", focus.found, true);
eq("focus entity.company from account", focus.entity.company, "강남학원");
eq("focus entity.amount", focus.entity.amount, 3000000);
eq("focus entity.owner_id", focus.entity.owner_id, OWNER_ID);
eq("focus last_touch picks latest", focus.ledger.last_touch, "2026-06-18T00:00:00Z");
eq("focus recent_outcomes count", focus.ledger.recent_outcomes.length, 2);
eq("focus content empty for deal", focus.content.idea_queue_top.length, 0);
ok("focus missing notes eeoCRM + leads + contacts", focus.missing.length === 3 && focus.missing.some((m) => m.source === "eeoCRM"));

// --- buildFocusOperatingContext with crmFacts (Sales OS v1.4 gap fill) ---
const focusWithCrm = buildFocusOperatingContext({
  deal: { id: "D1", name: "강남학원 도입", stage: "prop", value: 3000000 },
  account: { name: "강남학원" },
  entityOutcomes: [],
  brand: { voice: "classmoon", rules: ["R"], forbidden: ["F"] },
  crmFacts: { stage: "contract", amount: 3000000, paymentStatus: "pending", lastContactAt: null, syncedAt: "2026-07-10T00:00:00Z" },
});
eq("focus crm_facts passthrough", focusWithCrm.crm_facts, { stage: "contract", amount: 3000000, paymentStatus: "pending", lastContactAt: null, syncedAt: "2026-07-10T00:00:00Z" });
ok("focus with crmFacts drops eeoCRM from missing", !focusWithCrm.missing.some((m) => m.source === "eeoCRM"));
eq("focus with crmFacts keeps leads + contacts missing", focusWithCrm.missing.length, 2);

const noDeal = buildFocusOperatingContext({ deal: null });
eq("focus no deal -> found false", noDeal.found, false);
eq("focus no deal -> missing deals", noDeal.missing[0].source, "deals");

console.log("");
if (failures.length) {
  console.log(`[FAIL] context-assembler: ${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("[PASS] context-assembler: all checks passed");
}
