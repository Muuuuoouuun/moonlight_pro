import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const migrationUrl = name => new URL(`../../../supabase/migrations/${name}`, import.meta.url);
const migration = migrationUrl('20260921_0037_ai_assistance.sql');
const hardening = migrationUrl('20260922_0041_ai_assistance_hardening.sql');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
// Supabase grants these on every new public object; 0037's service_role write gap only reproduces with them.
const SUPABASE_DEFAULT_PRIVILEGES = 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;';
const TABLES = ['operating_ai_candidates', 'operating_ai_receipts'];
const WRITES = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const INVALID = error => ({ status: 'invalid-input', persisted: false, error });
const omit = (command, key) => { const input = { ...command.input }; delete input[key]; return { ...command, input }; };
test('AI candidate transactions preserve receipt, source version, workspace and review history', async t => {
  let source, hardened; try { [source, hardened] = await Promise.all([readFile(migration, 'utf8'), readFile(hardening, 'utf8')]); } catch {}
  assert.ok(source, 'AI migration exists'); assert.ok(hardened, 'AI hardening migration exists');
  let bin;
  for (const path of [process.env.AGENT_COMMAND_TEST_PG_BIN, '/opt/homebrew/opt/postgresql@17/bin', '/opt/homebrew/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'].filter(Boolean)) {
    try { await access(join(path, 'initdb'), constants.X_OK); bin = path; break; } catch {}
  }
  if (!bin) return t.skip('PostgreSQL binaries unavailable');
  // Private socket directory, no TCP listener, random port number: parallel clusters never share state.
  const root = await mkdtemp(join(tmpdir(), 'moon-ai-')); const port = String(20000 + Math.floor(Math.random() * 20000)); let running = false;
  const env = { ...process.env, LC_ALL: 'C' };
  const run = (name, args, input) => { const r = spawnSync(join(bin, name), args, { input, encoding: 'utf8', timeout: 30000, env }); assert.equal(r.status, 0, r.stderr || r.error); return r.stdout.trim(); };
  const psql = input => spawnSync(join(bin, 'psql'), ['-XAtq', '-h', root, '-p', port, '-U', userInfo().username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', timeout: 30000, env });
  const sql = input => { const r = psql(input); assert.equal(r.status, 0, r.stderr || r.error); return r.stdout.trim(); };
  const denied = input => { const r = psql(input); assert.notEqual(r.status, 0, `expected permission failure: ${input}`); assert.match(r.stderr, /permission denied/); };
  const privilege = (role, table, kind) => sql(`SELECT has_table_privilege(${quote(role)},${quote(table)},${quote(kind)})`);
  const w = randomUUID(), other = randomUUID(), task = randomUUID();
  const command = (changes = {}) => ({ commandId: randomUUID(), action: 'save_candidate', input: { entityType: 'tasks', entityId: task, scope: 'personal', expectedSourceUpdatedAt: '2026-09-21T00:00:00.123456Z', operation: 'draft', instruction: '', output: '후보', client: 'claude', model: null }, ...changes });
  const call = (c, workspace = w) => JSON.parse(sql(`SET ROLE service_role; SELECT operating_ai_command_v1(${quote(workspace)},'operator',${quote(JSON.stringify(c))}::jsonb,${quote(JSON.stringify({ snapshot: { title: '할 일' }, sourceRefs: [{ entityType: 'tasks', entityId: task }] }))}::jsonb);`));
  try {
    run('initdb', ['-D', join(root, 'data'), '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', join(root, 'data'), '-l', join(root, 'postgres.log'), '-o', `-F -h '' -k ${root} -p ${port}`, '-w', 'start']); running = true;
    sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; ${SUPABASE_DEFAULT_PRIVILEGES} CREATE TABLE workspaces(id uuid PRIMARY KEY); CREATE TABLE tasks(id uuid PRIMARY KEY,workspace_id uuid REFERENCES workspaces(id),updated_at timestamptz); INSERT INTO workspaces VALUES(${quote(w)}),(${quote(other)}); INSERT INTO tasks VALUES(${quote(task)},${quote(w)},'2026-09-21T00:00:00.123456Z');`);
    sql(await readFile(migrationUrl('20260921_0036_operating_goals.sql'), 'utf8'));
    sql(source); sql(source);
    // Precondition: 0037 alone reproduces production (service_role can write), so the checks after 0041 are not vacuous.
    for (const table of TABLES) assert.equal(privilege('service_role', table, 'INSERT'), 't', `0037 leaves ${table} writable`);
    sql(hardened); sql(hardened);

    const first = command();
    await t.test('valid commands keep receipts, replay, CAS and review history', () => {
      const saved = call(first);
      assert.equal(saved.persisted, true); assert.equal(saved.candidate.status, 'saved');
      assert.equal(call(first).replayed, true);
      assert.equal(call({ ...first, input: { ...first.input, output: '다른 후보' } }).status, 'conflict');
      assert.equal(call(command(), other).error, 'source-not-found');
      assert.equal(call(command({ input: { ...first.input, scope: 'company' } })).error, 'scope-mismatch');
      assert.equal(call(command({ input: { ...first.input, expectedSourceUpdatedAt: '2026-09-20T00:00:00Z' } })).error, 'source-conflict');
      const review = { commandId: randomUUID(), action: 'review_candidate', input: { candidateId: first.commandId, expectedRevision: 1, outcome: 'accepted', baselineMinutes: null, reviewMinutes: 2, actualMinutes: 8, note: '' } };
      const reviewed = call(review); assert.equal(reviewed.candidate.revision, 2); assert.equal(reviewed.candidate.review.baselineMinutes, null);
      assert.equal(call(review).replayed, true);
      assert.equal(call({ ...review, commandId: randomUUID() }).error, 'candidate-conflict');
      assert.equal(sql(`SELECT count(*) FROM operating_ai_receipts WHERE workspace_id=${quote(w)}`), '2');
      const receipt = JSON.parse(sql(`SET ROLE service_role; SELECT operating_ai_receipt_v1(${quote(w)},'operator',${quote(review.commandId)},NULL);`));
      assert.equal(receipt.replayed, true); assert.equal(receipt.candidate.revision, 2);
      const gen = command({ action: 'generate' }); delete gen.input.output; delete gen.input.client; delete gen.input.model;
      assert.equal(call(gen).claimed, true); assert.equal(call(gen).claimed, false);
      const finish = result => JSON.parse(sql(`SET ROLE service_role; SELECT operating_ai_finish_v1(${quote(w)},'operator',${quote(gen.commandId)},${quote(JSON.stringify(result))}::jsonb);`));
      assert.equal(finish({ status: 'generated', output: '생성', provider: 'gemini', model: 'selected', usage: null }).candidate.status, 'generated');
      assert.equal(finish({ status: 'generated', output: '덮어쓰기' }).candidate.output, '생성');
    });

    await t.test('service_role writes the AI tables only through the SECURITY DEFINER RPCs', () => {
      for (const table of TABLES) for (const kind of WRITES) assert.equal(privilege('service_role', table, kind), 'f', `service_role ${kind} ${table}`);
      for (const role of ['anon', 'authenticated']) for (const table of TABLES) for (const kind of ['SELECT', ...WRITES]) assert.equal(privilege(role, table, kind), 'f', `${role} ${kind} ${table}`);
      // The Hub reads candidates over PostgREST; receipts are read only through operating_ai_receipt_v1.
      assert.equal(privilege('service_role', 'operating_ai_candidates', 'SELECT'), 't');
      assert.equal(privilege('service_role', 'operating_ai_receipts', 'SELECT'), 'f');
      assert.equal(sql(`SET ROLE service_role; SELECT output FROM operating_ai_candidates WHERE id=${quote(first.commandId)};`), '후보');
      const row = `(${quote(randomUUID())},${quote(w)},'operator','tasks',${quote(task)},'personal',now(),'{}','draft','saved')`;
      denied(`SET ROLE service_role; INSERT INTO operating_ai_candidates(id,workspace_id,actor_id,entity_type,entity_id,scope,source_updated_at,source_snapshot,operation,status) VALUES${row};`);
      denied(`SET ROLE service_role; UPDATE operating_ai_candidates SET output='변조' WHERE id=${quote(first.commandId)};`);
      denied(`SET ROLE service_role; DELETE FROM operating_ai_candidates WHERE id=${quote(first.commandId)};`);
      denied('SET ROLE service_role; TRUNCATE operating_ai_candidates CASCADE;');
      denied(`SET ROLE service_role; INSERT INTO operating_ai_receipts(workspace_id,command_id,actor_id,request,candidate_id,response) VALUES(${quote(w)},${quote(randomUUID())},'operator','{}',${quote(first.commandId)},'{}');`);
      denied(`SET ROLE service_role; UPDATE operating_ai_receipts SET response='{}';`);
      denied('SET ROLE service_role; DELETE FROM operating_ai_receipts;');
      denied('SET ROLE service_role; TRUNCATE operating_ai_receipts;');
      assert.equal(sql(`SELECT output FROM operating_ai_candidates WHERE id=${quote(first.commandId)}`), '후보');
      assert.equal(sql(`SELECT count(*) FROM operating_ai_receipts WHERE workspace_id=${quote(w)}`), '3');
      const viaRpc = call(command()); assert.equal(viaRpc.persisted, true); assert.equal(viaRpc.candidate.status, 'saved');
      for (const fn of ['operating_ai_command_v1(uuid,text,jsonb,jsonb)', 'operating_ai_receipt_v1(uuid,text,uuid,jsonb)', 'operating_ai_finish_v1(uuid,text,uuid,jsonb)']) {
        assert.equal(sql(`SELECT has_function_privilege('service_role',${quote(fn)},'EXECUTE')`), 't', fn);
        for (const role of ['anon', 'authenticated']) assert.equal(sql(`SELECT has_function_privilege(${quote(role)},${quote(fn)},'EXECUTE')`), 'f', `${role} ${fn}`);
      }
    });

    await t.test('commands missing required fields return the invalid-input envelope and write nothing', async tc => {
      const counts = () => sql("SELECT (SELECT count(*) FROM operating_ai_candidates)::text||'/'||(SELECT count(*) FROM operating_ai_receipts)::text");
      const rejects = (c, error, label) => tc.test(label, () => { const baseline = counts(); assert.deepEqual(call(c), INVALID(error)); assert.equal(counts(), baseline, 'wrote nothing'); });
      await rejects(command({ action: undefined }), 'invalid-command', 'missing action');
      await rejects(command({ action: null }), 'invalid-command', 'null action');
      await rejects(command({ input: undefined }), 'invalid-command', 'missing input');
      for (const action of ['save_candidate', 'generate']) {
        for (const key of ['expectedSourceUpdatedAt', 'scope', 'operation', 'entityType']) await rejects(omit(command({ action }), key), 'invalid-source', `${action} missing ${key}`);
        await rejects(command({ action, input: { ...first.input, expectedSourceUpdatedAt: null } }), 'invalid-source', `${action} null expectedSourceUpdatedAt`);
      }
      const target = call(command()); assert.equal(target.candidate.revision, 1);
      const review = { commandId: randomUUID(), action: 'review_candidate', input: { candidateId: target.candidate.id, expectedRevision: 1, outcome: 'edited', baselineMinutes: 10, reviewMinutes: 1, actualMinutes: 2, note: '' } };
      const attempt = changes => ({ ...review, commandId: randomUUID(), input: { ...review.input, ...changes } });
      await rejects(omit(attempt(), 'outcome'), 'invalid-review', 'missing outcome');
      await rejects(attempt({ outcome: null }), 'invalid-review', 'null outcome');
      await rejects(omit(attempt(), 'expectedRevision'), 'invalid-review', 'missing expectedRevision');
      await rejects(attempt({ expectedRevision: null }), 'invalid-review', 'null expectedRevision');
      assert.equal(sql(`SELECT revision||':'||coalesce(review::text,'none') FROM operating_ai_candidates WHERE id=${quote(target.candidate.id)}`), '1:none');
      const reviewed = call(review);
      assert.equal(reviewed.status, 'saved'); assert.equal(reviewed.candidate.revision, 2); assert.equal(reviewed.candidate.review.outcome, 'edited');
    });
  } finally {
    if (running) run('pg_ctl', ['-D', join(root, 'data'), '-m', 'immediate', '-w', 'stop']);
    await rm(root, { recursive: true, force: true });
  }
});
