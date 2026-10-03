import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createOperatorSessionToken, OPERATOR_SESSION_COOKIE } from '../operator-session.js';
import { resolveRouteAccess } from '../route-access.js';
import { createOfficeInboxService } from './inbox-service.js';
import { createOfficeInboxHandler } from './inbox-http.js';
import * as route from '../../app/api/hub/office/inbox/route.js';

const actor = { workspaceId: randomUUID(), actorId: 'inbox.operator' };
const item = (changes = {}) => ({ requestId: randomUUID(), intent: 'weekly_report', scope: 'personal',
  originRef: { periodStart: '2026-09-14', periodEnd: '2026-09-20', timezone: 'Asia/Seoul' },
  ownerId: 'vaporeon', mode: 'draft', participants: [], createdAt: '2026-10-03T02:00:00.123456+00:00',
  status: 'generated', state: 'generated', expired: false, ...changes });
const service = rpc => createOfficeInboxService({ rpc });
const handler = options => createOfficeInboxHandler(options);
const cursor = value => Buffer.from(JSON.stringify(value)).toString('base64url');

test('inbox reads recent persisted requests across origins using only server identity and one read RPC', async () => {
  const calls = [], first = item(), second = item({ intent: 'customer_reply', originRef: { entityType: 'lead', entityId: randomUUID() } });
  const result = await service(async (name, params) => { calls.push({ name, params }); return { status: 'ready', items: [first, second] }; })
    .list({ scope: 'personal', actorId: 'intruder', workspaceId: randomUUID() }, actor);
  assert.deepEqual(result, { status: 'ready', source: 'live', items: [first, second], hasMore: false, nextCursor: null });
  assert.deepEqual(calls, [{ name: 'office_request_inbox_v1', params: { p_workspace_id: actor.workspaceId, p_actor_id: actor.actorId, p_scope: 'personal', p_limit: 20, p_before: null } }]);
});

test('inbox returns at most the requested limit with a timestamp/UUID cursor that preserves database precision', async () => {
  const rows = [item(), item(), item()], calls = [], before = { createdAt: rows[0].createdAt, id: rows[0].requestId };
  const result = await service(async (_name, params) => { calls.push(params); return { status: 'ready', items: rows }; })
    .list({ scope: 'personal', limit: '2', cursor: cursor(before) }, actor);
  assert.equal(result.items.length, 2); assert.equal(result.hasMore, true);
  assert.deepEqual(result.nextCursor, { createdAt: rows[1].createdAt, id: rows[1].requestId });
  assert.deepEqual(calls[0].p_before, before);
});

test('inbox validates scope, limits and cursors before accessing storage', async () => {
  let calls = 0;
  const inbox = service(async () => { calls++; return { status: 'ready', items: [] }; });
  for (const query of [{}, { scope: 'all' }, ...[0, 21, 1.5, ''].map(limit => ({ scope: 'personal', limit })),
    ...['not-json', cursor(null), cursor({ id: randomUUID(), createdAt: 'infinity' }), cursor({ id: randomUUID(), createdAt: '2026-10-03T00:00:00Z', actorId: 'other' }), cursor({ id: 'bad', createdAt: '2026-10-03T00:00:00Z' })].map(value => ({ scope: 'personal', cursor: value }))]) {
    const result = await inbox.list(query, actor);
    assert.equal(result.status, 'error'); assert.equal(result.source, 'error'); assert.equal(result.error, 'invalid-office-inbox-query');
  }
  assert.equal(calls, 0);
});

test('inbox projection removes unexpected content, nested origin fields and execution data', async () => {
  const clean = item(), unsafe = { ...clean, originRef: { ...clean.originRef, secret: 'private-origin' }, result: { body: 'private-result' },
    input_snapshot: { message: 'private-input' }, context_snapshot: { facts: 'private-facts' }, attempt_token: randomUUID(),
    workspace_id: actor.workspaceId, actor_id: actor.actorId, application: { command: { payload: 'private-command' } } };
  const result = await service(async () => ({ status: 'ready', items: [unsafe] })).list({ scope: 'personal' }, actor);
  assert.deepEqual(result.items, [clean]);
  assert.doesNotMatch(JSON.stringify(result), /private-|attempt_token|workspace_id|actor_id|application/);
});

test('inbox keeps persisted error, overdue unknown and expired metadata distinct from read failure', async () => {
  const rows = ['running', 'generated', 'unknown', 'error', 'expired'].map(status => item({ status, state: status, expired: status === 'expired' }));
  const result = await service(async () => ({ status: 'ready', items: rows })).list({ scope: 'personal' }, actor);
  assert.equal(result.status, 'ready'); assert.deepEqual(result.items.map(row => row.status), rows.map(row => row.status));
});

