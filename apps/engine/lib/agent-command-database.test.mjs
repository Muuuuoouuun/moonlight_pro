import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { normalizeAgentCommand } from './agent-command.ts';

const migration = new URL('../../../supabase/migrations/20260913_0032_agent_commands.sql', import.meta.url);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const scopes = ['read', 'tasks:write', 'contact-outcomes:write'];
async function postgresBin() {
  for (const dir of [process.env.AGENT_COMMAND_TEST_PG_BIN, ...String(process.env.PATH).split(':'), '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'].filter(Boolean)) {
    try { await Promise.all(['initdb', 'pg_ctl', 'psql'].map(name => access(join(dir, name), constants.X_OK))); return dir; } catch {}
  }
  return null;
}

test('agent command PostgreSQL transaction contract', async t => {
  let source;
  try { source = await readFile(migration, 'utf8'); } catch {}
  assert.ok(source, 'Agent command migration exists');
  const bin = await postgresBin();
  if (!bin) { t.skip('Local PostgreSQL binaries unavailable; set AGENT_COMMAND_TEST_PG_BIN'); return; }
  const root = await mkdtemp(join(tmpdir(), 'moon-agent-commands-'));
  const data = join(root, 'data'); let running = false;
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, { encoding: 'utf8', input, timeout: 30000 });
    assert.equal(result.status, 0, `${name}: ${result.stderr || result.error || result.stdout}`);
    return result.stdout.trim();
  };
  const args = ['-X', '-A', '-t', '-q', '-h', root, '-p', '5432', '-U', userInfo().username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const sql = text => run('psql', args, text);
  const context = (workspaceId, actorId = 'codex', granted = scopes) => ({ workspaceId, actorId, scopes: granted });
  const normalize = (workspaceId, input) => {
    const result = normalizeAgentCommand(input, context(workspaceId)); assert.equal(result.ok, true, result.reason); return result.command;
  };
  const statement = (workspaceId, command, actorId = 'codex', granted = scopes) => `SET ROLE service_role; SELECT public.agent_command_v1(${quote(workspaceId)}::uuid,${quote(actorId)},ARRAY[${granted.map(quote).join(',')}]::text[],${quote(JSON.stringify(command))}::jsonb);`;
  const call = (w, input, actor, granted) => JSON.parse(sql(statement(w, normalize(w, input), actor, granted)));
  const callRaw = (w, command, actor, granted) => JSON.parse(sql(statement(w, command, actor, granted)));
  const callAsync = (w, input) => new Promise((resolve, reject) => {
    const child = spawn(join(bin, 'psql'), args); let out = '', err = '';
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(JSON.parse(out.trim())) : reject(new Error(err)));
    child.stdin.end(statement(w, normalize(w, input)));
  });
  const readReceipt = (w, id, actor = 'codex', granted = ['read']) => JSON.parse(sql(`SET ROLE service_role; SELECT public.agent_command_receipt_v1(${quote(w)},${quote(actor)},ARRAY[${granted.map(quote).join(',')}]::text[],${quote(id)});`));
  const workspace = () => { const id = randomUUID(); sql(`INSERT INTO workspaces(id,slug,name) VALUES (${quote(id)},${quote(id)},'Agent commands');`); return id; };
  const create = (changes = {}) => ({ commandId: randomUUID(), action: 'create_task', input: { title: '할 일 👩🏽‍💻' }, ...changes });
  try {
    run('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-F -h '' -k ${root} -p 5432`, '-w', 'start']); running = true;
    sql('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;');
    // Real task schema, real timestamp triggers, and the authoritative contact RPC.
    sql(await readFile(new URL('../../../supabase/setup/00_live_schema.sql', import.meta.url), 'utf8'));
    sql(await readFile(new URL('../../../supabase/migrations/20260718_0021_task_description.sql', import.meta.url), 'utf8'));
    sql(`CREATE TABLE public.crm_activities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
      entity_type text NOT NULL, kind text NOT NULL, body text NOT NULL, reaction text,
      contact_id uuid REFERENCES contacts(id), lead_id uuid REFERENCES leads(id), deal_id uuid REFERENCES deals(id),
      account_id uuid REFERENCES customer_accounts(id), occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());`);
    sql(await readFile(new URL('../../../supabase/migrations/20260716_0018_record_contact_outcome.sql', import.meta.url), 'utf8'));
    sql(source); sql(source); // Deployment is repeatable.

    await t.test('same command races create once, return exact receipt, and recompute input hashes in SQL', async () => {
      const w = workspace(), command = create();
      const results = await Promise.all(Array.from({ length: 8 }, () => callAsync(w, command)));
      assert.equal(results.filter(r => r.replayed === false).length, 1);
      assert.equal(results.filter(r => r.replayed === true).length, 7);
      assert.ok(results.every(r => r.persisted === true && r.commandId === command.commandId));
      assert.equal(sql(`SELECT count(*) FROM tasks WHERE workspace_id=${quote(w)}`), '1');
      assert.equal(sql(`SELECT count(*) FROM agent_command_receipts WHERE workspace_id=${quote(w)}`), '1');
      const stored = results[0];
      assert.deepEqual(readReceipt(w, command.commandId), { ...stored, replayed: true });
      assert.match(sql(`SELECT request_hash FROM agent_command_receipts WHERE workspace_id=${quote(w)}`), /^[0-9a-f]{64}$/);
      assert.equal(call(w, { ...command, input: { title: '다른 내용' } }).code, 'conflict');
      assert.equal(readReceipt(w, command.commandId).entity.title, command.input.title);
      const shuffled = normalize(w, command); shuffled.payload = Object.fromEntries(Object.entries(shuffled.payload).reverse());
      assert.equal(callRaw(w, shuffled).replayed, true);
    });

    await t.test('absent receipt stays unknown while the original command is still uncommitted', async () => {
      const w = workspace(), input = create();
      const child = spawn(join(bin, 'psql'), args);
      let output = '', errors = '', timer;
      const ready = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Command did not reach the commit barrier')), 5000);
        child.stdout.on('data', chunk => {
          output += chunk;
          if (output.includes('AGENT_PENDING_COMMIT')) { clearTimeout(timer); resolve(); }
        });
        child.on('error', reject);
      });
      child.stderr.on('data', chunk => { errors += chunk; });
      const closed = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(errors)));
      });
      // Observe a real open transaction after the function has written the task
      // and receipt; another session cannot see either until COMMIT.
      child.stdin.write(`BEGIN; ${statement(w, normalize(w, input))} SELECT 'AGENT_PENDING_COMMIT';\n`);
      try {
        await ready;
        const pending = readReceipt(w, input.commandId);
        child.stdin.end('COMMIT;\n');
        await closed;
        const committed = readReceipt(w, input.commandId);
        assert.equal(committed.persisted, true);
        assert.equal(pending.code, 'not-found');
        assert.equal(pending.persisted, null);
        assert.equal(pending.retryable, false);
        assert.equal(pending.retryPolicy, 'same-command-id-and-input-only');
      } finally { clearTimeout(timer); if (child.exitCode === null) child.kill(); }
    });

    await t.test('new receipts, old stored receipts, replays and conflicts bound their public entity', () => {
      const w = workspace(), first = call(w, create({ input: { title: '한'.repeat(300) } }));
      const id = first.entity.id;
      const version = JSON.parse(sql(`UPDATE tasks SET meta=meta||jsonb_build_object('private_import_note',repeat('업무',100000)) WHERE id=${quote(id)} RETURNING to_jsonb(updated_at);`));
      const input = { commandId: randomUUID(), action: 'complete_task', targetId: id, expectedUpdatedAt: version, input: {} };
      const saved = call(w, input);
      assert.equal(saved.persisted, true);
      assert.equal(saved.entity.updatedAt, saved.updatedAt);
      assert.equal(saved.entity.title.length, 200);
      assert.equal(saved.entity.meta, undefined);
      assert.equal(saved.entity.summaryTruncated, true);
      assert.deepEqual(saved.changedFields, ['status', 'updated_at', 'completed_at']);
      assert.deepEqual(saved.entityRef, { type: 'tasks', id, detailAvailable: true, href: `/api/agent/v1/entities/tasks/${id}` });
      assert.ok(Buffer.byteLength(JSON.stringify(saved)) <= 2048);
      // Simulate a receipt persisted by an earlier migration with the entire row.
      sql(`UPDATE agent_command_receipts SET receipt=receipt||jsonb_build_object('entity',(SELECT to_jsonb(t) FROM tasks t WHERE id=${quote(id)})) WHERE workspace_id=${quote(w)} AND command_id=${quote(input.commandId)};`);
      for (const result of [readReceipt(w, input.commandId), call(w, input)]) {
        assert.equal(result.replayed, true);
        assert.equal(result.entity.meta, undefined);
        assert.equal(result.updatedAt, saved.updatedAt);
        assert.deepEqual(result.changedFields, saved.changedFields);
        assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 2048);
      }
      const conflict = call(w, { ...input, commandId: randomUUID() });
      assert.equal(conflict.code, 'conflict');
      assert.equal(conflict.entity.meta, undefined);
      assert.equal(conflict.entity.updatedAt, saved.updatedAt);
      assert.ok(Buffer.byteLength(JSON.stringify(conflict)) <= 2048);
    });

    await t.test('optimistic edits race at microsecond precision and merge checklist into current metadata', async () => {
      const w = workspace(), input = create(), first = call(w, input);
      const version = '2026-09-13T01:00:00.123456+00:00';
      sql(`ALTER TABLE tasks DISABLE TRIGGER tasks_set_updated_at; UPDATE tasks SET updated_at=${quote(version)},meta=meta||'{"source_refs":[{"id":"memo"}]}'::jsonb WHERE id=${quote(input.commandId)}; ALTER TABLE tasks ENABLE TRIGGER tasks_set_updated_at;`);
      const base = { action: 'update_task', targetId: first.entity.id, expectedUpdatedAt: version };
      assert.equal(call(w, { ...base, commandId: randomUUID(), expectedUpdatedAt: '2026-09-13T01:00:00.123Z', input: { title: 'lossy timestamp' } }).code, 'conflict');
      const edits = [ { ...base, commandId: randomUUID(), input: { title: '수정 A', checklist: [] } }, { ...base, commandId: randomUUID(), input: { title: '수정 B', checklist: [] } } ];
      const results = await Promise.all(edits.map(command => callAsync(w, command)));
      assert.equal(results.filter(r => r.persisted === true).length, 1); assert.equal(results.filter(r => r.code === 'conflict').length, 1);
      const changed = results.find(r => r.persisted === true);
      const persistedMeta = JSON.parse(sql(`SELECT meta FROM tasks WHERE id=${quote(changed.entity.id)}`));
      assert.deepEqual(persistedMeta.source_refs, [{ id: 'memo' }]); assert.deepEqual(persistedMeta.checklist, []);
      assert.equal(changed.updatedAt, changed.entity.updatedAt);
      const complete = { commandId: randomUUID(), action: 'complete_task', targetId: changed.entity.id, expectedUpdatedAt: changed.updatedAt, input: {} };
      const done = call(w, complete); assert.equal(done.entity.status, 'done'); assert.equal(sql(`SELECT completed_at IS NOT NULL FROM tasks WHERE id=${quote(done.entity.id)}`), 't');
      assert.equal(call(w, complete).replayed, true);
    });

    await t.test('cross-workspace task, project, deal and contact references cannot mutate or leak receipts', () => {
      const w = workspace(), other = workspace(), otherTask = create(), task = call(other, otherTask);
      const project = randomUUID(), deal = randomUUID(), contact = randomUUID(), lead = randomUUID();
      sql(`INSERT INTO projects(id,workspace_id,name) VALUES (${quote(project)},${quote(other)},'Other'); INSERT INTO deals(id,workspace_id,title) VALUES (${quote(deal)},${quote(other)},'Other'); INSERT INTO contacts(id,workspace_id,name) VALUES (${quote(contact)},${quote(other)},'Other'); INSERT INTO leads(id,workspace_id) VALUES (${quote(lead)},${quote(w)});`);
      assert.equal(call(w, { commandId: randomUUID(), action: 'complete_task', targetId: task.entity.id, expectedUpdatedAt: task.updatedAt, input: {} }).code, 'not-found');
      for (const input of [{ title: 'Bad project', projectId: project }, { title: 'Bad deal', dealId: deal }]) assert.equal(call(w, create({ input })).code, 'invalid-input');
      const outcome = { commandId: randomUUID(), action: 'record_contact_outcome', targetId: lead, input: { entityType: 'lead', contactId: contact, summary: '연락', reaction: 'positive' } };
      assert.equal(call(w, outcome).code, 'invalid-input');
      assert.equal(sql(`SELECT count(*) FROM crm_activities WHERE workspace_id=${quote(w)}`), '0');
      assert.equal(readReceipt(w, otherTask.commandId).code, 'not-found');
      assert.equal(readReceipt(other, otherTask.commandId, 'other-actor').code, 'not-found');
      assert.equal(call(other, otherTask, 'other-actor').code, 'conflict');
      assert.equal(sql(`SELECT count(*) FROM agent_command_receipts WHERE workspace_id=${quote(w)}`), '0');
    });

    await t.test('contact result calls the existing business RPC and one receipt covers both activity and follow-up', async () => {
      const w = workspace(), lead = randomUUID(), contact = randomUUID();
      sql(`INSERT INTO leads(id,workspace_id,meta) VALUES (${quote(lead)},${quote(w)},'{"keep":true}'); INSERT INTO contacts(id,workspace_id,name) VALUES (${quote(contact)},${quote(w)},'내 고객');`);
      const command = { commandId: randomUUID(), action: 'record_contact_outcome', targetId: lead, input: { entityType: 'lead', contactId: contact, kind: 'kakao', summary: '상담을 완료했음', reaction: 'positive', nextAction: '견적 보내기', nextActionAt: '2026-09-14T01:00:00Z' } };
      const results = await Promise.all([callAsync(w, command), callAsync(w, command)]);
      assert.ok(results.every(r => r.persisted));
      assert.equal(sql(`SELECT count(*) FROM crm_activities WHERE workspace_id=${quote(w)}`), '1');
      const stored = JSON.parse(sql(`SELECT to_jsonb(leads) FROM leads WHERE id=${quote(lead)}`));
      assert.equal(stored.next_action, '견적 보내기'); assert.equal(stored.meta.keep, true);
      assert.equal(stored.meta.next_action_at, command.input.nextActionAt); assert.ok(results[0].outcome.activityId);
      const bad = { ...command, commandId: randomUUID(), input: { ...command.input, reaction: 'invented' } };
      assert.equal(call(w, bad).code, 'invalid-input');
      assert.equal(sql(`SELECT count(*) FROM crm_activities WHERE workspace_id=${quote(w)}`), '1');
      const dormant = call(w, { ...command, commandId: randomUUID(), input: { ...command.input, dormant: true } });
      const dormantMeta = JSON.parse(sql(`SELECT meta FROM leads WHERE id=${quote(lead)}`));
      assert.equal(dormantMeta.dormant, true); assert.equal(dormantMeta.next_action_at, null);
    });

    await t.test('a receipt failure rolls back both new tasks and contact activity/target writes', () => {
      const w = workspace(), lead = randomUUID();
      sql(`INSERT INTO leads(id,workspace_id,next_action) VALUES (${quote(lead)},${quote(w)},'before'); CREATE FUNCTION public.agent_test_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected receipt failure'; END;$$; CREATE TRIGGER agent_test_fail BEFORE INSERT ON agent_command_receipts FOR EACH ROW EXECUTE FUNCTION agent_test_fail_receipt();`);
      try {
        assert.equal(call(w, create()).persisted, false);
        const outcome = { commandId: randomUUID(), action: 'record_contact_outcome', targetId: lead, input: { entityType: 'lead', summary: '기록', reaction: 'positive', nextAction: 'after' } };
        assert.equal(call(w, outcome).persisted, false);
        assert.equal(sql(`SELECT count(*) FROM tasks WHERE workspace_id=${quote(w)}`), '0');
        assert.equal(sql(`SELECT count(*) FROM crm_activities WHERE workspace_id=${quote(w)}`), '0');
        assert.equal(sql(`SELECT next_action FROM leads WHERE id=${quote(lead)}`), 'before');
        assert.equal(sql(`SELECT count(*) FROM agent_command_receipts WHERE workspace_id=${quote(w)}`), '0');
      } finally { sql('DROP TRIGGER agent_test_fail ON agent_command_receipts; DROP FUNCTION agent_test_fail_receipt();'); }
    });

    await t.test('any non-success business RPC result rolls back unexpectedly written activity', () => {
      const w = workspace(), lead = randomUUID();
      sql(`INSERT INTO leads(id,workspace_id,next_action) VALUES (${quote(lead)},${quote(w)},'before'); ALTER FUNCTION public.record_contact_outcome_v1(uuid,text,uuid,uuid,text,text,text,text,text,boolean) RENAME TO agent_test_original_outcome;
        CREATE FUNCTION public.record_contact_outcome_v1(uuid,text,uuid,uuid,text,text,text,text,text,boolean) RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN
          UPDATE public.leads SET next_action='bad partial mutation' WHERE id=$3;
          RETURN '{"status":"invalid-input","error":"invalid-reaction"}'::jsonb;
        END;$$;`);
      try {
        const result = call(w, { commandId: randomUUID(), action: 'record_contact_outcome', targetId: lead, input: { entityType: 'lead', summary: '기록', reaction: 'positive' } });
        assert.equal(result.code, 'invalid-input'); assert.equal(result.error, 'invalid-reaction');
        assert.equal(sql(`SELECT next_action FROM leads WHERE id=${quote(lead)}`), 'before');
        assert.equal(sql(`SELECT count(*) FROM agent_command_receipts WHERE workspace_id=${quote(w)}`), '0');
      } finally { sql('DROP FUNCTION public.record_contact_outcome_v1(uuid,text,uuid,uuid,text,text,text,text,text,boolean); ALTER FUNCTION public.agent_test_original_outcome(uuid,text,uuid,uuid,text,text,text,text,text,boolean) RENAME TO record_contact_outcome_v1;'); }
    });

    await t.test('storage scopes, RPC grants, RLS and normalized payload allowlists fail closed', () => {
      const w = workspace(), input = create(), normalized = normalize(w, input);
      assert.equal(callRaw(w, normalized, 'codex', ['read']).code, 'forbidden');
      assert.equal(readReceipt(w, input.commandId, 'codex', ['tasks:write']).code, 'forbidden');
      for (const changes of [{ actorId: 'evil' }, { payload: { ...normalized.payload, owner_id: randomUUID() } }, { payload: { ...normalized.payload, meta: { source: 'manual' } } }, { action: 'delete_task' }, { requestHash: 'injected' }]) assert.equal(callRaw(w, { ...normalized, ...changes }).code, 'invalid-input');
      assert.equal(sql("SELECT has_function_privilege('anon','public.agent_command_v1(uuid,text,text[],jsonb)','EXECUTE')"), 'f');
      assert.equal(sql("SELECT has_function_privilege('authenticated','public.agent_command_receipt_v1(uuid,text,text[],uuid)','EXECUTE')"), 'f');
      assert.equal(sql("SELECT has_table_privilege('authenticated','public.agent_command_receipts','SELECT')"), 'f');
      assert.equal(sql("SELECT has_table_privilege('service_role','public.agent_command_receipts','UPDATE')"), 'f');
      assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.agent_command_receipts'::regclass"), 't');
    });
  } finally {
    if (running) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8', timeout: 10000 });
    await rm(root, { recursive: true, force: true });
  }
});
