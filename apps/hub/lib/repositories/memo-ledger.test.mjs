import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test, beforeEach } from "node:test";
const read = `export const eqFilter=x=>'eq.'+x;export const inFilter=x=>'in.('+x.join(',')+')';export const withWorkspaceFilter=(x=[])=>[['workspace_id','eq.w'],...x];export async function fetchSupabaseRows(table,options){globalThis.__memoTest.calls.push({table,options});return globalThis.__memoTest.read(table,options);}`;
const write = `export const resolveDefaultWorkspaceId=()=>globalThis.__memoTest.config?'w':null;export const resolveSupabaseConfig=()=>globalThis.__memoTest.config;`;
registerHooks({
  resolve(spec, context, next) {
    const code =
      spec === "@/lib/server-read"
        ? read
        : spec === "@/lib/server-write"
          ? write
          : null;
    return code
      ? {
          url: "data:text/javascript," + encodeURIComponent(code),
          shortCircuit: true,
        }
      : next(spec, context);
  },
});
const { getMemoLedger } = await import("./memo-ledger.js");
beforeEach(() => {
  globalThis.__memoTest = { config: true, calls: [], read: () => [] };
});
test("memo reads preserve preview without touching data sources", async () => {
  globalThis.__memoTest.config = false;
  assert.equal((await getMemoLedger()).status, "preview");
  assert.equal(globalThis.__memoTest.calls.length, 0);
});
test("missing relation migration disables unlinked claims while preserving originals", async () => {
  globalThis.__memoTest.read = (table) =>
    table === "task_memo_links"
      ? null
      : table === "notes"
        ? [{ id: "n", title: "원문", body: "keep" }]
        : [];
  const result = await getMemoLedger();
  assert.equal(result.status, "partial");
  assert.equal(result.linksComplete, false);
  assert.equal(result.memos[0].body, "keep");
  assert.deepEqual(result.failedSources, ["task_memo_links"]);
});
test("task context reads exact linked originals outside newest source window", async () => {
  globalThis.__memoTest.read = (table, options) =>
    table === "task_memo_links"
      ? [{ id: "l", task_id: "t", note_id: "old" }]
      : table === "notes"
        ? [{ id: "old", title: "old memo" }]
        : [];
  const result = await getMemoLedger({ taskId: "t" });
  assert.equal(result.memos[0].id, "old");
  assert.ok(
    globalThis.__memoTest.calls
      .find((c) => c.table === "notes")
      .options.filters.some(([k, v]) => k === "id" && v === "in.(old)"),
  );
  assert.ok(
    globalThis.__memoTest.calls.every((c) =>
      c.options.filters.some(([k, v]) => k === "workspace_id" && v === "eq.w"),
    ),
  );
});
test("truncated links stay partial and cannot prove absence", async () => {
  globalThis.__memoTest.read = (table) =>
    table === "task_memo_links"
      ? Array.from({ length: 101 }, (_, i) => ({
          id: String(i),
          task_id: "t",
          note_id: "n",
        }))
      : [];
  const result = await getMemoLedger({ taskId: "t" });
  assert.equal(result.links.length, 100);
  assert.equal(result.linksComplete, false);
  assert.ok(result.partialSources.includes("task_memo_links"));
});
test("deep links fetch older notes with an exact workspace-scoped read", async () => {
  globalThis.__memoTest.read = (table, options) =>
    table === "notes"
      ? options.filters.some(
          ([key, value]) => key === "id" && value === "eq.old",
        )
        ? [
            {
              id: "old",
              title: "forgotten",
              meta: {
                memo_capture: { labels: ["idea"], originalBody: "original" },
              },
            },
          ]
        : [{ id: "new", title: "recent" }]
      : [];
  const result = await getMemoLedger({ noteId: "old" });
  assert.equal(result.memos.length, 2);
  assert.equal(
    result.memos.find((n) => n.id === "old").originalBody,
    "original",
  );
  assert.ok(
    globalThis.__memoTest.calls.every((c) =>
      c.options.filters.some(([k, v]) => k === "workspace_id" && v === "eq.w"),
    ),
  );
});