test('inbox can rediscover persisted chat mode workflows alongside legacy answer mode metadata', async () => {
  const rows = ['chat', 'answer'].map(mode => item({ mode }));
  const result = await service(async () => ({ status: 'ready', items: rows })).list({ scope: 'personal' }, actor);
  assert.equal(result.status, 'ready'); assert.deepEqual(result.items.map(row => row.mode), ['chat', 'answer']);
});

test('missing workspace or unprepared storage is preview; live storage errors never become an empty live list', async () => {
  let calls = 0;
  const inbox = service(async () => { calls++; throw Object.assign(new Error('private database detail'), { preparation: true }); });
  const missing = await inbox.list({ scope: 'personal' }, { ...actor, workspaceId: '' });
  assert.equal(missing.status, 'preview'); assert.equal(missing.source, 'preview'); assert.equal(calls, 0);
  const preparing = await inbox.list({ scope: 'personal' }, actor);
  assert.equal(preparing.status, 'preview'); assert.equal(preparing.source, 'preview'); assert.deepEqual(preparing.items, []);
  for (const rpc of [async () => { throw new Error('private database detail'); }, async () => ({ status: 'error', error: 'private database detail' }), async () => ({ status: 'ready', items: [{}] })]) {
    const failed = await service(rpc).list({ scope: 'personal' }, actor);
    assert.equal(failed.status, 'error'); assert.equal(failed.source, 'error'); assert.doesNotMatch(JSON.stringify(failed), /private database detail/);
  }
});

test('inbox GET retains middleware protection and exports no write handler', () => {
  assert.equal(typeof route.GET, 'function', 'Office inbox GET route must exist');
  assert.equal(route.POST, undefined); assert.equal(route.PATCH, undefined);
  assert.equal(resolveRouteAccess({ pathname: '/api/hub/office/inbox', hasSession: false, secretConfigured: true, allowLoopback: false }).action, 'unauthorized');
});

test('inbox handler rejects unverified credentials before calling the service', async () => {
  let calls = 0;
  const get = handler({ service: { list: async () => { calls++; } } });
  const response = await get(new Request('https://hub.example/api/hub/office/inbox?scope=personal&actorId=operator', { headers: { origin: 'https://hub.example', 'x-actor-id': 'operator', cookie: `${OPERATOR_SESSION_COOKIE}=unverified` } }));
  assert.equal(response.status, 401); assert.equal((await response.json()).status, 'unauthorized'); assert.equal(calls, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('inbox handler derives actor and workspace from verified session and server configuration', async () => {
  const original = { secret: process.env.COM_MOON_OPERATOR_SESSION_SECRET, workspace: process.env.COM_MOON_DEFAULT_WORKSPACE_ID };
  try {
    process.env.COM_MOON_OPERATOR_SESSION_SECRET = 'inbox-test-session-secret'; process.env.COM_MOON_DEFAULT_WORKSPACE_ID = actor.workspaceId;
    const calls = [], get = handler({ service: { list: async (query, identity) => { calls.push({ query, identity }); return { status: 'ready', source: 'live', items: [], hasMore: false, nextCursor: null }; } } });
    const token = createOperatorSessionToken({ subject: actor.actorId });
    const response = await get(new Request('https://hub.example/api/hub/office/inbox?scope=classin&limit=3&actorId=intruder&workspaceId=intruder', { headers: { cookie: `${OPERATOR_SESSION_COOKIE}=${token}`, 'x-actor-id': 'intruder' } }));
    assert.equal(response.status, 200); assert.equal((await response.json()).source, 'live');
    assert.deepEqual(calls, [{ query: { scope: 'classin', limit: '3' }, identity: actor }]);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    for (const [key, value] of [['COM_MOON_OPERATOR_SESSION_SECRET', original.secret], ['COM_MOON_DEFAULT_WORKSPACE_ID', original.workspace]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('inbox read failures use HTTP 200 with explicit error truth', async () => {
  for (const list of [async () => ({ status: 'error', source: 'error', error: 'office-inbox-read-unavailable' }), async () => { throw new Error('private failure'); }]) {
    const response = await handler({ authenticate: () => true, identity: () => actor, service: { list } })(new Request('https://hub.example/api/hub/office/inbox?scope=personal'));
    assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.status, 'error'); assert.equal(body.source, 'error');
    assert.doesNotMatch(JSON.stringify(body), /private failure/); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
