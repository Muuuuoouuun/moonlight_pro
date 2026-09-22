import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { normalizeAgentCommand } from '../../../engine/lib/agent-command.ts';
import { OFFICE_WORKFLOW_VERSION, parseOfficeWorkflowContext, parseOfficeWorkflowResult } from '@com-moon/agent-contracts/office-workflow';

const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
const rootUrl = new URL('../../../../', import.meta.url);
const migration = new URL('supabase/migrations/20260921_0038_office_requests.sql', rootUrl);

test('Office PostgreSQL receipts, retention and task application share real command transaction rules', async t => {
  let bin;
  for (const candidate of [process.env.AGENT_COMMAND_TEST_PG_BIN, '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'].filter(Boolean)) {
    try { await access(join(candidate, 'initdb'), constants.X_OK); bin = candidate; break; } catch {}
  }
  if (!bin) return t.skip('Local PostgreSQL binaries unavailable');
  const root = await mkdtemp(join(tmpdir(), 'moon-office-')), data = join(root, 'data'); let running = false;
  const env = { ...process.env, LC_ALL: 'C' };
  const run = (name, args, input) => { const result = spawnSync(join(bin, name), args, { input, encoding: 'utf8', timeout: 30000, env }); assert.equal(result.status, 0, result.stderr || result.error || result.stdout); return result.stdout.trim(); };
  const args = ['-XAtq', '-h', root, '-p', '5432', '-U', userInfo().username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const sql = input => run('psql', args, input);
  const asyncSql = input => new Promise((resolve, reject) => {
    const child = spawn(join(bin, 'psql'), args, { env }); let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(error))); child.stdin.end(input);
  });
  const w = randomUUID(), other = randomUUID(), actor = 'operator';
  const request = (changes = {}) => ({ requestId: randomUUID(), intent: 'weekly_report', ownerId: 'vaporeon', mode: 'draft', participants: [], scope: 'personal', originRef: { periodStart: '2026-09-14', periodEnd: '2026-09-20', timezone: 'Asia/Seoul' }, expectedContextHash: 'a'.repeat(64), message: '완료한 업무를 정리해 주세요.', boundedHistory: [], ...changes });
  const context = r => ({ status: 'ready', scope: r.scope, originRef: r.originRef, originKey: 'weekly', contextHash: r.expectedContextHash, sourceRefs: [], facts: {}, missing: [], asOf: '2026-09-21T00:00:00Z', capabilities: { generate: true, applyTask: true } });
  const generated = r => ({ status: 'generated', requestId: r.requestId, ownerId: r.ownerId, mode: r.mode, participants: r.participants, scope: r.scope, resultRevision: 1, context: { contextHash: r.expectedContextHash }, artifact: { kind: 'text', body: '확인된 업무 정리' } });
  const statement = (name, values) => `SET ROLE service_role; SELECT public.${name}(${values.join(',')});`;
  const call = (name, values) => JSON.parse(sql(statement(name, values)));
  const base = (id, workspace = w, owner = actor) => [quote(workspace), quote(owner), quote(id)];
  const claimStatement = r => statement('office_request_claim_v1', [quote(w), quote(actor), json(r), json(context(r))]);
  const claim = r => JSON.parse(sql(claimStatement(r)));
  const receipt = (r, workspace = w, owner = actor) => call('office_request_receipt_v1', [...base(r.requestId, workspace, owner), 'null']);
  const finish = (r, token, result = generated(r)) => call('office_request_finish_v1', [...base(r.requestId), quote(token), json(result)]);
  const project = (scope = 'personal') => {
    const id = randomUUID();
    sql(`INSERT INTO projects(id,workspace_id,name,meta) VALUES(${quote(id)},${quote(w)},'업무',${json({ org_scope: scope })});`);
    return { type: 'projects', id, updatedAt: sql(`SELECT updated_at FROM projects WHERE id=${quote(id)}`) };
  };
  const application = (r, target) => {
    const command = normalizeAgentCommand({ commandId: randomUUID(), action: 'create_task', input: { title: '선택한 후속 업무', projectId: target.id } }, { workspaceId: w, actorId: actor, scopes: ['read', 'tasks:write'] });
    assert.equal(command.ok, true);
    const result = call('office_application_claim_v1', [...base(r.requestId), '1', json(command.command), json([target])]);
    return { result, command: command.command };
  };
  const apply = r => call('office_apply_task_v1', base(r.requestId));
  const refresh = r => call('office_application_refresh_v1', base(r.requestId));
  const ready = (changes = {}) => { const r = request(changes), c = claim(r); assert.equal(finish(r, c.request.attempt_token).status, 'generated'); return r; };
  try {
    run('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-F -h '' -k ${root} -p 5432`, '-w', 'start']); running = true;
    sql('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;');
    sql(await readFile(new URL('supabase/setup/00_live_schema.sql', rootUrl), 'utf8'));
    sql(await readFile(new URL('supabase/migrations/20260718_0021_task_description.sql', rootUrl), 'utf8'));
    sql(`CREATE TABLE public.crm_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),entity_type text NOT NULL,kind text NOT NULL,body text NOT NULL,reaction text,contact_id uuid REFERENCES contacts(id),lead_id uuid REFERENCES leads(id),deal_id uuid REFERENCES deals(id),account_id uuid REFERENCES customer_accounts(id),occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());`);
    for (const file of ['20260716_0018_record_contact_outcome.sql', '20260913_0032_agent_commands.sql', '20260921_0036_operating_goals.sql']) sql(await readFile(new URL(`supabase/migrations/${file}`, rootUrl), 'utf8'));
    const source = await readFile(migration, 'utf8'); sql(source); sql(source);
    sql(`INSERT INTO workspaces(id,slug,name) VALUES(${quote(w)},${quote(w)},'Office'),(${quote(other)},${quote(other)},'Other');`);

    await t.test('concurrent claims have one owner; actor, workspace and changed inputs cannot reuse receipts', async () => {
      const r = request(), claimed = await Promise.all(Array.from({ length: 6 }, () => asyncSql(claimStatement(r)).then(JSON.parse)));
      assert.equal(claimed.filter(item => item.claimed).length, 1);
      assert.equal(new Set(claimed.map(item => item.request.attempt_token)).size, 1);
      assert.equal(receipt(r, other).status, 'not-found'); assert.equal(receipt(r, w, 'second').status, 'not-found');
      assert.equal(claim({ ...r, message: '다른 요청' }).status, 'conflict');
      assert.equal(call('office_request_receipt_v1', [...base(r.requestId), json({ ...r, message: '변경' })]).status, 'conflict');
      const token = claimed[0].request.attempt_token;
      assert.equal(finish(r, randomUUID()).status, 'conflict');
      sql(`UPDATE office_requests SET deadline_at=now()-interval '1 second' WHERE id=${quote(r.requestId)}`);
      assert.equal(receipt(r).status, 'unknown'); assert.equal(claim(r).claimed, false);
      assert.equal(finish(r, token).status, 'generated');
      assert.equal(finish(r, token).status, 'generated');
      assert.equal(finish(r, token, { ...generated(r), artifact: { kind: 'text', body: '덮어쓰기' } }).status, 'conflict');
    });
    await t.test('wire-valid near-limit facts and answers survive JSONB formatting overhead', () => {
      const r = request(), c = context(r);
      const facts = { items: Array.from({ length: 100 }, () => 0), note: '' };
      facts.note = 'x'.repeat(24570 - Buffer.byteLength(JSON.stringify(facts)));
      c.facts = facts;
      assert.ok(Buffer.byteLength(JSON.stringify(facts)) <= 24576);
      assert.ok(Number(sql(`SELECT octet_length((${json(facts)})::text)`)) > 24576);
      parseOfficeWorkflowContext(c, r);
      const claimed = call('office_request_claim_v1', [quote(w), quote(actor), json(r), json(c)]);
      assert.equal(claimed.claimed, true);
      const result = { ...generated(r), version: OFFICE_WORKFLOW_VERSION, summary: '확인된 결과', artifact: { kind: 'text', body: '' }, evidence: [], uncertainties: [], dissent: [], nextStep: null,
        context: { contextHash: c.contextHash, asOf: c.asOf, missing: c.missing }, generation: { policyVersion: OFFICE_WORKFLOW_VERSION, promptHash: 'b'.repeat(64), model: 'configured-model', usage: null, elapsedMs: 100 } };
      const remaining = 32760 - Buffer.byteLength(JSON.stringify(result));
      result.artifact.body = '가'.repeat(Math.floor(remaining / 3)) + 'x'.repeat(remaining % 3);
      assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 32768);
      assert.ok(Number(sql(`SELECT octet_length((${json(result)})::text)`)) > 32768);
      const validated = parseOfficeWorkflowResult(result, r, c);
      assert.equal(finish(r, claimed.request.attempt_token, validated).status, 'generated');
    });
    await t.test('origin list is bounded, sorted, actor isolated and excludes generation snapshots', () => {
      const a = ready(), b = ready();
      sql(`UPDATE office_requests SET created_at='2030-01-01T00:00:00Z' WHERE id IN (${quote(a.requestId)},${quote(b.requestId)})`);
      const values = [quote(w), quote(actor), quote(a.intent), quote(a.scope), json(a.originRef), '1'];
      const first = call('office_request_list_v1', [...values, 'null']);
      assert.equal(first.items.length, 2); assert.equal(first.items[0].request.id, [a.requestId, b.requestId].sort().reverse()[0]);
      assert.equal(first.items[0].request.result, undefined); assert.equal(first.items[0].request.attempt_token, undefined);
      const last = first.items[0].request;
      const second = call('office_request_list_v1', [...values, json({ id: last.id, createdAt: last.created_at })]);
      assert.notEqual(second.items[0].request.id, last.id);
      assert.deepEqual(call('office_request_list_v1', [quote(w), quote('second'), ...values.slice(2), 'null']).items, []);
      assert.deepEqual(call('office_request_list_v1', [quote(w), quote(actor), quote(a.intent), quote('classin'), json(a.originRef), '10', 'null']).items, []);
    });
    await t.test('task dispatch replays a saved receipt before checking changed project versions', () => {
      const r = ready(), target = project(), a = application(r, target); assert.equal(a.result.claimed, true);
      const first = apply(r); assert.equal(first.status, 'saved'); assert.equal(first.replayed, false);
      assert.equal(receipt(r).request.application.state, 'pending', 'screen state is a separate transaction');
      sql(`UPDATE projects SET meta='{"org_scope":"classin"}' WHERE id=${quote(target.id)}`);
      const replay = apply(r); assert.equal(replay.status, 'saved'); assert.equal(replay.replayed, true);
      assert.equal(sql(`SELECT count(*) FROM tasks WHERE id=${quote(a.command.commandId)}`), '1');
      assert.equal(refresh(r).request.application.state, 'saved');
      assert.equal(application(r, project()).result.request.application.commandId, a.command.commandId);
    });
    await t.test('unsaved tasks reject stale or different scope references and require a project', () => {
      const r = ready(), target = project('classin'), a = application(r, target);
      assert.equal(apply(r).status, 'conflict'); assert.equal(sql(`SELECT count(*) FROM tasks WHERE id=${quote(a.command.commandId)}`), '0');
      const r2 = ready(), p2 = project(), a2 = application(r2, p2);
      sql(`UPDATE projects SET name='변경' WHERE id=${quote(p2.id)}`);
      assert.equal(apply(r2).status, 'conflict'); assert.equal(sql(`SELECT count(*) FROM tasks WHERE id=${quote(a2.command.commandId)}`), '0');
      const r3 = ready(), id = randomUUID();
      assert.equal(call('office_application_claim_v1', [...base(r3.requestId), '1', json({ commandId: id, targetId: id, action: 'create_task', payload: { title: '누락' } }), json([])]).status, 'invalid-input');
      const disagreement = ready({ scope: 'classin' }); application(disagreement, project('company'));
      assert.equal(apply(disagreement).error, 'scope-rules-disagree');
    });
    await t.test('body expiry preserves unresolved command recovery, then keeps a tombstone after cleanup', () => {
      const r = ready(), target = project(), a = application(r, target);
      sql(`UPDATE office_requests SET expires_at=now()-interval '1 second' WHERE id=${quote(r.requestId)}`);
      assert.equal(receipt(r).status, 'expired'); assert.equal(receipt(r).request.result, null);
      sql('SET ROLE service_role; SELECT office_requests_expire_v1();');
      assert.ok(receipt(r).request.application.command, 'pending normalized command retained');
      assert.equal(claim(r).claimed, false); assert.equal(apply(r).status, 'saved');
      assert.equal(refresh(r).request.application.entityId, a.command.commandId);
      sql('SET ROLE service_role; SELECT office_requests_expire_v1();');
      assert.equal(receipt(r).request.application.command, undefined, 'resolved command body is now removed');
      assert.equal(apply(r).status, 'saved', 'receipt remains usable after payload removal');
      assert.equal(refresh(r).request.application.receipt, undefined, 'status reads do not restore expired task receipt text');
      const noApp = ready(); sql(`UPDATE office_requests SET expires_at=now()-interval '1 second' WHERE id=${quote(noApp.requestId)}`);
      assert.equal(application(noApp, target).result.status, 'expired');
    });
    await t.test('same generic command commits before a waiting wrapper; later scope change cannot erase its receipt', async () => {
      const r = ready(), target = project(), a = application(r, target);
      const held = asyncSql(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended(${quote(`${w}:${actor}:${a.command.commandId}`)},0)); SELECT public.agent_command_v1(${quote(w)},${quote(actor)},ARRAY['read','tasks:write'],${json(a.command)}); SELECT pg_sleep(0.2); UPDATE projects SET meta='{"org_scope":"classin"}' WHERE id=${quote(target.id)}; COMMIT;`);
      // Wait until the first session owns the command lock, without sleeping on
      // a guessed race interval or relying on an old not-found response.
      for (let n = 0; n < 60; n += 1) {
        if (sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted") !== '0') break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      const result = JSON.parse(await asyncSql(statement('office_apply_task_v1', base(r.requestId))));
      await held;
      assert.equal(result.status, 'saved'); assert.equal(result.replayed, true);
    });
    await t.test('scope row writes wait for the wrapper transaction before changing future task classification', async () => {
      const r = ready(), target = project(); application(r, target);
      const dispatched = asyncSql(`BEGIN; ${statement('office_apply_task_v1', base(r.requestId))} SELECT pg_sleep(0.2); COMMIT;`);
      let sawLock = false;
      for (let n = 0; n < 60; n += 1) {
        sawLock = sql(`SELECT count(*) FROM pg_locks WHERE relation='projects'::regclass AND mode='RowShareLock' AND granted`) !== '0';
        if (sawLock) break; await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.equal(sawLock, true);
      const updated = asyncSql(`UPDATE projects SET meta='{"org_scope":"classin"}' WHERE id=${quote(target.id)}; SELECT 'changed';`);
      const output = await dispatched; assert.equal(JSON.parse(output.split('\n')[0]).status, 'saved'); await updated;
    });
    await t.test('client roles cannot read the table or execute any receipt/apply function', () => {
      assert.equal(sql("SELECT has_table_privilege('anon','office_requests','SELECT')"), 'f');
      const functions = sql("SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'office_%'").split('\n');
      for (const fn of functions) {
        assert.equal(sql(`SELECT has_function_privilege('anon',${quote(fn)},'EXECUTE')`), 'f', fn);
        assert.equal(sql(`SELECT has_function_privilege('authenticated',${quote(fn)},'EXECUTE')`), 'f', fn);
      }
    });
  } finally {
    if (running) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    await rm(root, { recursive: true, force: true });
  }
});
