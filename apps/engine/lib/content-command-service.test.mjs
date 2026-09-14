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
        ? [createDraftCommand().itemRecord]
        : [createDraftCommand().variantRecord],
    },
  );

  assert.equal(result.status, "duplicate");
  assert.equal(result.contentId, CONTENT_ID);
  assert.equal(result.variantId, VARIANT_ID);
});

function memoryStore() {
  const command = createDraftCommand();
  const tables = {
    content_items: [{ ...command.itemRecord, source_idea: "Original raw idea", meta: { source_note_id: "44444444-4444-4444-4444-444444444444", org_scope: "personal", custom: "keep" } }],
    content_variants: [{ ...command.variantRecord, variant_type: "threads_post", body: "Original body", meta: { custom: "variant" } }],
    publish_logs: [],
    notes: [],
  };
  const dependencies = {
    fetchRows: async (table, { filters = [] } = {}) => (tables[table] || []).filter((row) => filters.every(([key, value]) => String(row[key]) === value.slice(3))),
    insert: async (table, row) => {
      if (tables[table].some((entry) => entry.id === row.id)) return { persisted: false, reason: "duplicate" };
      tables[table].push(structuredClone(row));
      return { persisted: true, reason: "ok" };
    },
    update: async (table, filters, patch) => {
      const row = (await dependencies.fetchRows(table, { filters }))[0];
      if (!row) return { persisted: false, reason: "not-found" };
      Object.assign(row, structuredClone(patch));
      return { persisted: true, reason: "ok" };
    },
    remove: async () => ({ persisted: true, reason: "ok" }),
  };
  return { tables, dependencies };
}

function publicationCommand() {
  return {
    action: "record_publication", workspaceId: WORKSPACE_ID, contentId: CONTENT_ID,
    logRecord: {
      id: "55555555-5555-5555-5555-555555555555", workspace_id: WORKSPACE_ID,
      variant_id: VARIANT_ID, target_url: "https://www.threads.com/@example/post/123", channel: "Threads",
      status: "published", provider: "manual", published_at: "2026-09-01T09:00:00.000Z",
      payload: { event: "operator_published", provenance: "operator_confirmed", external_verified: false },
    },
  };
}

test("updates a Threads draft without losing raw idea, note provenance, or unrelated meta", async () => {
  const { tables, dependencies } = memoryStore();
  const result = await contentService.executeContentCommand({
    action: "update_draft", workspaceId: WORKSPACE_ID, contentId: CONTENT_ID, variantId: VARIANT_ID,
    itemPatch: { title: "Edited", brand_id: null, meta: { action: "update" } },
    variantPatch: { variant_type: "threads_post", body: "New Threads body", meta: { action: "update" } },
  }, {}, dependencies);
  assert.equal(result.status, "saved");
  assert.equal(tables.content_items[0].source_idea, "Original raw idea");
  assert.equal(tables.content_items[0].meta.custom, "keep");
  assert.equal(tables.content_items[0].meta.org_scope, "personal");
  assert.equal(tables.content_variants[0].meta.custom, "variant");
  assert.equal(tables.content_variants[0].body, "New Threads body");
});

test("draft edits reject a variant belonging to another content item before any write", async () => {
  const { tables, dependencies } = memoryStore();
  tables.content_variants[0].content_id = "66666666-6666-6666-6666-666666666666";
  const result = await contentService.executeContentCommand({ action: "update_draft", workspaceId: WORKSPACE_ID, contentId: CONTENT_ID, variantId: VARIANT_ID, itemPatch: { title: "must not save" }, variantPatch: {} }, {}, dependencies);
  assert.equal(result.status, "error");
  assert.notEqual(tables.content_items[0].title, "must not save");
});

test("manual publication records operator provenance and same-ID retry has one log", async () => {
  const { tables, dependencies } = memoryStore();
  const command = publicationCommand();
  assert.equal((await contentService.executeContentCommand(command, {}, dependencies)).status, "saved");
  assert.equal((await contentService.executeContentCommand(command, {}, dependencies)).status, "duplicate");
  assert.equal(tables.publish_logs.length, 1);
  assert.equal(tables.publish_logs[0].payload.external_verified, false);
  assert.equal(tables.content_items[0].status, "published");
  assert.equal(tables.content_variants[0].status, "published");
  assert.equal(tables.content_variants[0].body, "Original body");
});

