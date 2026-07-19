import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("legacy direct --apply is disabled before credentials or network access", () => {
  const result = spawnSync(process.execPath, ["scripts/sync-rev-ledger.mjs", "--apply"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /직접 DB 쓰기는 비활성화/);
  assert.doesNotMatch(result.stderr, /GOOGLE_SERVICE_ACCOUNT_EMAIL/);
});
