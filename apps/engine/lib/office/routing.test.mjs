import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_ROUTING_VERSION } from '@com-moon/agent-contracts/office-routing';
import { generateOfficeRouting, createOfficeRoutingEngineHandler } from './routing.ts';

const request = { message: '고객 견적 답장을 준비해 주세요.', scope: 'classin' };
const recommendation = { ownerId: 'flareon', reviewerIds: ['leafeon'], reason: '고객 답장과 가격 부담을 나눠 검토합니다.', scope: 'classin' };
const httpRequest = body => new Request('http://engine.test/api/ai/office-assignment', { method: 'POST', body: JSON.stringify(body) });

test('Eevee routing uses structured generation without tools or side effects', async () => {
  let input;
  const result = await generateOfficeRouting(request, async value => {
    input = value;
    return { ok: true, text: JSON.stringify(recommendation), model: 'test-model' };
  });
  assert.deepEqual(result, { status: 'recommended', version: OFFICE_ROUTING_VERSION, ...recommendation });
  assert.equal(input.responseMimeType, 'application/json');
  assert.ok(input.responseJsonSchema);
  assert.equal(input.tools, undefined);
  assert.match(input.systemInstruction, /도구|실행/);
  assert.match(input.prompt, /고객 견적 답장/);
});

test('missing provider is preview; malformed or scope-drifting model output is an error, never a fabricated recommendation', async () => {
  assert.equal((await generateOfficeRouting(request, async () => ({ ok: false, reason: 'missing-api-key' }))).status, 'preview');
  for (const text of ['{', JSON.stringify({ ...recommendation, ownerId: 'guru' }), JSON.stringify({ ...recommendation, scope: 'personal' })]) {
    const result = await generateOfficeRouting(request, async () => ({ ok: true, text, model: 'test-model' }));
    assert.equal(result.status, 'error');
    assert.equal(result.ownerId, undefined);
  }
});

test('Engine authorizes first, validates request and has no write step', async () => {
  let calls = 0;
  const handler = createOfficeRoutingEngineHandler(() => ({ ok: true }), async () => {
    calls++;
    return { status: 'recommended', version: OFFICE_ROUTING_VERSION, ...recommendation };
  });
  assert.equal((await createOfficeRoutingEngineHandler(() => ({ ok: false }))(httpRequest(request))).status, 401);
  for (const body of [{ ...request, taskId: 'x' }, { ...request, scope: 'personal', context: {} }, { ...request, message: '' }]) {
    assert.equal((await handler(httpRequest(body))).status, 400);
  }
  assert.equal(calls, 0);
  const response = await handler(httpRequest(request));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ownerId, 'flareon');
  assert.equal(calls, 1);
});
