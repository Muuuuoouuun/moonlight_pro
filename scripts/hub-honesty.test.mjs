import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

const sampleExports = [
  "BRIEF_SIGNALS",
  "TODAY_BLOCKS",
  "METRICS",
  "KANBAN_COLUMNS",
  "DECISIONS",
  "RITUALS",
  "LEADS",
  "DEAL_STAGES",
  "DEALS",
  "CONTENT_QUEUE",
  "CAMPAIGNS",
  "AUTOMATIONS",
  "RUN_LOG",
  "CHAT_THREAD",
  "COUNCIL",
  "ORDERS",
  "EVOLUTION_LOG",
  "BRANDS",
  "BRAND_PROJECTS",
  "BRAND_TODOS",
];

test("hub navigation data does not also ship sample operational records", async () => {
  const hubData = await source("apps/hub/components/hub/hub-data.js");

  for (const exportName of sampleExports) {
    assert.doesNotMatch(
      hubData,
      new RegExp(`export\\s+const\\s+${exportName}\\b`),
      `${exportName} must not be bundled as a fallback record set`,
    );
  }
});

test("daily brief does not manufacture a schedule or completion rate", async () => {
  const [page, route] = await Promise.all([
    source("apps/hub/components/hub/pages/daily-brief.jsx"),
    source("apps/hub/app/api/hub/daily-brief/route.js"),
  ]);

  assert.doesNotMatch(page, /TODAY_BLOCKS|BRIEF_SIGNALS|METRICS/);
  assert.doesNotMatch(page, /4\/5 rituals done|width:\s*"80%"/);
  assert.doesNotMatch(route, /function\s+buildBlocks\b|blocks:\s*buildBlocks\(/);
});

test("VR Office is not an active hub surface", async () => {
  const files = await Promise.all([
    source("apps/hub/components/hub/hub-app.jsx"),
    source("apps/hub/components/hub/hub-data.js"),
    source("apps/hub/components/hub/hub-topbar.jsx"),
    source("apps/hub/components/hub/pages/agents.jsx"),
    source("apps/hub/app/globals.css"),
  ]);
  const runtime = files.join("\n");

  assert.doesNotMatch(runtime, /AgentsOffice|VR Office|OFFICE_AGENTS|OFFICE_FEED|\.agent-office-/);
});
