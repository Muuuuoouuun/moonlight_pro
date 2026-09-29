import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeSocialAccountStatus } from "./social-account-status.js";

test("status lists accounts without tokens and selects an explicit Meta handle", () => {
  const rows = [
    { id: "row-b", status: "connected", account_key: "id-b", config: { username: "politic_officer", brandHandle: "politic_officer", accessToken: "secret-b" } },
    { id: "row-a", status: "connected", account_key: "id-a", config: { username: "ml_bridgemaker", brandHandle: "ml_bridgemaker", accessToken: "secret-a" } },
  ];
  const result = summarizeSocialAccountStatus({
    rows, configured: true, available: true,
    selector: (row) => row.config.brandHandle === "ml_bridgemaker",
    summarize: (row) => ({ id: row.id, profileHandle: `@${row.config.username}` }),
  });
  assert.equal(result.status, "connected");
  assert.equal(result.connection.id, "row-a");
  assert.equal(result.connections.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /secret-a|secret-b/);
});

test("a connected sibling does not make a missing selected account connected", () => {
  const result = summarizeSocialAccountStatus({
    rows: [{ id: "row-b", status: "connected", config: { username: "politic_officer" } }],
    configured: true, available: true,
    selector: (row) => row.config.username === "ml_bridgemaker",
    summarize: (row) => ({ id: row.id }),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.connection, null);
  assert.equal(result.connections.length, 1);
});

test("storage failure stays visible even if credentials are configured", () => {
  const result = summarizeSocialAccountStatus({
    rows: [], configured: true, available: false,
    summarize: (row) => row,
  });
  assert.equal(result.status, "storage-error");
});
