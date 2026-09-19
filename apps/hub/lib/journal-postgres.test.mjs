// macOS: LC_ALL 이 없으면 postmaster 가 기동 중 multithreaded 로 판정되어
// `FATAL: postmaster became multithreaded during startup` 으로 죽는다 (2026-09-19).
// DB 로케일은 initdb --no-locale 로 이미 C 이므로 동작은 바뀌지 않는다.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

// Opt in to a new disposable, socket-only PostgreSQL cluster. Never reads .env.
// JOURNAL_POSTGRES_TEST=1 node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/journal-postgres.test.mjs
const enabled = process.env.JOURNAL_POSTGRES_TEST === '1';
const root = new URL('../../../', import.meta.url);
const migration = new URL('supabase/migrations/20260913_0027_journal_notes.sql', root);
const W = '11111111-1111-4111-8111-111111111111';
const O = '22222222-2222-4222-8222-222222222222';
const OWNER = '77777777-7777-4777-8777-777777777777';
const id = (n) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const request = (n) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const note = (extra = {}) => ({ action: 'save', entryId: id(1), expectedRevision: 0, body: '  앞 🌓 반복\n반복 뒤  ', title: '', occurredAt: '2026-09-13T12:30:00+09:00', noteMeta: { kind: 'note', enhancement: '' }, contexts: [], ...extra });
const reuse = (extra = {}) => ({ action: 'create_task', entryId: id(1), expectedRevision: 1, selection: { prefix: '  앞 🌓 반복\n', text: '반복', suffix: ' 뒤  ' }, target: { title: '후속 연락', dueAt: null, projectId: id(100) }, ...extra });
const command = (body, n, workspace = W) => `select public.journal_workflow_v1('${workspace}','${request(n)}',${literal(JSON.stringify(body))}::jsonb);`;

