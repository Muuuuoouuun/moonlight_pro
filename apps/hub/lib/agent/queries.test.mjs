import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { queryAgentData, getAgentEntity, invalidateAgentQueryCache } from './queries.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspace = '99999999-9999-4999-8999-999999999999';
const context = { workspaceId, actorId: 'codex', scopes: ['read'] };
const uuid = (n) => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const row = (n, extra = {}) => ({ id: uuid(n), workspace_id: workspaceId, title: `업무 ${n}`, status: 'todo', priority: 'medium', project_id: null, next_action: '확인', description: null, due_at: null, created_at: '2026-09-01T01:00:00.123456Z', updated_at: '2026-09-13T01:00:00.123456Z', ...extra });
const savedEnv = { ...process.env };
let calls;
let rows;
let handler;
beforeEach(() => {
  Object.assign(process.env, { SUPABASE_URL: 'https://agent-query.test', SUPABASE_SERVICE_ROLE_KEY: 'service-test', COM_MOON_AGENT_API_TOKEN: 'cursor-private', COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId });
  invalidateAgentQueryCache();
  calls = []; rows = {}; handler = null;
  mock.method(console, 'error', () => {});
  mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input); const table = url.pathname.split('/').at(-1);
    calls.push({ url, table, options });
    const value = handler ? await handler(table, url, options) : (rows[table] || []);
    return value instanceof Response ? value : Response.json(value);
  });
});
afterEach(() => {
  mock.restoreAll();
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});

test('queries push projection, workspace, filters and limit+sentinel into Supabase', async () => {
  rows.tasks = [row(1), row(2), row(3)];
  const input = { resource: 'tasks', fields: ['title'], limit: 2, filters: { status: 'todo', projectId: uuid(100) } };
  const result = await queryAgentData(input, context);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.data.status, 'live');
  assert.equal(result.data.source, 'supabase');
  assert.deepEqual(result.data.data.rows.map((item) => Object.keys(item).sort()), [['id', 'status', 'title', 'updatedAt'], ['id', 'status', 'title', 'updatedAt']]);
  assert.equal(result.data.data.rows[0].updatedAt, '2026-09-13T01:00:00.123456Z');
  const params = calls[0].url.searchParams;
  assert.equal(params.get('workspace_id'), `eq.${workspaceId}`);
  assert.equal(params.get('status'), 'in.(todo)');
  assert.equal(params.get('project_id'), `eq.${uuid(100)}`);
  assert.equal(params.get('limit'), '3');
  assert.equal(params.get('order'), 'created_at.asc,id.asc');
  assert.equal(params.get('select').includes('*'), false);
  assert.equal(params.get('select').includes('description'), false);
  assert.equal(result.data.page.hasMore, true);
  assert.equal(result.data.page.totalCount, null);
  assert.equal(result.data.page.returnedCount, 2);
  assert.ok(result.data.page.nextCursor);
});

test('signed continuation uses the last actual row and rejects changes before querying', async () => {
  rows.tasks = [row(1), row(2), row(3)];
  const first = await queryAgentData({ resource: 'tasks', limit: 2 }, context);
  rows.tasks = [row(3)];
  const cursor = first.data.page.nextCursor;
  const second = await queryAgentData({ resource: 'tasks', limit: 2, cursor }, context);
  assert.equal(second.data.data.rows[0].id, uuid(3));
  assert.match(calls[1].url.searchParams.get('or'), new RegExp(`created_at.eq.2026-09-01T01:00:00.123456Z,id.gt.${uuid(2)}`));
  assert.equal(second.data.page.hasMore, false);
  const count = calls.length;
  for (const [input, changedContext] of [
    [{ resource: 'tasks', limit: 3, cursor }, context],
    [{ resource: 'tasks', limit: 2, cursor }, { ...context, workspaceId: otherWorkspace }],
    [{ resource: 'tasks', limit: 2, cursor }, { ...context, actorId: 'other' }],
    [{ resource: 'tasks', limit: 2, cursor }, { ...context, scopes: ['read', 'tasks:write'] }],
  ]) assert.equal((await queryAgentData(input, changedContext)).httpStatus, 400);
  assert.equal(calls.length, count);
});

