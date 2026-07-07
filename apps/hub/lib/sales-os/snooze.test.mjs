import assert from "node:assert/strict";
import { test } from "node:test";

import { isSnoozed } from "./snooze.js";

const NOW = new Date("2026-07-07T00:00:00Z").getTime();

test("future snooze_until suppresses the row", () => {
  assert.equal(isSnoozed({ snooze_until: "2026-07-10" }, NOW), true);
});

test("past snooze_until does not suppress", () => {
  assert.equal(isSnoozed({ snooze_until: "2026-07-01" }, NOW), false);
});

test("missing / null / invalid snooze_until does not suppress", () => {
  assert.equal(isSnoozed({}, NOW), false);
  assert.equal(isSnoozed(null, NOW), false);
  assert.equal(isSnoozed({ snooze_until: "" }, NOW), false);
  assert.equal(isSnoozed({ snooze_until: "garbage" }, NOW), false);
});

test("defaults now to Date.now() when omitted", () => {
  // A far-future date is snoozed regardless of the real clock.
  assert.equal(isSnoozed({ snooze_until: "2999-01-01" }), true);
});
