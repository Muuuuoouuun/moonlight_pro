import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260717_0019_routine_check_idempotency.sql",
  import.meta.url,
);
const setupUrl = new URL("../../../supabase/setup/00_live_schema.sql", import.meta.url);
const schemaUrl = new URL("../../../supabase/schema.sql", import.meta.url);

test("routine check idempotency is canonical in migration, live setup, and base schema", async () => {
  const [migration, setup, schema] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(setupUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);

  assert.match(
    migration,
    /alter table(?: if exists)?(?: public\.)?routine_checks[\s\S]*add column if not exists idempotency_key text/i,
  );
  assert.match(
    migration,
    /create unique index(?: if not exists)? routine_checks_workspace_idempotency_key_uidx[\s\S]*on(?: public\.)?routine_checks\s*\(\s*workspace_id\s*,\s*idempotency_key\s*\)[\s\S]*where idempotency_key is not null/i,
  );

  for (const source of [setup, schema]) {
    assert.match(source, /idempotency_key\s+text/i);
    assert.match(
      source,
      /routine_checks_workspace_idempotency_key_uidx[\s\S]*\(\s*workspace_id\s*,\s*idempotency_key\s*\)[\s\S]*where idempotency_key is not null/i,
    );
  }
});
