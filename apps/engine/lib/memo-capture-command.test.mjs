import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeMemoCapture,
  executeMemoCapture,
} from "./memo-capture-command.ts";
const workspace = "11111111-1111-1111-1111-111111111111";
const input = {
  id: "22222222-2222-2222-2222-222222222222",
  body: "  첫 생각\r\n\n두 번째 문장  ",
  labels: ["아이디어"],
  scope: "personal",
};
const store = () => {
  const rows = new Map();
  return {
    rows,
    read: async (_table, opts) => {
      const id = opts.filters.find(([k]) => k === "id")[1].slice(3);
      const ws = opts.filters.find(([k]) => k === "workspace_id")[1].slice(3);
      const row = rows.get(id);
      return row?.workspace_id === ws ? [row] : [];
    },
    insert: async (_table, row) => {
      if (rows.has(row.id)) return { persisted: false, reason: "duplicate" };
      rows.set(row.id, structuredClone(row));
      return { persisted: true };
    },
  };
};
test("preserves original whitespace and labels with explicit provenance, no model interpretation", () => {
  const result = normalizeMemoCapture(input, workspace);
  assert.equal(result.row.body, input.body);
  assert.equal(result.row.meta.memo_capture.originalBody, input.body);
  assert.equal(result.row.meta.memo_capture.labelSource, "operator");
  assert.equal(result.row.meta.memo_capture.analysis, null);
  assert.equal(result.row.project_id, undefined);
});
test("validates long notes, file source, label bounds, and workspace before writes", () => {
  for (const patch of [
    { body: "" },
    { body: "a".repeat(100001) },
    { body: "a\0b" },
    { labels: ["x".repeat(41)] },
    { labels: Array(13).fill("x") },
    { scope: "all" },
    { source: { type: "file", name: "../secret.md", originalBody: "x" } },
    {
      source: {
        type: "file",
        name: "file.md",
        originalBody: "x",
        modifiedAt: "bad",
      },
    },
  ])
    assert.equal(
      normalizeMemoCapture({ ...input, ...patch }, workspace).ok,
      false,
    );
  assert.equal(normalizeMemoCapture(input, "").ok, false);
  assert.equal(
    normalizeMemoCapture({ ...input, body: "가".repeat(100000) }, workspace).ok,
    true,
  );
});
test("saved -> read -> retry returns one note; different payload conflicts without overwrite", async () => {
  const deps = store();
  assert.equal(
    (await executeMemoCapture(input, workspace, deps)).status,
    "saved",
  );
  assert.equal(
    (await executeMemoCapture(input, workspace, deps)).status,
    "duplicate",
  );
  assert.equal(
    (await executeMemoCapture({ ...input, body: "changed" }, workspace, deps))
      .status,
    "conflict",
  );
  assert.equal(deps.rows.size, 1);
  assert.equal([...deps.rows.values()][0].body, input.body);
});
test("file reimports have stable identity; revisions and separate scopes are separate captures", async () => {
  const deps = store();
  const file = {
    ...input,
    source: { type: "file", name: "생각.md", originalBody: input.body },
  };
  const first = await executeMemoCapture(file, workspace, deps);
  const second = await executeMemoCapture(
    { ...file, id: crypto.randomUUID() },
    workspace,
    deps,
  );
  assert.equal(second.status, "duplicate");
  assert.equal(second.id, first.id);
  assert.notEqual(
    normalizeMemoCapture({ ...file, scope: "company" }, workspace).row.id,
    first.id,
  );
  assert.notEqual(
    normalizeMemoCapture({ ...file, body: "edited" }, workspace).row.id,
    first.id,
  );
});
test("concurrent retries and lost acknowledgements require an exact persisted row", async () => {
  const deps = store();
  const pair = await Promise.all([
    executeMemoCapture(input, workspace, deps),
    executeMemoCapture(input, workspace, deps),
  ]);
  assert.deepEqual(pair.map((r) => r.status).sort(), ["duplicate", "saved"]);
  assert.equal(deps.rows.size, 1);
  assert.equal(
    (
      await executeMemoCapture(input, workspace, {
        read: async () => null,
        insert: () => {
          throw new Error("must not write");
        },
      })
    ).status,
    "error",
  );
  assert.equal(
    (
      await executeMemoCapture(input, workspace, {
        read: async () => [],
        insert: async () => ({ persisted: false }),
      })
    ).status,
    "error",
  );
});
