import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260717_0019_routine_check_idempotency.sql",
  import.meta.url,
);
const setupUrl = new URL("../../../supabase/setup/00_live_schema.sql", import.meta.url);
const schemaUrl = new URL("../../../supabase/schema.sql", import.meta.url);
const applyPendingUrl = new URL("../../../supabase/apply-pending.sql", import.meta.url);
const supabaseReadmeUrl = new URL("../../../supabase/README.md", import.meta.url);
const migrationScriptUrl = new URL("../../../scripts/apply-migrations.mjs", import.meta.url);

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

test("routine check idempotency migration is included in both supported delivery paths", async () => {
  const [applyPending, supabaseReadme, migrationScript] = await Promise.all([
    readFile(applyPendingUrl, "utf8"),
    readFile(supabaseReadmeUrl, "utf8"),
    readFile(migrationScriptUrl, "utf8"),
  ]);

  assert.match(applyPending, /20260717_0019_routine_check_idempotency\.sql/);
  assert.match(applyPending, /적용 대기 마이그레이션 묶음 \(0003 → 0011 \+ 0019~0020, 시점순\)/);
  assert.match(supabaseReadme, /`apply-pending\.sql`: \*\*편의 번들\*\* — 0003→0011 \+ 0019/);
  assert.match(supabaseReadme, /Sales OS 마이그레이션 적용 \(0003→0011 \+ 0019\)/);
  assert.match(
    applyPending,
    /add column if not exists idempotency_key text[\s\S]*create unique index if not exists routine_checks_workspace_idempotency_key_uidx/i,
  );
  assert.match(migrationScript, /const DEFAULT_MIGRATIONS = \[[\s\S]*20260717_0019_routine_check_idempotency\.sql[\s\S]*\]/);
  assert.match(migrationScript, /before deploying the Hub routine check route/i);
});