test('missing configuration is preview, source failure is error, and neither is cached as live', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
  const preview = await queryAgentData({ resource: 'tasks' }, context);
  assert.equal(preview.data.status, 'preview');
  assert.equal(preview.data.source, 'preview');
  assert.equal(calls.length, 0);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
  handler = () => new Response('unavailable', { status: 503 });
  const failed = await queryAgentData({ resource: 'tasks' }, context);
  assert.equal(failed.httpStatus, 200);
  assert.equal(failed.data.status, 'error');
  assert.deepEqual(failed.data.failedSources, ['tasks']);
  handler = null;
  const empty = await queryAgentData({ resource: 'tasks' }, context);
  assert.equal(empty.data.status, 'live');
  assert.deepEqual(empty.data.data.rows, []);
  assert.equal(calls.length, 2);
});

test('malformed or cross-workspace source rows fail closed and arbitrary inputs never call storage', async () => {
  rows.tasks = [row(1, { workspace_id: otherWorkspace })];
  const leaked = await queryAgentData({ resource: 'tasks' }, context);
  assert.equal(leaked.data.status, 'error');
  assert.deepEqual(leaked.data.data.rows, []);
  assert.equal(JSON.stringify(leaked).includes('업무 1'), false);
  handler = () => Response.json({ status: 'error', tasks: [] });
  assert.equal((await queryAgentData({ resource: 'tasks', fresh: true }, context)).data.status, 'error');
  const count = calls.length;
  assert.equal((await queryAgentData({ resource: 'tasks', filters: { workspaceId } }, context)).httpStatus, 400);
  assert.equal((await queryAgentData({ resource: 'tasks' }, { ...context, scopes: ['tasks:write'] })).httpStatus, 403);
  assert.equal(calls.length, count);
});

test('cache isolates actor, scope, workspace and fields; fresh and invalidation see changed rows', async () => {
  rows.tasks = [row(1)];
  const input = { resource: 'tasks', fields: ['title'] };
  const first = await queryAgentData(input, context);
  first.data.data.rows[0].title = 'consumer mutation';
  rows.tasks = [row(1, { title: 'changed' })];
  assert.equal((await queryAgentData(input, context)).data.data.rows[0].title, '업무 1');
  assert.equal(calls.length, 1);
  assert.equal((await queryAgentData({ ...input, fresh: true }, context)).data.data.rows[0].title, 'changed');
  await queryAgentData(input, { ...context, actorId: 'other' });
  await queryAgentData(input, { ...context, scopes: ['read', 'tasks:write'] });
  await queryAgentData({ ...input, fields: ['priority'] }, context);
  assert.equal(calls.length, 5);
  invalidateAgentQueryCache({ workspaceId, resources: ['tasks'] });
  await queryAgentData(input, context);
  assert.equal(calls.length, 6);
});

test('inflight queries coalesce but a fresh read after invalidation cannot reuse or recache the old read', async () => {
  let release;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  handler = async () => { started(); await pending; return [row(1, { title: 'old' })]; };
  const a = queryAgentData({ resource: 'tasks' }, context);
  const b = queryAgentData({ resource: 'tasks' }, context);
  await ready;
  assert.equal(calls.length, 1);
  invalidateAgentQueryCache({ workspaceId, resources: ['tasks'] });
  handler = () => [row(1, { title: 'new' })];
  assert.equal((await queryAgentData({ resource: 'tasks', fresh: true }, context)).data.data.rows[0].title, 'new');
  release(); await Promise.all([a, b]);
  assert.equal((await queryAgentData({ resource: 'tasks' }, context)).data.data.rows[0].title, 'new');
});

test('fresh reads supersede older inflight reads even without a write invalidation', async () => {
  let release; let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  handler = async () => { started(); await pending; return [row(1, { title: 'old' })]; };
  const oldRead = queryAgentData({ resource: 'tasks' }, context);
  await ready;
  handler = () => [row(1, { title: 'new' })];
  await queryAgentData({ resource: 'tasks', fresh: true }, context);
  release(); await oldRead;
  assert.equal((await queryAgentData({ resource: 'tasks' }, context)).data.data.rows[0].title, 'new');
});

test('TTL expiry and credential rotation do not reuse a stale signed response', async () => {
  let now = Date.now();
  mock.method(Date, 'now', () => now);
  rows.tasks = [row(1), row(2)];
  const query = { resource: 'tasks', limit: 1 };
  await queryAgentData(query, context);
  now += 15_001;
  await queryAgentData(query, context);
  assert.equal(calls.length, 2);
  process.env.COM_MOON_AGENT_API_TOKEN = 'rotated-private-token';
  const rotated = await queryAgentData(query, context);
  assert.equal(calls.length, 3);
  rows.tasks = [row(2)];
  assert.equal((await queryAgentData({ ...query, cursor: rotated.data.page.nextCursor }, context)).httpStatus, 200);
});

