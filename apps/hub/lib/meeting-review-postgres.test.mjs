import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Opt in to an isolated socket-only cluster; never reads the application's env.
const enabled = process.env.MEETING_REVIEW_POSTGRES_TEST === '1'
  && process.getuid?.() !== 0
  && ['initdb', 'pg_ctl', 'psql'].every((name) => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
const root = new URL('../../../', import.meta.url);
const workspace = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const owner = '77777777-7777-4777-8777-777777777777';
const journal = '33333333-3333-4333-8333-333333333333';
const request = '44444444-4444-4444-8444-444444444444';
const requestTwo = '55555555-5555-4555-8555-555555555555';
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

test('meeting review PostgreSQL receipts, evidence, scope and task recovery', { skip: !enabled }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'meeting-review-pg-'));
  const data = join(directory, 'data');
  const port = String(56000 + Math.floor(Math.random() * 3000));
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', port, '-U', 'meeting_test', '-d', 'postgres'];
  const env = { ...process.env, LC_ALL: process.env.LC_ALL || 'C' };
  const sql = (source) => execFileSync('psql', args, { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const json = (source) => JSON.parse(sql(source));
  let started = false;
  try {
    execFileSync('initdb', ['-D', data, '-U', 'meeting_test', '-A', 'trust', '--no-locale', '--encoding=UTF8'], { stdio: 'pipe', env });
    execFileSync('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-F -k ${directory} -p ${port} -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe', env });
    started = true;
    sql('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;');
    for (const name of [
      'supabase/setup/00_live_schema.sql',
      'supabase/migrations/20260617_0007_content_idea_cadence.sql',
      'supabase/migrations/20260718_0021_task_description.sql',
      'supabase/migrations/20260912_0025_daily_review_journal.sql',
      'supabase/migrations/20260912_0026_content_workflow.sql',
      'supabase/migrations/20260913_0027_journal_notes.sql',
      'supabase/migrations/20260923_0045_meeting_text_review.sql',
      'supabase/migrations/20260923_0046_meeting_action_plans.sql',
    ]) sql(readFileSync(new URL(name, root), 'utf8'));
    sql(`insert into public.profiles(id,email) values('${owner}','meeting-test@example.invalid');
      insert into public.workspaces(id,name,slug,owner_id) values('${workspace}','Meeting Test','meeting-test','${owner}'),('${foreign}','Foreign','foreign',null);
      insert into public.journal_entries(id,workspace_id,entry_kind,body,title,occurred_at,note_meta,note_revision)
        values('${journal}','${workspace}','note','고객은 2026-09-30에 100개를 검토한다. 🌓 후속 연락은 내가 한다.','회의','2026-09-23T00:00:00Z','{"kind":"note","enhancement":""}',1);`);
    const claim = () => json(`select public.meeting_review_claim_v1('${workspace}','${journal}',1,'${request}')`);
    assert.equal(claim().status, 'claimed');
    assert.equal(claim().status, 'existing');
    assert.equal(json(`select public.meeting_review_claim_v1('${foreign}','${journal}',1,'${request}')`).status, 'conflict');
    assert.equal(json(`select public.meeting_review_claim_v1('${foreign}','${journal}',1,'${requestTwo}')`).status, 'not-found');
    const text = '고객은 2026-09-30에 100개를 검토한다. 🌓 후속 연락은 내가 한다.';
    const quote = '후속 연락은 내가 한다.';
    const offset = text.indexOf(quote);
    const proposal = { kind: 'action', text: '후속 연락', quote, start: offset, end: offset + quote.length, certainty: 'stated' };
    const planProposal = { ...proposal, text: '후속 연락 단계', actionScope: 'mine',
      relation: { quote, start: offset, end: offset + quote.length }, dateMentions: [], methodQuote: '연락', checklist: [] };
    const otherQuote = '고객은 2026-09-30에 100개를 검토한다.';
    const pendingProposal = { kind: 'action', text: '고객 검토', quote: otherQuote, start: 0, end: otherQuote.length, certainty: 'stated' };
    const relatedProposal = { ...pendingProposal, text: '고객 검토 결과 주시', actionScope: 'related',
      relation: { quote: otherQuote, start: 0, end: otherQuote.length }, dateMentions: [], methodQuote: null, checklist: [] };
    const titleQuote = '2026-09-30에 100개';
    const titleOffset = text.indexOf(titleQuote);
    const wrongTitleProposal = { kind: 'action', text: '검토 안내', quote: titleQuote, start: titleOffset, end: titleOffset + titleQuote.length, certainty: 'stated' };
    const finish = (value) => json(`select public.meeting_review_finish_v2('${workspace}','${journal}','${request}',${literal(JSON.stringify(value))}::jsonb)`);
    const invalid = finish({ state: 'ready', summary: '요약', proposals: [proposal, { ...proposal, quote: '원문 밖' }], model: 'test' });
    assert.equal(invalid.status, 'invalid-input');
    assert.equal(sql('select count(*) from public.meeting_review_proposals'), '0');
    const result = finish({ state: 'ready', summary: '고객 검토와 후속 연락', proposals: [proposal, pendingProposal, wrongTitleProposal, planProposal, relatedProposal], model: 'test', usage: { promptTokens: 10, totalTokens: 13 } });
    assert.equal(result.status, 'saved');
    assert.equal(result.snapshot.run.state, 'ready');
    assert.equal(result.snapshot.proposals.length, 6);
    const action = result.snapshot.proposals.find((p) => p.text === '후속 연락');
    const pendingAction = result.snapshot.proposals.find((p) => p.text === '고객 검토');
    const wrongTitleAction = result.snapshot.proposals.find((p) => p.text === '검토 안내');
    const plannedAction = result.snapshot.proposals.find((p) => p.text === '후속 연락 단계');
    const relatedAction = result.snapshot.proposals.find((p) => p.text === '고객 검토 결과 주시');
    const summary = result.snapshot.proposals.find((p) => p.kind === 'summary');
    assert.deepEqual(action.source, { start: offset, end: offset + quote.length, quote });
    assert.equal(action.certainty, 'stated');
    assert.equal(plannedAction.actionScope, 'mine');
    assert.equal(plannedAction.methodQuote, '연락');
    assert.equal(relatedAction.actionScope, 'related');
    assert.equal(summary.source, null);
    assert.equal(result.snapshot.usage.status, 'known');
    assert.equal(finish({ state: 'error', error: 'late' }).status, 'existing');
    assert.equal(json(`select public.meeting_review_decide_v1('${workspace}','${journal}','${action.id}','accepted','수정한 후속 연락')`).status, 'saved');
    assert.equal(json(`select public.meeting_review_decide_v1('${workspace}','${journal}','${action.id}','accepted','수정한 후속 연락')`).status, 'duplicate');
    const selected = json(`select public.meeting_review_snapshot_v1('${workspace}','${journal}','${request}')`);
    assert.equal(selected.proposals.find((p) => p.id === action.id).review.text, '수정한 후속 연락');
    assert.equal(selected.proposals.find((p) => p.id === action.id).application.status, 'none');
    assert.equal(json(`select public.meeting_review_snapshot_v1('${foreign}','${journal}',null)`).status, 'not-found');
    const createTask = (proposalId, excerpt, title) => {
      const at = text.indexOf(excerpt);
      const selection = { prefix: text.slice(0, at), text: excerpt, suffix: text.slice(at + excerpt.length) };
      return json(`select public.journal_workflow_v1('${workspace}','${proposalId}',${literal(JSON.stringify({ action: 'create_task', entryId: journal, expectedRevision: 1, selection, target: { title, dueAt: null, projectId: null } }))}::jsonb)`);
    };
    // A generic journal command must not certify an unreviewed meeting claim.
    assert.equal(createTask(pendingAction.id, otherQuote, '고객 검토').status, 'saved');
    assert.equal(json(`select public.meeting_review_snapshot_v1('${workspace}','${journal}','${request}')`).proposals.find((p) => p.id === pendingAction.id).application.status, 'unknown');
    // Even after review, a receipt with a different title is not this claim's application.
    assert.equal(json(`select public.meeting_review_decide_v1('${workspace}','${journal}','${wrongTitleAction.id}','accepted','검토 안내')`).status, 'saved');
    assert.equal(createTask(wrongTitleAction.id, titleQuote, '다른 제목').status, 'saved');
    assert.equal(json(`select public.meeting_review_snapshot_v1('${workspace}','${journal}','${request}')`).proposals.find((p) => p.id === wrongTitleAction.id).application.status, 'unknown');
    const selection = { prefix: text.slice(0, offset), text: quote, suffix: text.slice(offset + quote.length) };
    const task = json(`select public.journal_workflow_v1('${workspace}','${action.id}',${literal(JSON.stringify({ action: 'create_task', entryId: journal, expectedRevision: 1, selection, target: { title: '수정한 후속 연락', dueAt: null, projectId: null } }))}::jsonb)`);
    assert.equal(task.status, 'saved');
    const applied = json(`select public.meeting_review_snapshot_v1('${workspace}','${journal}','${request}')`);
    assert.equal(applied.proposals.find((p) => p.id === action.id).application.status, 'saved');
    assert.equal(applied.proposals.find((p) => p.id === action.id).application.targetId, task.target.id);
    const step = { id: '66666666-6666-4666-8666-666666666666', title: '고객에게 연락', done: false, note: '' };
    const execution = { actionScope: 'mine', dueAt: '2026-09-30', method: '전화로 확인', checklist: [step] };
    const relatedExecution = { actionScope: 'related', dueAt: '2026-09-30', method: '결과 확인', checklist: [] };
    const relatedReview = (title, plan) => json(`select public.meeting_review_decide_v2('${workspace}','${journal}','${relatedAction.id}','accepted',${literal(title)},${literal(JSON.stringify(plan))}::jsonb)`);
    assert.equal(relatedReview('고객 검토 결과 주시', relatedExecution).status, 'saved');
    assert.equal(json(`select public.meeting_review_snapshot_v2('${workspace}','${journal}','${request}')`).proposals.find((p) => p.id === relatedAction.id).application.status, 'none');
    assert.equal(relatedReview('고객 검토 결과 주시', { ...relatedExecution, actionScope: 'mine' }).error, 'watch-needs-owned-action');
    assert.equal(relatedReview('고객 검토 결과 내가 확인', { ...relatedExecution, actionScope: 'mine' }).status, 'saved');
    assert.equal(sql(`select public.meeting_review_execution_valid_v1(${literal(JSON.stringify(execution))}::jsonb)`), 't');
    const decidePlan = (plan) => json(`select public.meeting_review_decide_v2('${workspace}','${journal}','${plannedAction.id}','accepted','후속 연락 단계 실행',${literal(JSON.stringify(plan))}::jsonb)`);
    assert.equal(decidePlan(execution).status, 'saved');
    assert.equal(decidePlan(execution).status, 'duplicate');
    const planTarget = { title: '후속 연락 단계 실행', dueAt: '2026-09-30T00:00:00+09:00', projectId: null,
      nextAction: execution.method, checklist: execution.checklist };
    const plannedCommand = { action: 'create_task', entryId: journal, expectedRevision: 1, selection, target: planTarget };
    const plannedTask = json(`select public.journal_workflow_v1('${workspace}','${plannedAction.id}',${literal(JSON.stringify(plannedCommand))}::jsonb)`);
    assert.equal(plannedTask.status, 'saved');
    assert.equal(json(`select public.journal_workflow_v1('${workspace}','${plannedAction.id}',${literal(JSON.stringify(plannedCommand))}::jsonb)`).status, 'duplicate');
    assert.equal(json(`select public.journal_workflow_v1('${workspace}','${plannedAction.id}',${literal(JSON.stringify({ ...plannedCommand,
      target: { ...planTarget, dueAt: '2026-10-01T00:00:00+09:00' } }))}::jsonb)`).error, 'request-id-reused');
    assert.equal(sql(`select next_action from public.tasks where id='${plannedTask.target.id}'`), '전화로 확인');
    assert.deepEqual(json(`select meta->'checklist' from public.tasks where id='${plannedTask.target.id}'`), [step]);
    assert.equal(json(`select public.meeting_review_snapshot_v2('${workspace}','${journal}','${request}')`).proposals.find((p) => p.id === plannedAction.id).application.status, 'saved');
    sql(`update public.tasks set meta=jsonb_set(meta,'{checklist,0,done}','true'::jsonb) where id='${plannedTask.target.id}'`);
    assert.equal(json(`select public.meeting_review_snapshot_v2('${workspace}','${journal}','${request}')`).proposals.find((p) => p.id === plannedAction.id).application.status, 'saved');
    assert.equal(decidePlan({ ...execution, method: '다른 방법' }).error, 'already-applied');
    const badRequest = '88888888-8888-4888-8888-888888888888';
    const badCommand = { ...plannedCommand, target: { ...planTarget, title: '유효하지 않은 단계', checklist: [step, step] } };
    assert.equal(json(`select public.journal_workflow_v1('${workspace}','${badRequest}',${literal(JSON.stringify(badCommand))}::jsonb)`).status, 'invalid-input');
    assert.equal(sql(`select count(*) from public.tasks where title='유효하지 않은 단계'`), '0');
    assert.equal(sql(`select count(*) from public.journal_workflow_receipts where request_id='${badRequest}'`), '0');
    assert.equal(json(`select public.meeting_review_decide_v1('${workspace}','${journal}','${action.id}','accepted','바뀐 제목')`).error, 'already-applied');
    sql(`delete from public.tasks where id='${task.target.id}'`);
    assert.equal(json(`select public.meeting_review_snapshot_v1('${workspace}','${journal}','${request}')`).proposals.find((p) => p.id === action.id).application.status, 'unknown');
    sql(`update public.journal_entries set body='새 원문',note_revision=2 where id='${journal}'`);
    assert.equal(json(`select public.meeting_review_snapshot_v1('${workspace}','${journal}',null)`).run.stale, true);
    assert.equal(json(`select public.meeting_review_decide_v1('${workspace}','${journal}','${summary.id}','accepted','요약')`).status, 'conflict');
    assert.equal(json(`select public.meeting_review_claim_v1('${workspace}','${journal}',2,'${requestTwo}')`).status, 'claimed');
    sql(`update public.meeting_review_runs set deadline_at=clock_timestamp()-interval '1 second' where request_id='${requestTwo}'`);
    assert.equal(json(`select public.meeting_review_snapshot_v1('${workspace}','${journal}','${requestTwo}')`).run.state, 'unknown');
    assert.equal(json(`select public.meeting_review_claim_v1('${workspace}','${journal}',2,'${requestTwo}')`).status, 'existing');
    assert.equal(sql("select bool_and(relrowsecurity) from pg_class where relname in ('meeting_review_runs','meeting_review_proposals')"), 't');
    assert.equal(sql("select has_function_privilege('authenticated','public.meeting_review_claim_v1(uuid,uuid,bigint,uuid)','execute')"), 'f');
    assert.equal(sql("select has_function_privilege('authenticated','public.meeting_review_decide_v2(uuid,uuid,uuid,text,text,jsonb)','execute')"), 'f');
    sql(readFileSync(new URL('supabase/migrations/20260923_0046_meeting_action_plans.sql', root), 'utf8'));
    assert.equal(sql("select count(*) from pg_trigger where tgname='journal_task_plan_receipt' and not tgisinternal"), '1');
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe', env });
    rmSync(directory, { recursive: true, force: true });
  }
});
