import assert from "node:assert/strict";
import { test } from "node:test";

import { assertPersistedSocialConnection } from "./social-oauth-persistence.js";

test("OAuth connection reports success only after a durable row with an ID", () => {
  const saved = {
    connectionId: "connection-1",
    persistence: { persisted: true, reason: "ok" },
  };

  assert.equal(assertPersistedSocialConnection(saved), saved);

  for (const failure of [
    null,
    { connectionId: "connection-1", persistence: { persisted: false, reason: "permission-denied" } },
    { connectionId: null, persistence: { persisted: true, reason: "ok" } },
    { connectionId: "", persistence: { persisted: true, reason: "ok" } },
  ]) {
    assert.throws(() => assertPersistedSocialConnection(failure), /connection-not-persisted/);
  }
});
