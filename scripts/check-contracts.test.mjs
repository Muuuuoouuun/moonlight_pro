import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("contract checks keep evidence-free project progress nullable", () => {
  const result = spawnSync("node", ["scripts/check-contracts.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /project progress evidence contract/);
});

test("nullable project progress stays documented for existing databases", () => {
  const supabaseReadme = readFileSync("supabase/README.md", "utf8");

  assert.match(supabaseReadme, /0019~0023/);
  assert.match(supabaseReadme, /`0020`\(nullable project progress\)/);
});
