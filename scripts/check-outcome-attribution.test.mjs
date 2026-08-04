import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OUTCOME_ACTIONS,
  buildOutcomeFromWorkOrder,
  isValidOutcomeAction,
  isWorkOrderAttributed,
} from "../apps/hub/lib/sales-os/outcome-attribution.js";

test("isValidOutcomeAction accepts the 7 canonical actions, case-insensitively", () => {
  for (const a of OUTCOME_ACTIONS) assert.equal(isValidOutcomeAction(a), true);
  assert.equal(isValidOutcomeAction("MEETING"), true);
  assert.equal(isValidOutcomeAction("Won"), true);
});

test("isValidOutcomeAction rejects unknown actions (no silent coercion to 'sent')", () => {
  // The funnel-corruption guard: an unknown action must be rejected, never treated as 'sent'.
  assert.equal(isValidOutcomeAction("frobnicate"), false);
  assert.equal(isValidOutcomeAction(""), false);
  assert.equal(isValidOutcomeAction(null), false);
  assert.equal(isValidOutcomeAction(undefined), false);
  assert.equal(isValidOutcomeAction(42), false);
});

test("buildOutcomeFromWorkOrder copies pipeline refs and passes action through unchanged", () => {
  const order = {
    id: "wo-1",
    leadId: "lead-1",
    dealId: null,
    companyId: "co-1",
    channel: "phone",
    assetId: "asset-9",
    body: { play: "district-first-touch" },
    outcomeId: null,
    runId: "run-1",
  };
  const built = buildOutcomeFromWorkOrder(order, { action: "meeting", note: "만남 확정" });
  assert.deepEqual(built, {
    leadId: "lead-1",
    dealId: null,
    companyId: "co-1",
    channel: "phone",
    assetId: "asset-9",
    play: "district-first-touch",
    action: "meeting",
    note: "만남 확정",
    occurredAt: null,
  });
});

test("buildOutcomeFromWorkOrder tolerates missing refs and body", () => {
  const built = buildOutcomeFromWorkOrder({ id: "wo-2" }, { action: "sent" });
  assert.equal(built.leadId, null);
  assert.equal(built.companyId, null);
  assert.equal(built.play, null);
  assert.equal(built.action, "sent");
  assert.equal(built.note, null);
});

test("buildOutcomeFromWorkOrder returns null for a missing order", () => {
  assert.equal(buildOutcomeFromWorkOrder(null, { action: "sent" }), null);
});

test("isWorkOrderAttributed is the idempotency gate (true once outcome_id is set)", () => {
  assert.equal(isWorkOrderAttributed({ outcomeId: "out-1" }), true);
  assert.equal(isWorkOrderAttributed({ outcomeId: null }), false);
  assert.equal(isWorkOrderAttributed({}), false);
  assert.equal(isWorkOrderAttributed(null), false);
});
