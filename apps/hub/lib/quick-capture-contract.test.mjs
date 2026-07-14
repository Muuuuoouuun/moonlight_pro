import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

let migration = "";

try {
  migration = await readFile(
    new URL("../../../supabase/migrations/20260715_0014_quick_capture_receipts.sql", import.meta.url),
    "utf8",
  );
} catch {
  // Red phase: the cross-destination receipt migration does not exist yet.
}

test("quick capture migration claims one workspace receipt before either destination", () => {
  assert.match(migration, /create table if not exists public\.mutation_receipts/i);
  assert.match(migration, /unique\s*\(workspace_id,\s*idempotency_key\)/i);
  assert.match(migration, /create or replace function public\.capture_quick_input_v1/i);
  assert.match(migration, /insert into public\.tasks/i);
  assert.match(migration, /insert into public\.work_orders/i);
  assert.match(migration, /destination_type/i);
  assert.match(migration, /request_hash/i);
});
