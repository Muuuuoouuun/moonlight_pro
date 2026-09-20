import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const migration = new URL('../../../supabase/migrations/20260921_0037_ai_assistance.sql', import.meta.url);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
test('AI candidate transactions preserve receipt, source version, workspace and review history', async t => {
  let source; try { source = await readFile(migration, 'utf8'); } catch {}
  assert.ok(source, 'AI migration exists');
  let bin;
  for (const path of [process.env.AGENT_COMMAND_TEST_PG_BIN, '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'].filter(Boolean)) {
    try { await access(join(path, 'initdb'), constants.X_OK); bin = path; break; } catch {}
  }
  if (!bin) return t.skip('PostgreSQL binaries unavailable');
  const root = await mkdtemp(join(tmpdir(), 'moon-ai-')); let running = false;
  const run = (name, args, input) => { const r = spawnSync(join(bin, name), args, { input, encoding: 'utf8', timeout: 30000, env: { ...process.env, LC_ALL: 'C' } }); assert.equal(r.status, 0, r.stderr || r.error); return r.stdout.trim(); };
  const sql = input => run('psql', ['-XAtq', '-h', root, '-p', '5432', '-U', userInfo().username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input);
  const w = randomUUID(), other = randomUUID(), task = randomUUID();
  const command = (changes = {}) => ({ commandId: randomUUID(), action: 'save_candidate', input: { entityType: 'tasks', entityId: task, scope: 'personal', expectedSourceUpdatedAt: '2026-09-21T00:00:00.123456Z', operation: 'draft', instruction: '', output: '후보', client: 'claude', model: null }, ...changes });
  const call = (c, workspace = w) => JSON.parse(sql(`SET ROLE service_role; SELECT operating_ai_command_v1(${quote(workspace)},'operator',${quote(JSON.stringify(c))}::jsonb,${quote(JSON.stringify({ snapshot: { title: '할 일' }, sourceRefs: [{ entityType: 'tasks', entityId: task }] }))}::jsonb);`));
  try {
    run('initdb', ['-D', join(root, 'data'), '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', join(root, 'data'), '-l', join(root, 'postgres.log'), '-o', `-F -h '' -k ${root}`, '-w', 'start']); running = true;
    sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE TABLE workspaces(id uuid PRIMARY KEY); CREATE TABLE tasks(id uuid PRIMARY KEY,workspace_id uuid REFERENCES workspaces(id),updated_at timestamptz); INSERT INTO workspaces VALUES(${quote(w)}),(${quote(other)}); INSERT INTO tasks VALUES(${quote(task)},${quote(w)},'2026-09-21T00:00:00.123456Z');`);
    sql(await readFile(new URL('../../../supabase/migrations/20260921_0036_operating_goals.sql', import.meta.url), 'utf8'));
    sql(source); sql(source);
    const first = command(), saved = call(first);
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
    const gen = command({ action: 'generate' }); delete gen.input.output; delete gen.input.client; delete gen.input.model;
    assert.equal(call(gen).claimed, true); assert.equal(call(gen).claimed, false);
    const finish = result => JSON.parse(sql(`SET ROLE service_role; SELECT operating_ai_finish_v1(${quote(w)},'operator',${quote(gen.commandId)},${quote(JSON.stringify(result))}::jsonb);`));
    assert.equal(finish({ status: 'generated', output: '생성', provider: 'gemini', model: 'selected', usage: null }).candidate.status, 'generated');
    assert.equal(finish({ status: 'generated', output: '덮어쓰기' }).candidate.output, '생성');
    assert.equal(sql("SELECT has_function_privilege('anon','operating_ai_command_v1(uuid,text,jsonb,jsonb)','EXECUTE')"), 'f');
  } finally {
    if (running) run('pg_ctl', ['-D', join(root, 'data'), '-m', 'immediate', '-w', 'stop']);
    await rm(root, { recursive: true, force: true });
  }
});
