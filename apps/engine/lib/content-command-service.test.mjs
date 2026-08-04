import assert from "node:assert/strict";
import { test } from "node:test";

let contentService = null;

try {
  contentService = await import("./content-command-service.ts");
} catch {
  // Red phase: Engine has no content command service yet.
}

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const CONTENT_ID = "22222222-2222-2222-2222-222222222222";
const VARIANT_ID = "33333333-3333-3333-3333-333333333333";

function createDraftCommand() {
  return {
    action: "create_draft",
    workspaceId: WORKSPACE_ID,
    itemRecord: {
      id: CONTENT_ID,
      workspace_id: WORKSPACE_ID,
      title: "ClassIn Side first draft",
      status: "draft",
    },
    variantRecord: {
      id: VARIANT_ID,
      workspace_id: WORKSPACE_ID,
      content_id: CONTENT_ID,
      title: "ClassIn Side first draft",
      status: "draft",
    },
  };
}

test("creates the content item and variant as one Engine command", async () => {
  assert.ok(contentService, "content-command-service.ts must exist");
  const inserts = [];
  const result = await contentService.executeContentCommand(
    createDraftCommand(),
    { workspaceId: WORKSPACE_ID },
    {
      insert: async (table, record) => {
        inserts.push({ table, record });
        return { persisted: true, reason: "ok" };
      },
      update: async () => ({ persisted: true, reason: "ok" }),
      remove: async () => ({ persisted: true, reason: "ok" }),
      fetchRows: async () => [],
    },
  );

  assert.deepEqual(inserts.map((entry) => entry.table), ["content_items", "content_variants"]);
  assert.equal(result.status, "saved");
  assert.equal(result.contentId, CONTENT_ID);
  assert.equal(result.variantId, VARIANT_ID);
});

test("rolls back a newly inserted item when variant persistence fails", async () => {
  assert.ok(contentService, "content-command-service.ts must exist");
  const removals = [];
  const result = await contentService.executeContentCommand(
    createDraftCommand(),
    { workspaceId: WORKSPACE_ID },
    {
      insert: async (table) => table === "content_items"
        ? { persisted: true, reason: "ok" }
        : { persisted: false, reason: "http-500", detail: "variant failed" },
      update: async () => ({ persisted: true, reason: "ok" }),
      remove: async (table, filters) => {
        removals.push({ table, filters });
        return { persisted: true, reason: "ok" };
      },
      fetchRows: async () => [],
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.error, "variant-persistence-failed");
  assert.deepEqual(removals, [{
    table: "content_items",
    filters: [
      ["id", `eq.${CONTENT_ID}`],
      ["workspace_id", `eq.${WORKSPACE_ID}`],
    ],
  }]);
});

test("treats an exact item and variant retry as an idempotent duplicate", async () => {
  assert.ok(contentService, "content-command-service.ts must exist");
  const result = await contentService.executeContentCommand(
    createDraftCommand(),
    { workspaceId: WORKSPACE_ID },
    {
      insert: async () => ({ persisted: false, reason: "duplicate" }),
      update: async () => ({ persisted: true, reason: "ok" }),
      remove: async () => ({ persisted: true, reason: "ok" }),
      fetchRows: async (table) => table === "content_items"
        ? [{ id: CONTENT_ID, workspace_id: WORKSPACE_ID }]
        : [{ id: VARIANT_ID, workspace_id: WORKSPACE_ID, content_id: CONTENT_ID }],
    },
  );

  assert.equal(result.status, "duplicate");
  assert.equal(result.contentId, CONTENT_ID);
  assert.equal(result.variantId, VARIANT_ID);
});
