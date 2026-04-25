#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function readJson(filepath) {
  return JSON.parse(readFileSync(path.join(root, filepath), "utf8"));
}

function readText(filepath) {
  return readFileSync(path.join(root, filepath), "utf8");
}

function pass(label, detail = "ok") {
  console.log(`[PASS] ${label}: ${detail}`);
}

function fail(label, detail) {
  console.log(`[FAIL] ${label}: ${detail}`);
  failures.push(label);
}

function assert(condition, label, detail) {
  if (condition) {
    pass(label, detail);
  } else {
    fail(label, detail);
  }
}

function envFileHasKeys(filepath, keys) {
  const text = readText(filepath);
  const missing = keys.filter((key) => !new RegExp(`^${key}=`, "m").test(text));

  assert(
    missing.length === 0,
    `${filepath} env keys`,
    missing.length ? `missing ${missing.join(", ")}` : `${keys.length} required keys present`,
  );
}

const pkg = readJson("package.json");
const lock = readText("package-lock.json");

assert(
  Array.isArray(pkg.workspaces) &&
    pkg.workspaces.includes("apps/hub") &&
    pkg.workspaces.includes("apps/engine") &&
    !pkg.workspaces.includes("apps/*"),
  "workspace scope",
  "Hub and Engine are explicit active apps",
);
assert(!existsSync(path.join(root, "apps/web")), "apps/web detached", "directory absent");
assert(!lock.includes("apps/web") && !lock.includes("@com-moon/web"), "lockfile web references", "clean");
assert(Boolean(pkg.scripts?.["check:contracts"]), "check:contracts script", "registered");

envFileHasKeys(".env.example", [
  "COM_MOON_ENGINE_URL",
  "COM_MOON_HUB_URL",
  "COM_MOON_SHARED_WEBHOOK_SECRET",
  "COM_MOON_HUB_WRITE_SECRET",
  "COM_MOON_OAUTH_STATE_SECRET",
  "COM_MOON_ALLOW_OPEN_WEBHOOKS",
  "TELEGRAM_WEBHOOK_SECRET",
]);
envFileHasKeys("apps/engine/.env.example", [
  "COM_MOON_SHARED_WEBHOOK_SECRET",
  "COM_MOON_ALLOW_OPEN_WEBHOOKS",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "N8N_WEBHOOK_URL",
]);
envFileHasKeys("apps/hub/.env.example", [
  "COM_MOON_ENGINE_URL",
  "COM_MOON_HUB_URL",
  "COM_MOON_SHARED_WEBHOOK_SECRET",
  "COM_MOON_HUB_WRITE_SECRET",
  "COM_MOON_OAUTH_STATE_SECRET",
]);

assert(
  existsSync(path.join(root, "apps/hub/app/api/health/route.js")),
  "Hub health endpoint",
  "present",
);
assert(
  existsSync(path.join(root, "apps/engine/app/api/health/route.ts")),
  "Engine health endpoint",
  "present",
);
assert(
  existsSync(path.join(root, "supabase/migrations/20260425_0002_webhook_event_idempotency.sql")) &&
    readText("supabase/migrations/20260425_0002_webhook_event_idempotency.sql").includes(
      "create unique index",
    ) &&
    readText("supabase/migrations/20260425_0002_webhook_event_idempotency.sql").includes(
      "provider_event_id is not null",
    ),
  "webhook idempotency migration",
  "partial unique index present",
);
assert(
  readText("apps/engine/lib/shared-webhook.ts").includes("COM_MOON_ALLOW_OPEN_WEBHOOKS"),
  "shared webhook open mode",
  "explicit local flag required",
);
assert(
  readText("apps/engine/app/api/webhook/telegram/route.ts").includes("COM_MOON_ALLOW_OPEN_WEBHOOKS"),
  "telegram webhook open mode",
  "explicit local flag required",
);
assert(
  readText("apps/hub/lib/server-write.js").includes("process.env.COM_MOON_ENGINE_URL") &&
    !readText("apps/hub/lib/server-write.js").includes("payload.engineUrl") &&
    !readText("apps/hub/lib/server-write.js").includes("payload.sharedWebhookSecret"),
  "Hub webhook target",
  "uses server env only",
);
assert(
  existsSync(path.join(root, "apps/hub/lib/hub-write-guard.js")),
  "Hub write guard",
  "present",
);

if (failures.length) {
  console.log(`\n[FAIL] ${failures.length} contract checks failed`);
  process.exit(1);
}

console.log("\n[PASS] Contract checks passed");
