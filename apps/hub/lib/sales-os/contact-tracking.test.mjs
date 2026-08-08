import assert from "node:assert/strict";
import test from "node:test";

import {
  contactTrackingStartedAtFromWorkspace,
  isContactOutcomeEligible,
  isContactTrackingEligible,
  normalizeContactTrackingStartedAt,
} from "./contact-tracking.js";

const CUTOVER = "2026-08-06T04:30:00.000Z";

test("normalizes a valid contact tracking cutover and rejects invalid values", () => {
  assert.equal(normalizeContactTrackingStartedAt("2026-08-06T13:30:00+09:00"), CUTOVER);
  assert.equal(normalizeContactTrackingStartedAt("not-a-date"), null);
  assert.equal(normalizeContactTrackingStartedAt(null), null);
});

test("reads contact tracking cutover from workspace meta", () => {
  assert.equal(
    contactTrackingStartedAtFromWorkspace({ meta: { contact_tracking_started_at: CUTOVER } }),
    CUTOVER,
  );
  assert.equal(contactTrackingStartedAtFromWorkspace({ meta: {} }), null);
});

test("only records registered at or after the cutover are eligible", () => {
  assert.equal(isContactTrackingEligible({ created_at: "2026-08-06T04:29:59.999Z" }, CUTOVER), false);
  assert.equal(isContactTrackingEligible({ created_at: CUTOVER }, CUTOVER), true);
  assert.equal(isContactTrackingEligible({ created_at: "2026-08-06T04:30:00.001Z" }, CUTOVER), true);
  assert.equal(isContactTrackingEligible({ created_at: null }, CUTOVER), false);
  assert.equal(isContactTrackingEligible({ created_at: null }, null), true);
});

test("contact outcomes count only when attached to a tracked lead or deal", () => {
  const scope = {
    leadIds: new Set(["lead-new"]),
    dealIds: new Set(["deal-new"]),
  };
  assert.equal(isContactOutcomeEligible({ lead_id: "lead-new" }, scope), true);
  assert.equal(isContactOutcomeEligible({ deal_id: "deal-new" }, scope), true);
  assert.equal(isContactOutcomeEligible({ lead_id: "lead-old" }, scope), false);
  assert.equal(isContactOutcomeEligible({ company_id: "company-only" }, scope), false);
  assert.equal(isContactOutcomeEligible({ lead_id: "lead-old" }, null), true);
});