test('Korean rows stay valid JSON below 16KiB and cursor follows size-trimmed rows', async () => {
  rows.tasks = Array.from({ length: 101 }, (_, n) => row(n + 1, { title: '한글🙂'.repeat(200), description: '상세😀'.repeat(10000), next_action: '진행'.repeat(400) }));
  const result = await queryAgentData({ resource: 'tasks', limit: 100 }, context);
  const json = JSON.stringify(result.data);
  assert.ok(Buffer.byteLength(json) <= 16384);
  assert.equal(JSON.parse(json).status, 'live');
  assert.equal(result.data.truncated, true);
  assert.ok(result.data.page.returnedCount > 0 && result.data.page.returnedCount < 100);
  assert.equal(result.data.page.hasMore, true);
  assert.equal(result.data.data.rows[0].excerpts.description.hasMore, true);
  assert.ok(Array.from(result.data.data.rows[0].description).length <= 200);
  const lastId = result.data.data.rows.at(-1).id;
  rows.tasks = [];
  await queryAgentData({ resource: 'tasks', limit: 100, cursor: result.data.page.nextCursor }, context);
  assert.ok(calls.at(-1).url.searchParams.get('or').includes(`id.gt.${lastId}`));
});

test('summary is a bounded page aggregate and never claims an exact total', async () => {
  rows.tasks = [row(1), row(2, { status: 'doing' }), row(3)];
  const result = await queryAgentData({ resource: 'tasks', detail: 'summary', limit: 2 }, context);
  assert.ok(Buffer.byteLength(JSON.stringify(result.data)) <= 2048);
  assert.deepEqual(result.data.data.summary, { sampleCount: 2, byStatus: { todo: 1, doing: 1 } });
  assert.equal(result.data.data.basis, 'page');
  assert.equal(result.data.page.totalCount, null);
});

test('entity full detail paginates Korean body losslessly below 32KiB and always reads its exact version fresh', async () => {
  const description = '설계🙂와 실행\n'.repeat(7000);
  rows.tasks = [row(1, { description, checklist: [] })];
  let input = {}; let collected = ''; let pages = 0;
  do {
    const result = await getAgentEntity('tasks', uuid(1), input, context);
    assert.equal(result.httpStatus, 200);
    assert.ok(Buffer.byteLength(JSON.stringify(result.data)) <= 32768);
    assert.equal(result.data.data.entity.updatedAt, '2026-09-13T01:00:00.123456Z');
    collected += result.data.data.sections.filter((section) => section.field === 'description').map((section) => section.text).join('');
    input = { nextSectionCursor: result.data.data.nextSectionCursor };
    pages += 1;
  } while (input.nextSectionCursor && pages < 30);
  assert.ok(pages > 1 && pages < 30);
  assert.equal(collected, description);
  assert.equal(calls.length, pages);
  assert.equal(calls[0].url.searchParams.get('id'), `eq.${uuid(1)}`);
  assert.equal(calls[0].url.searchParams.get('workspace_id'), `eq.${workspaceId}`);
});

test('detail continuation rejects a changed entity instead of joining two different versions', async () => {
  rows.tasks = [row(1, { description: '한글'.repeat(30000) })];
  const first = await getAgentEntity('task', uuid(1), {}, context);
  rows.tasks = [row(1, { description: 'new', updated_at: '2026-09-13T02:00:00.123456Z' })];
  const result = await getAgentEntity('task', uuid(1), { nextSectionCursor: first.data.data.nextSectionCursor }, context);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.data.code, 'entity-changed');
});

test('missing entity is 404 and work orders never invent an updatedAt version', async () => {
  assert.equal((await getAgentEntity('tasks', uuid(1), {}, context)).httpStatus, 404);
  rows.work_orders = [row(1, { status: 'proposed', body: { text: '검토' }, updated_at: undefined })];
  const result = await getAgentEntity('work-orders', uuid(1), {}, context);
  assert.equal(result.data.data.entity.updatedAt, null);
  assert.equal(result.data.data.entity.versionAvailable, false);
  assert.equal(calls.at(-1).url.searchParams.get('select').includes('updated_at'), false);
});

