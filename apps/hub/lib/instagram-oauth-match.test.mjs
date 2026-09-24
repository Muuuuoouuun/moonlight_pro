import assert from "node:assert/strict";
import { test } from "node:test";

import { checkInstagramApiProfileMatch } from "./instagram-api.js";

test("Instagram rejects a different authorized username and records failure", async () => {
  const records = [];
  const result = await checkInstagramApiProfileMatch({
    workspaceId: "workspace-1",
    brandHandle: "ml_bridgemaker",
    profile: { id: "ig-1", username: "politic_officer" },
    recordSync: async (record) => { records.push(record); },
  });

  assert.deepEqual(result, { profileMatch: false, rejected: true });
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "failure");
  assert.equal(records[0].payload.result, "account-mismatch");
  assert.equal(records[0].payload.username, "politic_officer");
});

test("Instagram matching username proceeds without a failure record", async () => {
  let recordCount = 0;
  const result = await checkInstagramApiProfileMatch({
    workspaceId: "workspace-1",
    brandHandle: "@ml_bridgemaker",
    profile: { id: "ig-1", username: "ml_bridgemaker" },
    recordSync: async () => { recordCount += 1; },
  });

  assert.deepEqual(result, { profileMatch: true, rejected: false });
  assert.equal(recordCount, 0);
});
