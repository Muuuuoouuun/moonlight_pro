import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("contract checks include content variant schema parity", () => {
  const result = spawnSync("node", ["scripts/check-contracts.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /content variant type contract/);
});

test("contract checks include production guard for open webhook mode", () => {
  const result = spawnSync("node", ["scripts/check-contracts.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /webhook open mode production guard/);
});

test("contract checks include project webhook idempotency fallback", () => {
  const result = spawnSync("node", ["scripts/check-contracts.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /project webhook idempotency fallback/);
});