test("manual publication partial failure is explicit and retry completes status writes", async () => {
  const { tables, dependencies } = memoryStore();
  const update = dependencies.update;
  dependencies.update = async () => ({ persisted: false, reason: "network" });
  const result = await contentService.executeContentCommand(publicationCommand(), {}, dependencies);
  assert.equal(result.status, "error");
  assert.equal(result.partial, true);
  assert.equal(tables.publish_logs.length, 1);
  dependencies.update = update;
  assert.equal((await contentService.executeContentCommand(publicationCommand(), {}, dependencies)).status, "duplicate");
  assert.equal(tables.content_items[0].status, "published");
});

test("manual publication rejects unsafe URL, future date, and forged provenance", async () => {
  for (const change of [{ target_url: "javascript:alert(1)" }, { published_at: "2999-01-01" }, { provider: "threads-api" }]) {
    const { tables, dependencies } = memoryStore();
    const command = publicationCommand();
    Object.assign(command.logRecord, change);
    assert.equal((await contentService.executeContentCommand(command, {}, dependencies)).status, "invalid-input");
    assert.equal(tables.publish_logs.length, 0);
  }
});

test("a publication retry with a changed URL cannot reuse an existing log ID", async () => {
  const { dependencies } = memoryStore();
  const command = publicationCommand();
  await contentService.executeContentCommand(command, {}, dependencies);
  command.logRecord.target_url = "https://example.com/different";
  assert.equal((await contentService.executeContentCommand(command, {}, dependencies)).error, "publication-log-id-conflict");
});

test("memo idea capture rejects missing notes and scope mismatch", async () => {
  const { tables, dependencies } = memoryStore();
  const command = createDraftCommand();
  command.itemRecord.meta = { source_note_id: "44444444-4444-4444-4444-444444444444", org_scope: "company" };
  tables.content_items = [];
  assert.equal((await contentService.executeContentCommand(command, {}, dependencies)).status, "invalid-input");
  tables.notes = [{ id: command.itemRecord.meta.source_note_id, workspace_id: WORKSPACE_ID, meta: { org_scope: "personal" } }];
  assert.equal((await contentService.executeContentCommand(command, {}, dependencies)).status, "invalid-input");
  assert.equal(tables.content_items.length, 0);
});

test("same-ID creation with different content never creates a new variant or overwrites the item", async () => {
  const { tables, dependencies } = memoryStore();
  const command = createDraftCommand();
  command.itemRecord.title = "Another idea";
  command.variantRecord.id = "77777777-7777-7777-7777-777777777777";
  const result = await contentService.executeContentCommand(command, {}, dependencies);
  assert.equal(result.error, "content-id-conflict");
  assert.equal(tables.content_variants.length, 1);
  assert.notEqual(tables.content_items[0].title, "Another idea");
});

test("editing a captured draft cannot replace its original idea or transfer its source scope", async () => {
  for (const patch of [{ source_idea: "replacement" }, { meta: { org_scope: "company" } }, { meta: { source_note_id: null } }]) {
    const { tables, dependencies } = memoryStore();
    const result = await contentService.executeContentCommand({ action: "update_draft", workspaceId: WORKSPACE_ID, contentId: CONTENT_ID, variantId: VARIANT_ID, itemPatch: patch, variantPatch: { body: "should not save" } }, {}, dependencies);
    assert.equal(result.error, "original-source-is-immutable");
    assert.equal(tables.content_variants[0].body, "Original body");
  }
});

test("missing Threads database contract fails clearly and rolls back the new idea", async () => {
  const command = createDraftCommand();
  command.variantRecord.variant_type = "threads_post";
  const removals = [];
  const result = await contentService.executeContentCommand(command, {}, {
    insert: async (table) => table === "content_items" ? { persisted: true, reason: "ok" } : { persisted: false, reason: "http-400", detail: "23514 content_variants_variant_type_check" },
    remove: async (table) => { removals.push(table); return { persisted: true, reason: "ok" }; },
    fetchRows: async () => [], update: async () => ({ persisted: true, reason: "ok" }),
  });
  assert.equal(result.error, "threads-contract-migration-required");
  assert.equal(result.migration, "20260914_0001_content_threads_post.sql");
  assert.deepEqual(removals, ["content_items"]);
});