test('followups derive bounded candidates with cutover, explicit due date and snooze rules', async () => {
  rows.workspaces = [{ id: workspaceId, contact_tracking_started_at: '2026-09-01T00:00:00Z' }];
  rows.leads = [
    row(1, { name: '예약 도래', status: 'new', created_at: '2026-08-01T00:00:00Z', next_action_at: '2026-09-01T00:00:00Z', last_touch_at: new Date().toISOString() }),
    row(2, { name: '예약 미래', status: 'new', created_at: '2026-08-01T00:00:00Z', next_action_at: '2099-01-01T00:00:00Z' }),
    row(3, { name: '보류', status: 'new', snooze_until: '2099-01-01T00:00:00Z' }),
    row(4, { name: '새 후속', status: 'qualified', last_touch_at: '2026-09-01T00:00:00Z' }),
  ];
  rows.deals = [row(5, { title: '딜 후속', stage: 'proposal', last_activity_at: '2026-09-01T00:00:00Z' })];
  const result = await queryAgentData({ resource: 'followups' }, context);
  assert.equal(result.data.status, 'live');
  assert.deepEqual(result.data.data.rows.map((item) => item.name), ['예약 도래', '새 후속', '딜 후속']);
  assert.equal(result.data.page.totalCount, null);
  for (const call of calls.filter((item) => ['leads', 'deals'].includes(item.table))) {
    assert.equal(call.url.searchParams.get('workspace_id'), `eq.${workspaceId}`);
    assert.equal(call.url.searchParams.get('limit'), '21');
    assert.equal(call.url.searchParams.get('order'), 'created_at.asc,id.asc');
    assert.ok(call.url.searchParams.get('select').includes('meta->>next_action_at'));
    assert.equal(call.url.searchParams.get('select').split(',').includes('meta'), false);
  }
});

test('followup source failures are partial; missing tracking configuration read fails closed', async () => {
  rows.workspaces = [{ id: workspaceId, contact_tracking_started_at: null }];
  rows.leads = [row(1, { name: '후속', status: 'qualified' })];
  handler = (table) => table === 'deals' ? new Response('unavailable', { status: 503 }) : (rows[table] || []);
  const partial = await queryAgentData({ resource: 'followups' }, context);
  assert.equal(partial.data.status, 'partial');
  assert.equal(partial.data.partial, true);
  assert.deepEqual(partial.data.failedSources, ['deals']);
  assert.equal(partial.data.page.nextCursor, null);
  handler = () => new Response('unavailable', { status: 503 });
  const failed = await queryAgentData({ resource: 'followups', fresh: true }, context);
  assert.equal(failed.data.status, 'error');
  assert.deepEqual(failed.data.data.rows, []);
  assert.deepEqual(failed.data.failedSources, ['workspaces']);
});

test('an empty derived page can advance past non-due candidates without claiming an empty ledger', async () => {
  rows.workspaces = [{ id: workspaceId, contact_tracking_started_at: null }];
  rows.leads = [row(1, { status: 'new', snooze_until: '2099-01-01T00:00:00Z' }), row(2, { status: 'new' })];
  const result = await queryAgentData({ resource: 'followups', limit: 1 }, context);
  assert.deepEqual(result.data.data.rows, []);
  assert.equal(result.data.page.hasMore, true);
  assert.ok(result.data.page.nextCursor);
  assert.equal(result.data.data.basis, 'candidate-page');
});

test('work-order kind is business data rather than a multi-table cursor discriminator', async () => {
  rows.work_orders = [row(1, { status: 'proposed', kind: 'followup' }), row(2, { status: 'proposed', kind: 'followup' })];
  const first = await queryAgentData({ resource: 'work-orders', limit: 1 }, context);
  rows.work_orders = [row(2, { status: 'proposed', kind: 'followup' })];
  const second = await queryAgentData({ resource: 'work-orders', limit: 1, cursor: first.data.page.nextCursor }, context);
  assert.equal(second.httpStatus, 200);
  assert.equal(second.data.data.rows[0].id, uuid(2));
});

test('deterministic Korean fixture reduces legacy payload by over 90 percent without claiming token measurements', async (t) => {
  const fixtures = Array.from({ length: 101 }, (_, n) => row(n + 1, { title: `업무 ${n + 1}`, description: '실행 내용과 자료를 정리합니다.\n'.repeat(400), meta: { private_note: '원문'.repeat(4000) } }));
  rows.tasks = fixtures;
  const result = await queryAgentData({ resource: 'tasks', limit: 20 }, context);
  const legacyBytes = Buffer.byteLength(JSON.stringify({ source: 'supabase', tasks: fixtures }, null, 2));
  const agentBytes = Buffer.byteLength(JSON.stringify(result.data));
  assert.ok(agentBytes < legacyBytes * 0.1);
  assert.ok(agentBytes <= 16384);
  t.diagnostic(JSON.stringify({ legacyFixtureBytes: legacyBytes, agentFixtureBytes: agentBytes, reductionPercent: Number(((1 - agentBytes / legacyBytes) * 100).toFixed(2)), tokenMeasurement: false }));
});
