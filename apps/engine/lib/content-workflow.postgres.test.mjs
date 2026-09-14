import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

// Opt-in integration suite, never a hosted database. Bootstrap a disposable DB
// with supabase/setup/00_live_schema.sql, the 20260617_0007 channel migration,
// and 20260912_0026_content_workflow.sql (anon/authenticated/service_role exist).
// CONTENT_WORKFLOW_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/content_workflow_test
const connection = process.env.CONTENT_WORKFLOW_TEST_DATABASE_URL;
const exec = promisify(execFile);
async function psql(args) {
  assert.ok(connection);
  const url = new URL(connection);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a disposable local PostgreSQL server");
  assert.match(url.pathname, /^\/content_workflow_test(?:_[a-z0-9_]+)?$/i, "Use a dedicated content_workflow_test database");
  const { stdout } = await exec("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", connection, ...args]);
  return stdout.trim();
}
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

test("PostgreSQL workflow state and revision contract", { skip: !connection }, async () => {
  await psql(["-f", new URL("./content-workflow.test.sql", import.meta.url).pathname]);
});

test("simultaneous identical request IDs create one item and return the same rows", { skip: !connection }, async () => {
  const workspace = randomUUID();
  const request = randomUUID();
  await psql(["-c", `insert into public.workspaces(id,name,slug) values('${workspace}','Concurrent workflow','workflow-${workspace}')`]);
  try {
    const command = JSON.stringify({ action: "save", contentId: null, variantId: null, item: { sourceIdea: "원문" }, variant: { body: "한 초안", variantType: "x_thread", channel: "threads" } });
    const sql = `select public.content_workflow_v1('${workspace}','${request}','concurrent-hash',${literal(command)}::jsonb)`;
    const responses = (await Promise.all([psql(["-c", sql]), psql(["-c", sql])])).map((text) => JSON.parse(text));
    assert.deepEqual(responses.map((row) => row.status).sort(), ["duplicate", "saved"]);
    assert.deepEqual(responses[0].item, responses[1].item);
    assert.deepEqual(responses[0].variant, responses[1].variant);
    assert.equal(await psql(["-c", `select count(*) from public.content_items where workspace_id='${workspace}'`]), "1");
    assert.equal(await psql(["-c", `select count(*) from public.content_workflow_receipts where workspace_id='${workspace}'`]), "1");
  } finally {
    await psql(["-c", `delete from public.workspaces where id='${workspace}'`]);
  }
});

test("workflow tables have RLS and only service-role mutations/execute", { skip: !connection }, async () => {
  const output = await psql(["-c", `select jsonb_build_object(
    'rls', (select bool_and(relrowsecurity) from pg_class where oid in ('public.content_revisions'::regclass,'public.content_transform_runs'::regclass,'public.content_workflow_receipts'::regclass)),
    'anonExecute', has_function_privilege('anon','public.content_workflow_v1(uuid,uuid,text,jsonb)','EXECUTE'),
    'authExecute', has_function_privilege('authenticated','public.content_workflow_v1(uuid,uuid,text,jsonb)','EXECUTE'),
    'serviceExecute', has_function_privilege('service_role','public.content_workflow_v1(uuid,uuid,text,jsonb)','EXECUTE'),
    'anonSelect', has_table_privilege('anon','public.content_revisions','SELECT'),
    'authInsert', has_table_privilege('authenticated','public.content_transform_runs','INSERT'))`]);
  assert.deepEqual(JSON.parse(output), { rls: true, anonExecute: false, authExecute: false, serviceExecute: true, anonSelect: false, authInsert: false });
});
