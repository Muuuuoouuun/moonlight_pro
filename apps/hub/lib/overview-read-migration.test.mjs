import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20260902_0024_overview_read_indexes.sql", root);
const setupUrl = new URL("supabase/setup/00_live_schema.sql", root);
const schemaUrl = new URL("supabase/schema.sql", root);
const applyPendingUrl = new URL("supabase/apply-pending.sql", root);

const INDEXES = [
  "idx_tasks_workspace_updated",
  "idx_decisions_workspace_decided",
  "idx_publish_logs_workspace_created",
  "idx_automation_runs_workspace_created",
  "idx_routine_checks_workspace_checked",
];

test("Overview read indexes remain in the schema, setup, migration and historical bundle", async () => {
  const [migration, setup, schema, applyPending] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(setupUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
    readFile(applyPendingUrl, "utf8"),
  ]);

  for (const index of INDEXES) {
    for (const source of [migration, setup, schema, applyPending]) {
      assert.match(source, new RegExp(`create index(?: if not exists)? ${index}`));
    }
  }
});
