import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_ROUTING_VERSION } from '@com-moon/agent-contracts/office-routing';
import { callOfficeRoutingEngine } from './routing-engine-client.js';
import { OFFICE_ROUTING_MAX_BODY_BYTES, createOfficeRoutingHubHandler } from './routing-http.js';

const request = { message: '고객 견적 답장을 준비해 주세요.', scope: 'classin' };
const result = { status: 'recommended', version: OFFICE_ROUTING_VERSION, ownerId: 'flareon', reviewerIds: ['leafeon'], reason: '고객 답장과 가격 부담을 나눠 검토합니다.', scope: 'classin', plan: { ownerDeliverable: '고객 답장 초안', reviews: [{ reviewerId: 'leafeon', question: '가격 부담의 근거가 있는가?' }] } };
const hubRequest = (body, origin = true) => new Request('http://localhost:3100/api/hub/office/assignment', { method: 'POST', headers: origin ? { origin: 'http://localhost:3100' } : {}, body: JSON.stringify(body) });

test('Hub client sends only the copied agenda and shared secret to the dedicated Engine route', async () => {
  let calls = 0;
  const response = await callOfficeRoutingEngine(request, { engineUrl: 'http://engine.test', secret: 'shared', fetcher: async (url, init) => {
    calls++;
    assert.equal(url, 'http://engine.test/api/ai/office-assignment');
    assert.equal(init.headers['x-com-moon-shared-secret'], 'shared');
    assert.deepEqual(JSON.parse(init.body), request);
    return Response.json(result);
  } });
  assert.deepEqual(response, result);
  assert.equal(calls, 1);
});

test('Hub client keeps disconnected and failing recommendation distinct and rejects drift', async () => {
  assert.equal((await callOfficeRoutingEngine(request, { engineUrl: '', secret: '' })).status, 'preview');
  for (const bad of [{ ...result, version: 'old' }, { ...result, scope: 'personal' }, { ...result, businessWrites: true }]) {
    assert.equal((await callOfficeRoutingEngine(request, { engineUrl: 'http://engine.test', secret: 'shared', fetcher: async () => Response.json(bad) })).status, 'error');
  }
  assert.equal((await callOfficeRoutingEngine(request, { engineUrl: 'http://engine.test', secret: 'shared', fetcher: async () => Response.json({ status: 'preview' }, { status: 202 }) })).status, 'preview');
});

test('Hub assignment requires write guard, rejects caller-owned state, and never invokes task persistence', async () => {
  let calls = 0;
  const handler = createOfficeRoutingHubHandler({ callEngine: async () => { calls++; return result; } });
  const denied = await handler(hubRequest(request, false));
  assert.ok([401, 403].includes(denied.status));
  for (const body of [{ ...request, ownerId: 'flareon' }, { ...request, taskId: 'x' }, { ...request, context: {} }]) {
    assert.equal((await handler(hubRequest(body))).status, 400);
  }
  assert.equal(calls, 0);
  const response = await handler(hubRequest(request));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ...result, businessWrites: false });
  assert.equal(calls, 1);
});

test('a 6,000-character Korean agenda (contract max) stays under the hub byte cap and reaches the Engine call', async () => {
  let calls = 0;
  const handler = createOfficeRoutingHubHandler({ callEngine: async () => { calls++; return { ...result }; } });
  const longRequest = { message: '가'.repeat(6000), scope: 'classin' };
  const response = await handler(hubRequest(longRequest));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test('Hub preserves manual selection on preview and error', async () => {
  for (const [status, httpStatus] of [['preview', 202], ['error', 502]]) {
    const handler = createOfficeRoutingHubHandler({ callEngine: async () => ({ status, error: '직접 선택해 주세요.' }) });
    const response = await handler(hubRequest(request));
    assert.equal(response.status, httpStatus);
    assert.equal((await response.json()).status, status);
  }
});

test('Hub accepts the full 6,000-character Korean agenda and leaves the limit to the character contract', async () => {
  const seen = [];
  const handler = createOfficeRoutingHubHandler({ callEngine: async value => { seen.push(value); return { ...result, scope: value.scope }; } });
  const agenda = '가'.repeat(6000);
  assert.ok(Buffer.byteLength(JSON.stringify({ message: agenda, scope: 'classin' })) > 12000, 'the old byte cap rejected this agenda');
  const response = await handler(hubRequest({ message: agenda, scope: 'classin' }));
  assert.equal(response.status, 200);
  assert.equal(seen[0].message, agenda);
  const tooLong = await handler(hubRequest({ message: '가'.repeat(6001), scope: 'classin' }));
  assert.equal(tooLong.status, 400);
  assert.equal((await tooLong.json()).error, '안건 길이를 확인해 주세요.');
  assert.equal(seen.length, 1);
  // Even a worst-case JSON encoding of a contract-valid agenda fits the byte guard.
  assert.ok(Buffer.byteLength(JSON.stringify({ message: '\u0001'.repeat(6000), scope: 'personal' })) <= OFFICE_ROUTING_MAX_BODY_BYTES);
  const oversized = await handler(new Request('http://localhost:3100/api/hub/office/assignment', {
    method: 'POST', headers: { origin: 'http://localhost:3100' }, body: JSON.stringify({ message: '가'.repeat(13000), scope: 'classin' }),
  }));
  assert.equal(oversized.status, 413);
  assert.equal(seen.length, 1);
});
