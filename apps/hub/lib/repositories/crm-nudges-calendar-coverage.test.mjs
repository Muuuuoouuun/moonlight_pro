import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

globalThis.__calendarNudgeRead = { ok: true, items: [] };
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("/crm-nudges-source.js")) {
    const stubs = {
      "./revenue-ledger.js": 'export async function getRevenueLedger() { return { source: "supabase", leads: [], deals: [] }; }',
      "./crm-activities.js": "export async function listRecentActivities() { return []; }",
      "../google-calendar.js": "export async function readCombinedGoogleCalendarEvents() { return globalThis.__calendarNudgeRead; }",
    };
    if (stubs[specifier]) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}` };
  }
  return nextResolve(specifier, context);
} });
const { getCrmNudges } = await import("./crm-nudges-source.js");

test("partial calendar coverage never becomes a complete empty nudge set", async () => {
  globalThis.__calendarNudgeRead = { ok: true, items: [], coverage: { complete: false } };
  const partial = await getCrmNudges();
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.failedSources, ["calendar"]);
  globalThis.__calendarNudgeRead = { ok: false, reason: "missing-connection", items: [] };
  assert.equal((await getCrmNudges()).status, "live", "never configured is not a failed source");
});
