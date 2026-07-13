import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const paths = {
  migration: "supabase/migrations/20260713_0015_durable_task_loop.sql",
  applyPending: "supabase/apply-pending.sql",
  liveSchema: "supabase/setup/00_live_schema.sql",
  smokeChecks: "supabase/setup/99_smoke_checks.sql",
  schema: "supabase/schema.sql",
};

function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function functionSql(sql, name) {
  const start = sql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "i"));
  if (start < 0) return "";
  const tail = sql.slice(start);
  const end = tail.indexOf("\n$$;");
  return end < 0 ? tail : tail.slice(0, end + 4);
}

const migration = read(paths.migration);

test("durable task migration is delivered verbatim to every schema bundle after 0014", () => {
  assert.ok(migration, `${paths.migration} must exist`);

  for (const path of [paths.applyPending, paths.liveSchema, paths.schema]) {
    assert.ok(read(path).includes(migration.trim()), `${path} must contain the exact 0015 migration`);
  }

  const applyPending = read(paths.applyPending);
  assert.ok(
    applyPending.indexOf("20260713_0014_atomic_content_draft_approval.sql") <
      applyPending.indexOf("20260713_0015_durable_task_loop.sql"),
    "apply-pending must preserve 0014 before 0015",
  );
});

test("mutation receipts enforce one generic workspace key and typed destinations", () => {
  assert.match(migration, /create table if not exists public\.mutation_receipts\s*\(/i);
  assert.match(migration, /workspace_id uuid not null references public\.workspaces\(id\)/i);
  assert.match(migration, /destination text not null[\s\S]*'task'[\s\S]*'inbox'/i);
  assert.match(migration, /action text not null[\s\S]*'create'[\s\S]*'update'[\s\S]*'capture'/i);
  assert.match(migration, /payload_hash text not null/i);
  assert.match(migration, /response jsonb/i);
  assert.match(migration, /created_at timestamptz not null default now\(\)/i);
  assert.match(migration, /updated_at timestamptz not null default now\(\)/i);
  assert.match(migration, /unique\s*\(workspace_id, idempotency_key\)/i);
  assert.doesNotMatch(migration, /task_id uuid references public\.tasks\(id\) on delete set null/i);
  assert.doesNotMatch(migration, /work_order_id uuid references public\.work_orders\(id\) on delete set null/i);
  assert.match(migration, /task_id uuid references public\.tasks\(id\) on delete restrict/i);
  assert.match(migration, /work_order_id uuid references public\.work_orders\(id\) on delete restrict/i);
});

test("bootstrap bundles define durable task prerequisites before the migration", () => {
  for (const path of [paths.liveSchema, paths.schema]) {
    const sql = read(path);
    const migrationStart = sql.indexOf("create table if not exists public.mutation_receipts");
    assert.ok(migrationStart > 0, `${path} must contain mutation_receipts`);
    const prefix = sql.slice(0, migrationStart);

    for (const table of ["workspaces", "workspace_memberships", "tasks", "work_orders"]) {
      assert.match(
        prefix,
        new RegExp(`create table(?: if not exists)?\\s+(?:public\\.)?${table}\\s*\\(`, "i"),
        `${path} must define ${table} before mutation_receipts`,
      );
    }

    for (const column of ["priority", "started_at", "completed_at", "meta", "updated_at"]) {
      assert.match(prefix, new RegExp(`(?:add column if not exists |\\s)${column}\\s`, "i"), `${path} must define tasks.${column} before the RPCs`);
    }
  }
});

test("all durable RPCs derive the active workspace owner and share atomic idempotency semantics", () => {
  for (const name of ["create_task_v1", "update_task_v1", "capture_quick_input_v1"]) {
    const sql = functionSql(migration, name);
    assert.ok(sql, `${name} must exist`);
    assert.match(sql, /security invoker/i);
    assert.match(sql, /from public\.workspaces w[\s\S]*w\.id = p_workspace_id/i);
    assert.match(sql, /from public\.workspace_memberships wm[\s\S]*wm\.user_id = v_owner_id[\s\S]*wm\.role = 'owner'[\s\S]*wm\.status = 'active'/i);
    assert.doesNotMatch(sql, /p_payload\s*->>?\s*'workspace/i);
    assert.doesNotMatch(sql, /p_payload\s*->>?\s*'owner/i);
    assert.match(sql, /md5\s*\(v_canonical_payload::text\)/i);
    assert.match(sql, /insert into public\.mutation_receipts[\s\S]*on conflict \(workspace_id, idempotency_key\) do nothing/i);
    assert.match(sql, /destination is distinct from v_destination[\s\S]*action is distinct from v_action[\s\S]*payload_hash is distinct from v_payload_hash/i);
    assert.match(sql, /'result', 'duplicate'/i);
    assert.doesNotMatch(sql, /exception\s+when/i);
  }
});

test("create_task_v1 validates related rows and returns the complete canonical task", () => {
  const sql = functionSql(migration, "create_task_v1");
  assert.match(sql, /from public\.projects[\s\S]*workspace_id = p_workspace_id/i);
  for (const table of ["leads", "deals", "contacts", "companies"]) {
    assert.match(sql, new RegExp(`from public\\.${table}[\\s\\S]*workspace_id = p_workspace_id`, "i"));
  }
  assert.match(sql, /insert into public\.tasks/i);
  assert.ok(sql.indexOf("insert into public.mutation_receipts") < sql.indexOf("insert into public.tasks"));
  assert.ok(sql.indexOf("insert into public.tasks") < sql.lastIndexOf("update public.mutation_receipts"));

  for (const key of [
    "id", "status", "priority", "due_at", "due_precision", "meta", "project", "owner",
    "next_action", "created_at", "updated_at", "completed_at", "started_at",
  ]) {
    assert.match(sql, new RegExp(`'${key}'\\s*,`, "i"), `canonical task must include ${key}`);
  }
});

test("update_task_v1 locks the row, enforces OCC and the complete transition graph", () => {
  const sql = functionSql(migration, "update_task_v1");
  assert.match(sql, /from public\.tasks[\s\S]*for update/i);
  assert.match(sql, /updated_at is distinct from p_expected_updated_at/i);
  assert.match(sql, /'reason', 'stale-write'/i);

  for (const transition of [
    ["inbox", "todo", "done"],
    ["todo", "doing", "blocked", "done"],
    ["doing", "todo", "blocked", "done"],
    ["blocked", "todo", "doing", "done"],
    ["done", "todo"],
  ]) {
    for (const value of transition) assert.ok(sql.includes(`'${value}'`));
  }

  assert.match(sql, /v_status = 'done'[\s\S]*completed_at/i);
  assert.match(sql, /v_task\.status = 'done'[\s\S]*v_status = 'todo'[\s\S]*null/i);
  assert.match(sql, /v_status = 'doing'[\s\S]*coalesce\(v_task\.started_at, v_now\)/i);
  assert.ok(sql.indexOf("stale-write") < sql.indexOf("update public.tasks"), "stale OCC returns before mutation");
});

test("capture_quick_input_v1 creates an Approval Queue compatible proposed inbox order", () => {
  const sql = functionSql(migration, "capture_quick_input_v1");
  assert.match(sql, /insert into public\.work_orders/i);
  assert.match(sql, /'proposed'/i);
  assert.match(sql, /'inbox'/i);
  for (const field of ["raw", "kind", "persona", "summary"]) {
    assert.match(sql, new RegExp(`'${field}'\\s*,`, "i"), `capture body must retain ${field}`);
  }
  assert.ok(sql.indexOf("insert into public.mutation_receipts") < sql.indexOf("insert into public.work_orders"));
  assert.ok(sql.indexOf("insert into public.work_orders") < sql.lastIndexOf("update public.mutation_receipts"));
  assert.match(sql, /v_lead_id is not null[\s\S]*from public\.leads[\s\S]*workspace_id = p_workspace_id/i);
  assert.match(sql, /v_company_id is not null[\s\S]*from public\.companies[\s\S]*workspace_id = p_workspace_id/i);
});

test("durable RPC execution is service-role only and smoke checks inspect table, key, routines, and grants", () => {
  for (const signature of [
    "create_task_v1(uuid, text, jsonb)",
    "update_task_v1(uuid, uuid, text, timestamptz, jsonb)",
    "capture_quick_input_v1(uuid, text, jsonb)",
  ]) {
    const escaped = signature.replace(/[()]/g, "\\$&").replace(/, /g, "\\s*,\\s*");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}\\s+from public, anon, authenticated`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}\\s+to service_role`, "i"));
  }

  const smoke = read(paths.smokeChecks);
  assert.match(smoke, /mutation_receipts/i);
  assert.match(smoke, /workspace_id[\s\S]*idempotency_key/i);
  for (const name of ["create_task_v1", "update_task_v1", "capture_quick_input_v1"]) {
    assert.match(smoke, new RegExp(name, "i"));
  }
  assert.match(smoke, /has_function_privilege/i);
  assert.match(smoke, /service_role/i);
  assert.match(smoke, /anon/i);
  assert.match(smoke, /authenticated/i);
});
