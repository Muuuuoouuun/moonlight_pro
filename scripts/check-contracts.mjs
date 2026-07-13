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

function parseQuotedValues(valueList) {
  return Array.from(valueList.matchAll(/'([^']+)'|"([^"]+)"/g), (match) => match[1] || match[2]);
}

function valuesEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function extractJsStringArray(text, constName) {
  const match = text.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[([^\\]]+)\\]`));
  return match ? parseQuotedValues(match[1]) : [];
}

function extractSchemaVariantTypes(text) {
  const match = text.match(/variant_type\s+text\s+not\s+null\s+check\s*\(\s*variant_type\s+in\s*\(([^)]+)\)\s*\)/);
  return match ? parseQuotedValues(match[1]) : [];
}

function extractContentVariantConstraintTypes(text) {
  const match = text.match(/add\s+constraint\s+content_variants_variant_type_check\s+check\s*\(\s*variant_type\s+in\s*\(([\s\S]*?)\)\s*\)/i);
  return match ? parseQuotedValues(match[1]) : [];
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

const activeMasterDocs = [
  "docs/master-plan.md",
  "docs/master-roadmap.md",
  "docs/master-directive.md",
];
const retiredPremisePatterns = [
  "3개 프로젝트",
  "Landing (Public)",
  "클래스인 그린",
  "#084734",
  "코드 패치 자동화",
];

for (const doc of activeMasterDocs) {
  const text = readText(doc);
  const stale = retiredPremisePatterns.filter((pattern) => text.includes(pattern));

  assert(
    stale.length === 0,
    `${doc} retired premises`,
    stale.length ? `stale premise text: ${stale.join(", ")}` : "active strategy is current",
  );
}

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
  existsSync(path.join(root, "supabase/setup/00_live_schema.sql")) &&
    existsSync(path.join(root, "supabase/setup/01_storage.sql")) &&
    existsSync(path.join(root, "supabase/setup/02_rls_policies.sql")) &&
    existsSync(path.join(root, "supabase/setup/03_seed_dev_workspace.sql")) &&
    existsSync(path.join(root, "supabase/setup/99_smoke_checks.sql")),
  "Supabase live setup pack",
  "schema, storage, RLS, seed, and smoke SQL present",
);
assert(
  readText("supabase/setup/00_live_schema.sql").includes("'blog_insight'") &&
    readText("supabase/setup/00_live_schema.sql").includes("'x_thread'") &&
    readText("supabase/setup/00_live_schema.sql").includes("'reels_script'") &&
    readText("supabase/migrations/20260602_0004_live_setup_contracts.sql").includes(
      "content_variants_variant_type_check",
    ),
  "Supabase content variant contract",
  "setup and migration allow current Hub variant types",
);
assert(
  readText("supabase/setup/00_live_schema.sql").includes("workspace_id uuid not null references public.workspaces") &&
    readText("supabase/migrations/20260602_0004_live_setup_contracts.sql").includes(
      "alter table if exists public.milestones",
    ),
  "Supabase milestone workspace contract",
  "RLS target tables have workspace scope",
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
const sharedWebhookText = readText("apps/engine/lib/shared-webhook.ts");
const telegramWebhookText = readText("apps/engine/app/api/webhook/telegram/route.ts");
assert(
  [sharedWebhookText, telegramWebhookText].every((text) =>
    text.includes("isLocalOpenWebhookModeAllowed") &&
    text.includes('process.env.NODE_ENV !== "production"') &&
    text.includes('process.env.VERCEL_ENV !== "production"'),
  ),
  "webhook open mode production guard",
  "shared and Telegram open modes are local-only",
);
const projectWebhookText = readText("apps/engine/lib/project-webhook.ts");
const projectWebhookRouteText = readText("apps/engine/app/api/webhook/project/route.ts");
const sharedProjectWebhookRouteText = readText("apps/engine/app/api/webhook/project/[provider]/route.ts");
assert(
  projectWebhookText.includes("createHash") &&
    projectWebhookText.includes("stableStringify") &&
    projectWebhookText.includes("idempotencyKey") &&
    projectWebhookText.includes("derivePayloadEventId") &&
    projectWebhookRouteText.includes("idempotency-key") &&
    sharedProjectWebhookRouteText.includes("idempotency-key") &&
    sharedWebhookText.includes("idempotencyKey"),
  "project webhook idempotency fallback",
  "provider event ID falls back to Idempotency-Key header or stable payload digest",
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

const contentVariantContract = readText("apps/hub/lib/content-variant-contract.js");
const schema = readText("supabase/schema.sql");
const contentVariantMigrationPath =
  "supabase/migrations/20260602_0003_content_variant_type_contract.sql";
const contentVariantMigration = existsSync(path.join(root, contentVariantMigrationPath))
  ? readText(contentVariantMigrationPath)
  : "";
const liveSetupSchema = existsSync(path.join(root, "supabase/setup/00_live_schema.sql"))
  ? readText("supabase/setup/00_live_schema.sql")
  : "";
const liveSetupMigration = existsSync(
  path.join(root, "supabase/migrations/20260602_0004_live_setup_contracts.sql"),
)
  ? readText("supabase/migrations/20260602_0004_live_setup_contracts.sql")
  : "";
const repositoryVariantTypes = extractJsStringArray(
  contentVariantContract,
  "CANONICAL_CONTENT_VARIANT_TYPES",
);
const schemaVariantTypes = extractSchemaVariantTypes(schema);
const contentVariantContractSources = [
  ["schema", schemaVariantTypes],
  ["migration", extractContentVariantConstraintTypes(contentVariantMigration)],
  ["live-setup", extractContentVariantConstraintTypes(liveSetupSchema)],
  ["live-migration", extractContentVariantConstraintTypes(liveSetupMigration)],
];
const variantContractMismatch = contentVariantContractSources.filter(
  ([, values]) => !valuesEqual(repositoryVariantTypes, values),
);
const supabaseFirstSeed = readText("supabase/seed.supabase_first.sql");
const legacySeedVariantTypes = Array.from(
  new Set(
    Array.from(
      supabaseFirstSeed.matchAll(/'(blog|social_post|landing_copy)'/g),
      (match) => match[1],
    ),
  ),
);

assert(
  repositoryVariantTypes.length > 0 &&
    valuesEqual(repositoryVariantTypes, schemaVariantTypes) &&
    variantContractMismatch.length === 0,
  "content variant type contract",
  valuesEqual(repositoryVariantTypes, schemaVariantTypes) && variantContractMismatch.length === 0
    ? `${repositoryVariantTypes.length} variant types match repository, schema, and migration`
    : `repository=${repositoryVariantTypes.join(",") || "none"} mismatches=${variantContractMismatch
        .map(([label, values]) => `${label}:${values.join(",") || "none"}`)
      .join(" ")}`,
);
assert(
  legacySeedVariantTypes.length === 0,
  "content variant seed contract",
  legacySeedVariantTypes.length
    ? `legacy variant types: ${legacySeedVariantTypes.join(",")}`
    : "seed uses canonical variant types",
);

if (failures.length) {
  console.log(`\n[FAIL] ${failures.length} contract checks failed`);
  process.exit(1);
}

console.log("\n[PASS] Contract checks passed");
