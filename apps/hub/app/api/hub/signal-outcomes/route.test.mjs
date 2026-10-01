import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// 확인할 것 영수증 라우트(2026-09-30 스펙 §8.2) — 저장소가 없을 때 끝낸 것으로 세지 않는다(preview),
// 잘못된 입력은 400, PATCH는 action:"undo"·"move"만, 읽기 실패는 HTTP 200 + status:"error".
for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']) delete process.env[key];

globalThis.__signalOutcomeRouteBody = {};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      'next/server': `export class NextResponse extends Response {
  static json(value, init = {}) { return new Response(JSON.stringify(value), { ...init, headers: { 'content-type': 'application/json' } }); }
}`,
      '@/lib/hub-write-guard': `export function assertHubWriteAllowed() { return null; }
export async function readHubWriteJson() { return { data: globalThis.__signalOutcomeRouteBody }; }`,
    };
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const route = await import('./route.js');
const DEAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function call(method, body) {
  globalThis.__signalOutcomeRouteBody = body;
  const response = await route[method](new Request('http://hub.test/api/hub/signal-outcomes', { method }));
  return { status: response.status, body: await response.json() };
}

test('invalid input is a 400, not a server failure', async () => {
  const result = await call('POST', { requestId: REQ, signalKey: 'nope', subject: { type: 'deal', id: DEAL }, outcome: 'contact_logged' });
  assert.equal(result.status, 400);
  assert.equal(result.body.status, 'invalid-input');
  assert.equal(result.body.reason, 'invalid-signal-key');
});

test('without a store the receipt is preview — never counted as finished', async () => {
  const result = await call('POST', { requestId: REQ, signalKey: `revenue-stale:${DEAL}`, subject: { type: 'deal', id: DEAL }, outcome: 'contact_logged' });
  assert.equal(result.status, 202);
  assert.equal(result.body.status, 'preview');
  assert.equal(result.body.receipt, null);
});

test('PATCH only undoes or moves a scheduled block', async () => {
  assert.equal((await call('PATCH', { id: REQ, action: 'delete' })).status, 400);
  assert.equal((await call('PATCH', { id: 'bad', action: 'undo' })).body.reason, 'invalid-id');
  const backwards = await call('PATCH', { id: REQ, action: 'move', scheduledStart: '2026-10-01T05:00:00Z', scheduledEnd: '2026-10-01T04:30:00Z' });
  assert.equal(backwards.status, 400);
  assert.equal(backwards.body.reason, 'invalid-schedule');
  const moved = await call('PATCH', { id: REQ, action: 'move', scheduledStart: '2026-10-01T05:00:00Z', scheduledEnd: '2026-10-01T05:30:00Z' });
  assert.equal(moved.status, 202);
  assert.equal(moved.body.status, 'preview');
});

test('GET without a store reads as preview with no receipts', async () => {
  const result = await call('GET');
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'preview');
  assert.deepEqual(result.body.finishedToday, []);
});
