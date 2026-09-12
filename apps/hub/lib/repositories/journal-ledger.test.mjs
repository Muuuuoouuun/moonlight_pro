import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import * as ledger from './journal-ledger.js';
const W = '11111111-1111-4111-8111-111111111111';
const O = '22222222-2222-4222-8222-222222222222';
const id = (n) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const R = '44444444-4444-4444-8444-444444444444';
const input = { action: 'save', entryId: id(1), requestId: R, expectedRevision: 0, body: '줄 하나\n둘', title: '', occurredAt: '2026-09-13T01:00:00Z', noteMeta: { kind: 'note', enhancement: '' }, contexts: [] };
const row = (extra = {}) => ({ id: id(1), workspace_id: W, entry_kind: 'note', body: input.body, title: '', occurred_at: input.occurredAt, note_meta: input.noteMeta, note_revision: 1, updated_at: '2026-09-13T01:00:00Z', ...extra });
const keys = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'COM_MOON_DEFAULT_WORKSPACE_ID', 'DEFAULT_WORKSPACE_ID'];
const env = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
const fetch = globalThis.fetch;
const error = console.error;
let state;
beforeEach(() => {
  keys.forEach((k) => delete process.env[k]);
  process.env.SUPABASE_URL = 'https://journal.example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = W;
  state = { calls: [], workspaces: [{ id: W }], rows: [], links: [], contexts: [], rpc: { status: 'saved', entry: row({ contexts: [], links: [] }) }, search: { status: 'live', workspaceId: W, contexts: [], hasMore: false }, failure: null, bypass: false };
  console.error = () => {};
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target), table = url.pathname.split('/').at(-1), body = options.body ? JSON.parse(options.body) : null;
    state.calls.push({ url, table, body, options });
    if (state.failure === table) return new Response('private database credentials', { status: 500 });
    if (url.pathname.includes('/rpc/')) return Response.json(table === 'journal_context_search_v1' ? state.search : state.rpc);
    let rows = table === 'workspaces' ? state.workspaces : table === 'journal_entries' ? state.rows : table === 'journal_links' ? state.links : state.contexts;
    if (state.bypass || !Array.isArray(rows)) return Response.json(rows);
    rows = rows.filter((r) => [...url.searchParams].every(([k, v]) => !v.startsWith('eq.') || String(r[k]) === v.slice(3)));
    if (url.searchParams.has('or')) {
      const cursor = /occurred_at\.lt\.([^,]+),and\(occurred_at\.eq\.[^,]+,id\.lt\.([^)]+)/.exec(url.searchParams.get('or'));
      rows = rows.filter((r) => Date.parse(r.occurred_at) < Date.parse(cursor[1]) || (Date.parse(r.occurred_at) === Date.parse(cursor[1]) && r.id < cursor[2]));
    }
    rows = rows.toSorted((a,b) => String(b.occurred_at).localeCompare(String(a.occurred_at)) || b.id.localeCompare(a.id));
    return Response.json(rows.slice(0, Number(url.searchParams.get('limit') || 100)));
  };
});
after(() => { globalThis.fetch = fetch; console.error = error; for (const k of keys) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; } });