test('journal PostgreSQL atomic persistence, reuse, isolation and permissions', { skip: !enabled }, async (t) => {
  assert.equal(existsSync(migration), true, 'journal note migration must exist');
  const directory = mkdtempSync(join(tmpdir(), 'journal-notes-pg-'));
  const data = join(directory, 'data');
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', '55493', '-U', 'journal_test', '-d', 'postgres'];
  const sql = (source) => execFileSync('psql', args, { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const json = (source) => JSON.parse(sql(source));
  const run = async (source) => JSON.parse((await promisify(execFile)('psql', [...args, '-c', source])).stdout.trim());
  let started = false;
  try {
    execFileSync('initdb', ['-D', data, '-U', 'journal_test', '-A', 'trust', '--no-locale', '--encoding=UTF8'], { stdio: 'pipe', env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });
    execFileSync('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-F -k ${directory} -p 55493 -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe', env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
    for (const file of ['supabase/setup/00_live_schema.sql', 'supabase/migrations/20260617_0007_content_idea_cadence.sql', 'supabase/migrations/20260718_0021_task_description.sql', 'supabase/migrations/20260912_0025_daily_review_journal.sql', 'supabase/migrations/20260912_0026_content_workflow.sql', 'supabase/migrations/20260913_0027_journal_notes.sql']) sql(readFileSync(new URL(file, root), 'utf8'));
    sql(`insert into public.profiles(id,email) values('${OWNER}','journal-test@example.invalid');
      insert into public.workspaces(id,name,slug,owner_id) values('${W}','Journal Test','journal-test','${OWNER}'),('${O}','Other','other',null);
      insert into public.projects(id,workspace_id,name) values('${id(100)}','${W}','프로젝트'),('${id(101)}','${O}','외부 프로젝트');
      insert into public.leads(id,workspace_id,name) values('${id(102)}','${W}','리드');
      insert into public.customer_accounts(id,workspace_id,name) values('${id(103)}','${W}','고객');
      insert into public.brands(id,workspace_id,name,slug) values('${id(104)}','${W}','브랜드','brand'),('${id(105)}','${O}','외부 브랜드','other-brand');`);

    await t.test('multiple manual notes with the same day and text retain whitespace and no dedupe hash', () => {
      for (let n = 1; n <= 2; n++) {
        const result = json(command(note({ entryId: id(n) }), n));
        assert.equal(result.status, 'saved');
        assert.equal(result.entry.body, note().body);
        assert.equal(result.entry.note_revision, 1);
        assert.equal(result.entry.content_hash, null);
        assert.deepEqual(result.entry.review_data, {});
      }
      assert.equal(sql(`select count(*) from public.journal_entries where workspace_id='${W}' and entry_kind='note'`), '2');
    });
    await t.test('daily reviews keep their date uniqueness, review fields and separate revision', () => {
      const reviewSql = `select public.save_daily_review_v1('${W}','2026-09-13','Asia/Seoul',2,'목표','0','회고',0,'${request(90)}');`;
      const result = json(reviewSql);
      assert.equal(result.status, 'saved');
      assert.equal(result.review.review_revision, 1);
      assert.deepEqual(result.review.review_data, { energy: 2, progress: 0 });
      const again = json(reviewSql.replace(request(90), request(91)));
      assert.equal(again.status, 'conflict');
      assert.equal(json(command(note({ entryId: result.review.id, expectedRevision: 1 }), 92)).status, 'invalid-input');
      assert.equal(sql(`select body from public.journal_entries where id='${result.review.id}'`), '회고');
    });
    await t.test('context save stores actual scoped links and snapshots and update preserves history', () => {
      const contexts = ['project', 'lead', 'account', 'brand'].map((type, i) => ({ type, id: id([100, 102, 103, 104][i]) }));
      const saved = json(command(note({ entryId: id(3), contexts }), 3));
      assert.equal(saved.status, 'saved');
      assert.equal(saved.entry.contexts.length, 4);
      assert.equal(saved.entry.contexts.find((v) => v.type === 'account').href, `/dashboard/revenue/customers?customer=account%3A${id(103)}`);
      const updated = json(command(note({ entryId: id(3), expectedRevision: 1, body: '새 원문', contexts: contexts.slice(0, 1), noteMeta: { kind: 'idea', enhancement: '답변' } }), 4));
      assert.equal(updated.entry.note_revision, 2);
      assert.equal(updated.entry.review_revision, 1);
      assert.equal(updated.entry.contexts.length, 1);
      assert.equal(json(`select snapshot->'body' from public.journal_note_revisions where journal_id='${id(3)}' and revision=1`), note().body);
      assert.equal(sql(`select jsonb_array_length(snapshot->'contexts') from public.journal_note_revisions where journal_id='${id(3)}' and revision=1`), '4');
    });
    await t.test('foreign workspace contexts and targets never create or change rows', () => {
      for (const input of [note({ entryId: id(4), contexts: [{ type: 'project', id: id(101) }] }), reuse({ target: { title: 'bad', projectId: id(101), dueAt: null } }), reuse({ action: 'create_content', target: { title: 'bad', brandId: id(105), channel: 'threads' } })]) {
        assert.equal(json(command(input, 5)).status, 'invalid-input');
      }
      assert.equal(sql(`select count(*) from public.journal_workflow_receipts where request_id='${request(5)}'`), '0');
      assert.equal(sql(`select count(*) from public.tasks where workspace_id='${W}'`), '0');
      assert.equal(sql(`select count(*) from public.content_items where workspace_id='${W}'`), '0');
    });
    await t.test('selected second repeated Unicode excerpt creates a canonical task and source ref only once', () => {
      const result = json(command(reuse(), 6));
      assert.equal(result.status, 'saved');
      assert.equal(result.target.type, 'task');
      assert.equal(result.link.excerpt, '반복');
      assert.equal(result.link.sourceRevision, 1);
      const task = json(`select to_jsonb(t) from public.tasks t where id='${result.target.id}'`);
      assert.equal(task.owner_id, OWNER);
      assert.equal(task.status, 'todo');
      assert.equal(task.priority, 'medium');
      assert.equal(task.project_id, id(100));
      assert.equal(task.due_at, null);
      assert.equal(task.description, `반복\n\n원문: /dashboard/work/memos?note=${id(1)}`);
      assert.deepEqual(task.meta, { source: 'journal', source_refs: [{ type: 'journal', journal_id: id(1), revision: 1, excerpt: '반복', href: `/dashboard/work/memos?note=${id(1)}` }] });
      const duplicate = json(command(reuse(), 6));
      assert.equal(duplicate.status, 'duplicate');
      assert.deepEqual(duplicate.target, result.target);
      assert.equal(sql(`select count(*) from public.tasks where workspace_id='${W}'`), '1');
      const changed = json(command(reuse({ target: { title: 'different', dueAt: null, projectId: null } }), 6));
      assert.equal(changed.status, 'conflict');
      assert.equal(changed.error, 'request-id-reused');
    });
    await t.test('content reuse creates an empty draft with selected evidence and durable source refs in initial revision', () => {
      const input = reuse({ action: 'create_content', target: { title: '아이디어', brandId: id(104), channel: 'threads' } });
      const result = json(command(input, 7));
      assert.equal(result.status, 'saved');
      assert.equal(result.target.type, 'content');
      assert.equal(result.target.href, `/dashboard/content/studio?item=${result.target.id}&variant=${result.target.variantId}`);
      const item = json(`select to_jsonb(t) from public.content_items t where id='${result.target.id}'`);
      const variant = json(`select to_jsonb(t) from public.content_variants t where id='${result.target.variantId}'`);
      assert.equal(item.source_idea, '반복');
      assert.equal(item.meta.brief.evidence, '반복');
      assert.equal(variant.body, '');
      assert.equal(variant.status, 'draft');
      assert.equal(variant.variant_type, 'x_thread');
      assert.equal(variant.channel, 'threads');
      assert.deepEqual(variant.meta.source_refs, item.meta.source_refs);
      const snapshot = json(`select snapshot from public.content_revisions where variant_id='${result.target.variantId}' order by created_at limit 1`);
      assert.deepEqual(snapshot.meta.source_refs, item.meta.source_refs);
      assert.equal(snapshot.updated_at, variant.updated_at);
      const duplicate = json(command(input, 7));
      assert.equal(duplicate.status, 'duplicate');
      assert.deepEqual(duplicate.target, result.target);
      assert.equal(sql(`select count(*) from public.content_items where workspace_id='${W}'`), '1');
    });
    await t.test('stale source revision or mismatched prefix/text/suffix cannot create a target', () => {
      for (const input of [reuse({ expectedRevision: 2 }), reuse({ selection: { prefix: 'wrong ', text: '반복', suffix: ' 뒤  ' } }), reuse({ selection: { prefix: '', text: ' \n', suffix: '' } })]) {
        const result = json(command(input, 8));
        assert.ok(['conflict', 'invalid-input'].includes(result.status));
        if (result.status === 'conflict') assert.equal(result.entry.note_revision, 1);
      }
      assert.equal(sql(`select count(*) from public.tasks where workspace_id='${W}'`), '1');
    });
    await t.test('replay after later edit returns latest note without creating another target', () => {
      assert.equal(json(command(note({ expectedRevision: 1, body: '수정한 원문' }), 9)).status, 'saved');
      const replay = json(command(reuse(), 6));
      assert.equal(replay.status, 'duplicate');
      assert.equal(replay.entry.body, '수정한 원문');
      assert.equal(replay.link.sourceRevision, 1);
      assert.equal(sql(`select count(*) from public.tasks where workspace_id='${W}'`), '1');
    });
    await t.test('concurrent distinct revisions conflict and identical requests replay atomically', async () => {
      const saved = json(command(note({ entryId: id(10) }), 10));
      assert.equal(saved.status, 'saved');
      const edits = await Promise.all([run(command(note({ entryId: id(10), expectedRevision: 1, body: 'A' }), 11)), run(command(note({ entryId: id(10), expectedRevision: 1, body: 'B' }), 12))]);
      assert.deepEqual(edits.map((r) => r.status).sort(), ['conflict', 'saved']);
      const input = note({ entryId: id(11) });
      const duplicates = await Promise.all([run(command(input, 13)), run(command(input, 13))]);
      assert.deepEqual(duplicates.map((r) => r.status).sort(), ['duplicate', 'saved']);
      assert.equal(sql(`select count(*) from public.journal_entries where id='${id(11)}'`), '1');
    });
    await t.test('target and link failures roll back targets, source links, revisions and both receipts', () => {
      sql(`create function public.journal_test_fail() returns trigger language plpgsql as $$ begin raise exception 'private failure'; end $$;`);
      for (const table of ['tasks', 'journal_links', 'journal_workflow_receipts']) {
        const counts = sql(`select jsonb_build_array((select count(*) from public.tasks),(select count(*) from public.content_items),(select count(*) from public.content_variants),(select count(*) from public.content_revisions),(select count(*) from public.journal_links),(select count(*) from public.journal_workflow_receipts),(select count(*) from public.content_workflow_receipts))`);
        sql(`create trigger journal_test_fail before insert on public.${table} for each row execute function public.journal_test_fail();`);
        const input = reuse({ entryId: id(2) });
        const result = json(command(input, 14));
        assert.equal(result.status, 'error', table);
        if (table !== 'tasks') assert.equal(json(command({ ...input, action: 'create_content', target: { title: 'rollback', brandId: null, channel: 'threads' } }, 15)).status, 'error');
        sql(`drop trigger journal_test_fail on public.${table}`);
        assert.equal(sql(`select jsonb_build_array((select count(*) from public.tasks),(select count(*) from public.content_items),(select count(*) from public.content_variants),(select count(*) from public.content_revisions),(select count(*) from public.journal_links),(select count(*) from public.journal_workflow_receipts),(select count(*) from public.content_workflow_receipts))`), counts);
      }
    });
    await t.test('a nested content RPC error rolls back its partial writes in the outer transaction', () => {
      sql(`alter function public.content_workflow_v1(uuid,uuid,text,jsonb) rename to content_workflow_original_test;
        create function public.content_workflow_v1(uuid,uuid,text,jsonb) returns jsonb language plpgsql as $$ begin
          insert into public.content_items(workspace_id,title) values($1,'must roll back');
          return '{"status":"invalid-input","error":"private failure"}'::jsonb;
        end $$;`);
      const before = sql('select count(*) from public.content_items');
      const result = json(command(reuse({ entryId: id(2), action: 'create_content', target: { title: 'invalid nested', brandId: null, channel: 'threads' } }), 16));
      assert.equal(result.status, 'invalid-input');
      assert.equal(sql('select count(*) from public.content_items'), before);
      assert.equal(sql(`select count(*) from public.journal_workflow_receipts where request_id='${request(16)}'`), '0');
      sql('drop function public.content_workflow_v1(uuid,uuid,text,jsonb); alter function public.content_workflow_original_test(uuid,uuid,text,jsonb) rename to content_workflow_v1;');
    });
    await t.test('deleted contexts become unavailable without destroying the memo or disclosing foreign rows', () => {
      sql(`delete from public.projects where id='${id(100)}'`);
      const entry = json(`select public.journal_note_entry_v1('${W}','${id(3)}')`);
      assert.equal(entry.contexts[0].label, '연결 대상 없음');
      assert.equal(entry.contexts[0].href, null);
      assert.equal(sql(`select public.journal_note_entry_v1('${O}','${id(3)}')`), '');
    });
    await t.test('SQL rejects malformed commands and direct notes preserve daily-review constraints', () => {
      for (const input of [note({ body: '' }), note({ body: ' \n\t' }), note({ title: 'x'.repeat(201) }), note({ expectedRevision: -1 }), note({ expectedRevision: 0.5 }), note({ expectedRevision: '1' }), note({ body: 23 }), note({ occurredAt: '2026-02-30T00:00:00Z' }), note({ noteMeta: { kind: 'invalid', enhancement: '' } }), note({ contexts: null }), reuse({ selection: { prefix: '', text: 'x'.repeat(3501), suffix: '' } }), reuse({ target: { title: 'bad', dueAt: 'today', projectId: null } })]) {
        assert.equal(json(command({ ...input, entryId: id(20) }, 20)).status, 'invalid-input');
      }
      assert.throws(() => sql(`update public.journal_entries set review_data='{"energy":2}' where id='${id(1)}'`));
    });
    await t.test('context search is scoped, bounded, exact and treats wildcard punctuation literally', () => {
      sql(`insert into public.leads(workspace_id,name) select '${W}','search '||n from generate_series(1,35) n;
        insert into public.leads(id,workspace_id,name) values('${id(150)}','${W}',${literal('a%_\\*(,')});
        insert into public.leads(workspace_id,name) values('${O}',${literal('a%_\\*(,')});`);
      const search = (q, exact = null) => json(`select public.journal_context_search_v1('${W}','lead',${literal(q)},${exact ? literal(exact) + '::uuid' : 'null'})`);
      const bounded = search('search ');
      assert.equal(bounded.contexts.length, 30);
      assert.equal(bounded.hasMore, true);
      const literalMatch = search('a%_\\*(,');
      assert.deepEqual(literalMatch.contexts.map((r) => r.id), [id(150)]);
      assert.equal(literalMatch.hasMore, false);
      assert.equal(search('not matching', id(150)).contexts[0].id, id(150));
      assert.equal(search('', id(999)).contexts.length, 0);
    });
    await t.test('RLS and RPC execution stay service-only and migration reapply preserves state', () => {
      const signature = 'public.journal_workflow_v1(uuid,uuid,jsonb)';
      for (const role of ['anon', 'authenticated']) {
        assert.equal(sql(`select has_function_privilege('${role}','${signature}','EXECUTE')`), 'f');
        assert.equal(sql(`select has_table_privilege('${role}','public.journal_note_revisions','SELECT,INSERT')`), 'f');
      }
      assert.equal(sql(`select has_function_privilege('service_role','${signature}','EXECUTE')`), 't');
      assert.equal(sql("select bool_and(relrowsecurity) from pg_class where relname in ('journal_note_revisions','journal_links','journal_workflow_receipts')"), 't');
      const before = sql('select count(*) from public.journal_entries');
      sql(readFileSync(migration, 'utf8'));
      assert.equal(sql('select count(*) from public.journal_entries'), before);
      assert.equal(json(command(note({ entryId: id(2) }), 2)).status, 'duplicate');
    });
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe', env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });
    rmSync(directory, { recursive: true, force: true });
  }
});
