import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function withWorkspaceFilter(filters = []) { return [["workspace_id", "eq.${WORKSPACE_ID}"], ...filters]; }
export async function fetchSupabaseRows(table, options = {}) {
  const state = globalThis.__rhythmHistoryState;
  state.calls.push({ table, options });
  if (table === "workspaces") return state.workspaces;
  if (table !== "routine_checks") return [];
  const filters = options.filters || [];
  if (filters.some(([k, v]) => k === "status" && v === "eq.pending")) return state.definitions;
  if (state.done === null) return null;
  const offset = Number((filters.find(([k]) => k === "offset") || [0, "0"])[1]);
  return state.done.slice(offset, offset + options.limit);
}
`;
const serverWriteStub = `
export function resolveDefaultWorkspaceId() { return globalThis.__rhythmHistoryState.configured ? "${WORKSPACE_ID}" : null; }
export function resolveSupabaseConfig() { return globalThis.__rhythmHistoryState.configured ? { url: "x", apiKey: "y" } : null; }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/server-read") return { url: `data:text/javascript,${encodeURIComponent(serverReadStub)}`, shortCircuit: true };
    if (specifier === "@/lib/server-write") return { url: `data:text/javascript,${encodeURIComponent(serverWriteStub)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

globalThis.__rhythmHistoryState = {};
const { getRhythmHistory } = await import("./rhythm-history-ledger.js?rhythm-history-test");

const NOW = new Date("2026-09-23T03:00:00.000Z"); // 12:00 KST

function doneRow(ritualKey, localDate, extra = {}) {
  return {
    project_id: null,
    check_type: "morning",
    status: "done",
    checked_at: `${localDate}T00:00:00.000Z`,
    meta: { ritual_key: ritualKey, name: ritualKey === "pray" ? "기도" : ritualKey, local_date: localDate },
    ...extra,
  };
}

beforeEach(() => {
  globalThis.__rhythmHistoryState = {
    configured: true,
    workspaces: [{ id: WORKSPACE_ID, timezone: "Asia/Seoul" }],
    definitions: [{
      project_id: null, check_type: "morning", status: "pending", created_at: "2026-09-01T00:00:00.000Z",
      meta: { ritual_key: "pray", name: "기도", category: "spirit", target_per_week: 7 },
    }],
    done: [],
    calls: [],
  };
});

test("without Supabase the history is an honest preview", async () => {
  globalThis.__rhythmHistoryState.configured = false;
  const result = await getRhythmHistory({ range: "month", now: NOW });
  assert.equal(result.source, "preview");
  assert.equal(result.history, null);
});

test("month history groups done rows by ritual and keeps the seed row's category and start date", async () => {
  const state = globalThis.__rhythmHistoryState;
  state.done = [doneRow("pray", "2026-09-21"), doneRow("pray", "2026-09-22"), doneRow("pray", "2026-08-31")];
  const result = await getRhythmHistory({ range: "month", now: NOW });
  assert.equal(result.state, "live");
  const pray = result.history.rituals[0];
  assert.equal(pray.name, "기도");
  assert.equal(pray.category, "spirit");
  assert.equal(pray.activeFrom, "2026-09-01");
  assert.deepEqual(pray.doneKeys, ["2026-09-21", "2026-09-22"], "rows outside the window are dropped by local date");
  assert.equal(pray.expected, 23);

  const doneCall = state.calls.find((c) => c.table === "routine_checks" && c.options.filters.some(([k, v]) => k === "status" && v === "eq.done"));
  assert.deepEqual(
    doneCall.options.filters.filter(([k]) => k === "checked_at"),
    [["checked_at", "gte.2026-08-31T00:00:00.000Z"], ["checked_at", "lt.2026-10-02T00:00:00.000Z"]],
  );
});

test("done rows are read page by page and a capped read is partial, not complete", async () => {
  const state = globalThis.__rhythmHistoryState;
  state.done = Array.from({ length: 2500 }, () => doneRow("pray", "2026-09-10"));
  const full = await getRhythmHistory({ range: "year", now: NOW });
  assert.equal(full.state, "live");
  assert.equal(state.calls.filter((c) => c.options.filters?.some(([k]) => k === "offset")).length, 3);

  state.done = Array.from({ length: 8000 }, () => doneRow("pray", "2026-09-10"));
  const capped = await getRhythmHistory({ range: "year", now: NOW });
  assert.equal(capped.state, "partial");
  assert.deepEqual(capped.truncatedSources, ["routine_checks"]);
});

test("a failed read is an error envelope, never an empty history", async () => {
  globalThis.__rhythmHistoryState.done = null;
  const result = await getRhythmHistory({ range: "week", now: NOW });
  assert.equal(result.source, "error");
  assert.equal(result.history, null);

  globalThis.__rhythmHistoryState.done = [];
  globalThis.__rhythmHistoryState.workspaces = null;
  assert.equal((await getRhythmHistory({ range: "week", now: NOW })).source, "error");
});

test("project scope filters both the seed rows and the done rows", async () => {
  const projectId = "22222222-2222-4222-8222-222222222222";
  await getRhythmHistory({ range: "week", projectId, now: NOW });
  const routineCalls = globalThis.__rhythmHistoryState.calls.filter((c) => c.table === "routine_checks");
  assert.ok(routineCalls.length >= 2);
  for (const call of routineCalls) {
    assert.ok(call.options.filters.some(([k, v]) => k === "project_id" && v === `eq.${projectId}`));
  }
});
