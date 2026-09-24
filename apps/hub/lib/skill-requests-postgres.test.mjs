import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const enabled = process.env.SKILL_REQUEST_POSTGRES_TEST === '1'
  && process.getuid?.() !== 0
  && ['initdb', 'pg_ctl', 'psql'].every((name) => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
const workspace = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const secondId = '55555555-5555-4555-8555-555555555555';
const commandId = '66666666-6666-4666-8666-666666666666';
const quoted = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quoted(JSON.stringify(value))}::jsonb`;

test('local skill SQL keeps operator ownership, evidence and completion command separate', { skip: !enabled }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'moon-skill-pg-'));
  const data = join(directory, 'data');
  const port = String(56000 + Math.floor(Math.random() * 3000));
  const env = { ...process.env, LC_ALL: 'C' };
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', port, '-U', 'skill_test', '-d', 'postgres'];
  const run = (name, arguments_, input) => {
    const result = spawnSync(name, arguments_, { input, encoding: 'utf8', env, timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.error || result.stdout);
    return result.stdout.trim();
  };
  const sql = (source) => run('psql', args, source);
  const call = (name, values) => JSON.parse(sql(`set role service_role; select public.${name}(${values.join(',')});`));
  const request = { requestId, taskId, scope: 'personal', instruction: '폴더 정리', expectedEvidence: '경로와 검토 메모' };
  const receipt = { state: 'completed', summary: '폴더를 정리했다', evidence: [{ kind: 'path', value: '/local/receipts' }] };
  const create = (body, owner = 'operator', inWorkspace = workspace) => call('local_skill_request_create_v1', [quoted(inWorkspace), quoted(owner), json(body)]);
  const get = (id, inWorkspace = workspace) => call('local_skill_request_get_v1', [quoted(inWorkspace), quoted('operator'), quoted(id)]);
  const record = (id, body, actor = 'codex', inWorkspace = workspace) => call('local_skill_receipt_record_v1', [quoted(inWorkspace), quoted('operator'), quoted(actor), quoted(id), json(body)]);
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'skill_test', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-F -k ${directory} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.workspaces(id uuid primary key);
      create table public.tasks(id uuid primary key,workspace_id uuid not null references public.workspaces(id),scope text not null,status text not null default 'todo');
      create table public.agent_command_receipts(workspace_id uuid not null,actor_id text not null,command_id uuid not null,
        action text not null,target_id uuid not null,primary key(workspace_id,actor_id,command_id));
      create function public.operating_goal_entity_scope_v1(p_workspace_id uuid,p_type text,p_id uuid)
        returns text language sql stable as $$ select case scope when 'classin' then 'company' else 'personal' end
          from public.tasks where workspace_id=p_workspace_id and id=p_id and p_type='tasks' $$;
      insert into public.workspaces values('${workspace}'),('${other}');
      insert into public.tasks(id,workspace_id,scope) values('${taskId}','${workspace}','personal');`);
    const migration = readFileSync(new URL('../../../supabase/migrations/20260925_0047_local_skill_requests.sql', import.meta.url), 'utf8');
    sql(migration);
    sql(migration); // safe replay
    assert.equal(create({ ...request, scope: 'classin' }).error, 'task-scope-or-owner-mismatch');
    assert.equal(create(request, 'codex').status, 'invalid-input');
    assert.equal(create(request, 'operator', other).status, 'invalid-input');
    const saved = create(request);
    assert.equal(saved.status, 'ready');
    assert.equal(saved.request.state, 'requested');
    assert.equal(create(request).replayed, true);
    assert.equal(create({ ...request, instruction: '다른 작업' }).status, 'conflict');
    assert.equal(get(requestId, other).status, 'not-found');
    assert.equal(record(requestId, { ...receipt, evidence: [{ value: 'untyped' }] }).error, 'invalid-skill-evidence');
    assert.equal(record(requestId, { ...receipt, commandId }).error, 'completion-command-receipt-not-found');
    sql(`insert into public.agent_command_receipts values('${workspace}','codex','${commandId}','complete_task','${taskId}');`);
    const done = record(requestId, { ...receipt, commandId });
    assert.equal(done.request.state, 'completed');
    assert.equal(done.request.receipt.commandReceiptVerified, true);
    assert.equal(record(requestId, { ...receipt, commandId }).replayed, true);
    assert.equal(record(requestId, { ...receipt, summary: '달라진 결과', commandId }).status, 'conflict');
    assert.equal(sql(`select status from public.tasks where id='${taskId}'`), 'todo');
    assert.equal(get(requestId).request.state, 'completed');
    assert.equal(create({ ...request, requestId: secondId }).status, 'ready');
    assert.equal(record(secondId, { state: 'unconfirmed', summary: '검증 대기', evidence: [] }).request.state, 'unconfirmed');
    assert.equal(record(secondId, receipt).request.state, 'completed');
    assert.equal(sql("select has_table_privilege('authenticated','public.local_skill_requests','select')"), 'f');
    assert.equal(sql("select has_function_privilege('authenticated','public.local_skill_receipt_record_v1(uuid,text,text,uuid,jsonb)','execute')"), 'f');
    assert.equal(sql("select has_function_privilege('service_role','public.local_skill_receipt_record_v1(uuid,text,text,uuid,jsonb)','execute')"), 't');
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  }
});
