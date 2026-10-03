import { test } from 'node:test';
import assert from 'node:assert/strict';
import { officeBreakdownResult, parseOfficeBreakdownProposal } from '@com-moon/agent-contracts/office-harness';
import { callOfficeBreakdownEngine } from './breakdown-engine-client.js';
import { OFFICE_BREAKDOWN_MAX_BODY_BYTES, createOfficeBreakdownHubHandler } from './breakdown-http.js';
import { resolveRouteAccess } from '../route-access.js';

const request = { message: '출시 여부를 정하고 첫 고객 제안까지 준비', scope: 'classin' };
const result = officeBreakdownResult(parseOfficeBreakdownProposal({
  summary: '비용을 본 뒤 제안을 준비한다.', decisionNeeded: null,
  packets: [{ key: 'p1', kind: 'cost_compare', scope: 'classin', ask: '비용 계산', inputs: [], deliverable: '비교표', doneWhen: '상한을 정했다.', dependsOn: [], reviewerIds: [], exit: 'office' }],
  holds: [], questions: [],
}, request));
const hubRequest = (body, origin = true) => new Request('http://localhost:3100/api/hub/office/breakdown', { method: 'POST', headers: origin ? { origin: 'http://localhost:3100' } : {}, body: JSON.stringify(body) });

test('Hub client sends only the copied agenda and shared secret to the dedicated Engine route', async () => {
  const response = await callOfficeBreakdownEngine(request, { engineUrl: 'http://engine.test/', secret: 'shared', fetcher: async (url, init) => {
    assert.equal(url, 'http://engine.test/api/ai/office-breakdown');
    assert.equal(init.headers['x-com-moon-shared-secret'], 'shared');
    assert.deepEqual(JSON.parse(init.body), request);
    return Response.json(result);
  } });
  assert.deepEqual(response, result);
});

test('Hub client keeps preview and error apart and rejects drift from the contract', async () => {
  assert.equal((await callOfficeBreakdownEngine(request, { engineUrl: '', secret: '' })).status, 'preview');
  assert.equal((await callOfficeBreakdownEngine(request, { engineUrl: 'http://e', secret: 's', fetcher: async () => Response.json({ status: 'preview' }, { status: 202 }) })).status, 'preview');
  const operatorOwned = { ...result, packets: [{ ...result.packets[0], ownerId: 'eevee', ownerSource: 'operator' }] };
  for (const bad of [{ ...result, version: 'old' }, { ...result, scope: 'personal' }, { ...result, businessWrites: true }, operatorOwned]) {
    assert.equal((await callOfficeBreakdownEngine(request, { engineUrl: 'http://e', secret: 's', fetcher: async () => Response.json(bad) })).status, 'error');
  }
  let calls = 0;
  const retried = await callOfficeBreakdownEngine(request, { engineUrl: 'http://e', secret: 's', retries: 1, fetcher: async () => (++calls === 1 ? new Response('', { status: 503 }) : Response.json(result)) });
  assert.equal(retried.status, 'recommended');
  assert.equal(calls, 2);
});

test('Hub breakdown requires the write guard, rejects caller-owned state and stores nothing', async () => {
  let calls = 0;
  const handler = createOfficeBreakdownHubHandler({ callEngine: async () => { calls++; return result; } });
  assert.ok([401, 403].includes((await handler(hubRequest(request, false))).status));
  for (const body of [{ ...request, packets: [] }, { ...request, ownerId: 'eevee' }, { ...request, scope: 'company' }]) assert.equal((await handler(hubRequest(body))).status, 400);
  assert.equal(calls, 0);
  const response = await handler(hubRequest(request));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ...result, businessWrites: false });
  for (const [status, httpStatus] of [['preview', 202], ['error', 502]]) {
    const failed = await createOfficeBreakdownHubHandler({ callEngine: async () => ({ status, error: '직접 나눠 주세요.' }) })(hubRequest(request));
    assert.equal(failed.status, httpStatus);
    assert.equal((await failed.json()).status, status);
  }
  assert.ok(Buffer.byteLength(JSON.stringify({ message: '\u0001'.repeat(6000), scope: 'personal' })) <= OFFICE_BREAKDOWN_MAX_BODY_BYTES);
  assert.equal((await handler(hubRequest({ message: '가'.repeat(13000), scope: 'classin' }))).status, 413);
});

test('the new BFF route is behind the operator gate, not an open path', () => {
  const base = { pathname: '/api/hub/office/breakdown', host: 'moonlight-pro-hub.vercel.app', secretConfigured: true, allowLoopback: false };
  assert.deepEqual(resolveRouteAccess({ ...base, hasSession: false }), { action: 'unauthorized', reason: 'no-session' });
  assert.equal(resolveRouteAccess({ ...base, hasSession: true }).action, 'allow');
});