test('missing persistence returns preview and never queries unscoped tables', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await ledger.getJournalLedger()).status, 'preview');
  assert.equal((await ledger.getJournalContexts({ type: 'project' })).status, 'preview');
  assert.equal((await ledger.writeJournal(input)).httpStatus, 503);
  assert.equal(state.calls.length, 0);
});
test('listing is scoped, limited to 40 summaries, and selected detail may be outside the page', async () => {
  state.rows = Array.from({ length: 45 }, (_, i) => row({ id: id(i + 1), body: 'x'.repeat(200) }));
  state.rows.push(row({ id: id(100), workspace_id: O }), row({ id: id(101), entry_kind: 'daily_review' }));
  const result = await ledger.getJournalLedger({ note: id(1), workspaceId: O });
  assert.equal(result.status, 'live');
  assert.equal(result.workspaceId, W);
  assert.equal(result.entries.length, 40);
  assert.equal(result.entry.id, id(1));
  assert.equal(result.entry.body.length, 200);
  assert.equal(result.entries.every((r) => !Object.hasOwn(r, 'body') && r.excerpt.length === 180), true);
  assert.deepEqual(result.nextCursor, { before: input.occurredAt, beforeId: id(6) });
  for (const call of state.calls.filter((c) => c.table === 'journal_entries')) {
    assert.equal(call.url.searchParams.get('workspace_id'), `eq.${W}`);
    assert.equal(call.url.searchParams.get('entry_kind'), 'eq.note');
    assert.equal(call.options.cache, 'no-store');
  }
  assert.equal(state.calls.find((c) => c.url.searchParams.get('limit') === '41').url.searchParams.get('order'), 'occurred_at.desc,id.desc');
  const next = await ledger.getJournalLedger(result.nextCursor);
  assert.deepEqual(next.entries.map((r) => r.id), [5,4,3,2,1].map(id));
  assert.equal(next.nextCursor, null);
});
test('detail resolves scoped context labels and retains use snapshots; deleted contexts show unavailable', async () => {
  state.rows = [row()];
  state.links = [{ id: id(10), workspace_id: W, journal_id: id(1), link_kind: 'context', target_type: 'project', target_id: id(20) }, { id: id(11), workspace_id: W, journal_id: id(1), link_kind: 'context', target_type: 'account', target_id: id(21) }, { id: id(12), workspace_id: W, journal_id: id(1), link_kind: 'use', target_type: 'task', target_id: id(22), title: '할 일', href: `/dashboard/work/my?task=${id(22)}`, excerpt: '줄 하나', source_revision: 1, created_at: input.occurredAt }];
  state.contexts = [{ id: id(20), workspace_id: W, name: '프로젝트' }, { id: id(21), workspace_id: O, name: 'foreign private' }];
  const result = await ledger.getJournalLedger({ note: id(1) });
  assert.equal(result.status, 'live');
  assert.deepEqual(result.entry.contexts.map((c) => c.label).sort(), ['프로젝트', '연결 대상 없음'].sort());
  assert.equal(result.entry.contexts.find((c) => c.type === 'account').href, null);
  assert.equal(result.entry.links[0].sourceRevision, 1);
  assert.equal(result.entry.links[0].excerpt, '줄 하나');
});
test('malformed cursor, invalid UUID and read failure return error envelopes without leaking', async () => {
  for (const params of [{ note: 'bad' }, { before: input.occurredAt }, { beforeId: id(1) }, { before: '2026-02-30T00:00:00Z', beforeId: id(1) }]) assert.equal((await ledger.getJournalLedger(params)).status, 'error');
  assert.equal(state.calls.length, 0);
  for (const table of ['workspaces', 'journal_entries', 'journal_links', 'projects']) {
    state.rows = [row()];
    state.links = [{ id: id(10), workspace_id: W, journal_id: id(1), link_kind: 'context', target_type: 'project', target_id: id(20) }];
    state.failure = table;
    const result = await ledger.getJournalLedger({ note: id(1) });
    assert.equal(result.status, 'error', table);
    assert.deepEqual(result.entries, []);
    assert.equal(result.entry, null);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});
test('malformed or foreign rows fail closed', async () => {
  state.bypass = true;
  for (const value of [row({ workspace_id: O }), row({ entry_kind: 'daily_review' }), row({ note_revision: 0 }), row({ note_meta: {} })]) {
    state.rows = [value]; assert.equal((await ledger.getJournalLedger()).status, 'error');
  }
});
test('context search passes literal bounded query and exact ID with server workspace only', async () => {
  state.search = { status: 'live', workspaceId: W, contexts: [{ type: 'account', id: id(5), label: '고객', href: `/dashboard/revenue/customers?customer=account%3A${id(5)}` }], hasMore: true };
  const q = 'a%_\\*(,name.eq.private';
  const result = await ledger.getJournalContexts({ type: 'account', q, workspaceId: O });
  assert.equal(result.status, 'live');
  assert.equal(result.hasMore, true);
  const call = state.calls.find((c) => c.table === 'journal_context_search_v1');
  assert.deepEqual(call.body, { p_workspace_id: W, p_type: 'account', p_query: q, p_id: null });
  await ledger.getJournalContexts({ type: 'account', id: id(5) });
  assert.equal(state.calls.at(-1).body.p_id, id(5));
  for (const params of [{ type: 'invalid' }, { type: 'project', q: 'x'.repeat(201) }, { type: 'project', id: 'invalid' }]) assert.equal((await ledger.getJournalContexts(params)).status, 'error');
  state.failure = 'journal_context_search_v1';
  assert.equal((await ledger.getJournalContexts({ type: 'project' })).status, 'error');
});
test('atomic write drops client workspace and returns normalized full entry', async () => {
  const result = await ledger.writeJournal({ ...input, workspaceId: O, ownerId: O });
  assert.equal(result.status, 'saved');
  assert.deepEqual(result.entry, { id: id(1), body: input.body, title: '', occurredAt: input.occurredAt, noteMeta: input.noteMeta, revision: 1, updatedAt: input.occurredAt, contexts: [], links: [] });
  const { requestId, ...command } = input;
  assert.deepEqual(state.calls.find((c) => c.table === 'journal_workflow_v1').body, { p_workspace_id: W, p_request_id: requestId, p_command: command });
});
test('duplicate returns latest note and original target; conflicts expose current note at 409', async () => {
  state.rpc = { status: 'conflict', error: 'stale-revision', entry: row({ note_revision: 3, contexts: [], links: [] }) };
  let result = await ledger.writeJournal(input);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.entry.revision, 3);
  assert.equal(result.retryable, false);
  state.rpc = { status: 'duplicate', entry: row({ contexts: [], links: [] }) };
  assert.equal((await ledger.writeJournal(input)).status, 'duplicate');
});
test('invalid input, persistence errors and malformed successes never report saved', async () => {
  assert.equal((await ledger.writeJournal({ ...input, body: '' })).httpStatus, 400);
  assert.equal(state.calls.length, 0);
  state.failure = 'journal_workflow_v1';
  assert.equal((await ledger.writeJournal(input)).httpStatus, 502);
  state.failure = null;
  for (const response of [null, { status: 'saved', entry: null }, { status: 'saved', entry: row({ workspace_id: O }) }, { status: 'saved', entry: row({ id: id(2) }) }, { status: 'error', error: 'private db' }]) {
    state.rpc = response; const result = await ledger.writeJournal(input);
    assert.equal(result.status, 'error'); assert.equal(result.httpStatus, 502); assert.equal(JSON.stringify(result).includes('private'), false);
  }
});
