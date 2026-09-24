import assert from "node:assert/strict";
import { test } from "node:test";

import { isExpectedMetaThreadsProfile } from "./meta-threads.js";

test("Threads reconnect requires the same immutable account ID and handle", () => {
  assert.equal(isExpectedMetaThreadsProfile(
    { id: "account-1", username: "politic_officer" }, "politic_officer", "account-1",
  ), true);
  assert.equal(isExpectedMetaThreadsProfile(
    { id: "account-2", username: "politic_officer" }, "politic_officer", "account-1",
  ), false);
  assert.equal(isExpectedMetaThreadsProfile(
    { id: "account-1", username: "other_account" }, "politic_officer", "account-1",
  ), false);
});
