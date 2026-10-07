import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_ROLE_CARDS } from './role-cards.ts';
import { OFFICE_ROUTING_VERSION } from '@com-moon/agent-contracts/office-routing';
import { OFFICE_ROUTING_MAX_BODY_BYTES, generateOfficeRouting, createOfficeRoutingEngineHandler } from './routing.ts';

const request = { message: '고객 견적 답장을 준비해 주세요.', scope: 'classin' };
const recommendation = { ownerId: 'flareon', reviewerIds: ['leafeon'], reason: '고객 답장과 가격 부담을 나눠 검토합니다.', scope: 'classin', plan: { ownerDeliverable: '고객이 답하기 쉬운 견적 답장', reviews: [{ reviewerId: 'leafeon', question: '가격과 지원 범위의 자원 부담이 확인되었는가?' }] } };
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

test('routing includes shared responsibilities, supported requests and handoff boundaries for all nine roles', async () => {
  const { OFFICE_ROLE_CATALOG } = await import('@com-moon/agent-contracts/office-role-catalog').catch(error => {
    assert.fail(`Routing needs the shared role catalog: ${error.code}`);
  });
  let prompt;
  await generateOfficeRouting(request, async input => {
    prompt = input.prompt;
    return { ok: true, text: JSON.stringify(recommendation), model: 'test-model' };
  });
  for (const role of Object.values(OFFICE_ROLE_CATALOG)) {
    assert.ok(prompt.includes(`${role.id}: ${role.name} · ${role.role}`));
    assert.ok(prompt.includes(role.responsibility), `${role.id} responsibility is missing`);
    assert.ok(prompt.includes(role.handoff), `${role.id} handoff boundary is missing`);
    for (const starter of role.starters) assert.ok(prompt.includes(starter));
  }
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

test('Engine accepts the full 6,000-character Korean agenda; the character contract, not bytes, decides', async () => {
  const seen = [];
  const handler = createOfficeRoutingEngineHandler(() => ({ ok: true }), async value => {
    seen.push(value);
    return { status: 'recommended', version: OFFICE_ROUTING_VERSION, ...recommendation, scope: value.scope };
  });
  const agenda = '가'.repeat(6000);
  const response = await handler(httpRequest({ message: agenda, scope: 'classin' }));
  assert.equal(response.status, 200);
  assert.equal(seen[0].message, agenda);
  assert.equal((await handler(httpRequest({ message: '가'.repeat(6001), scope: 'classin' }))).status, 400);
  assert.ok(Buffer.byteLength(JSON.stringify({ message: '\u0001'.repeat(6000), scope: 'personal' })) <= OFFICE_ROUTING_MAX_BODY_BYTES);
  assert.equal((await handler(httpRequest({ message: '가'.repeat(13000), scope: 'classin' }))).status, 413);
  assert.equal(seen.length, 1);
});

test('a 6,000-character Korean agenda (contract max) stays under the byte cap and reaches generation', async () => {
  let calls = 0;
  const longRequest = { message: '가'.repeat(6000), scope: 'classin' };
  const handler = createOfficeRoutingEngineHandler(() => ({ ok: true }), async () => {
    calls++;
    return { status: 'recommended', version: OFFICE_ROUTING_VERSION, ...recommendation, scope: 'classin' };
  });
  const response = await handler(httpRequest(longRequest));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});


test('routing sees functional responsibilities and concrete deliverables without role voice examples', async () => {
  let input;
  await generateOfficeRouting(request, async value => {
    input = value;
    return { ok: true, text: JSON.stringify(recommendation), model: 'test-model' };
  });
  for (const card of Object.values(OFFICE_ROLE_CARDS)) {
    assert.ok(input.prompt.includes(card.ownership), card.id + ' ownership missing');
    assert.ok(input.prompt.includes(card.deliverables[0].produce), card.id + ' deliverable missing');
    assert.ok(input.prompt.includes(card.handoffs[0].packet), card.id + ' handoff missing');
    for (const example of card.voice.examples) assert.equal(input.prompt.includes(example.response), false);
  }
  assert.ok(input.responseJsonSchema.required.includes('plan'));
  assert.equal(input.responseJsonSchema.properties.plan.properties.reviews.maxItems, 2);
  assert.match(input.systemInstruction, /산출물/);
  assert.match(input.systemInstruction, /중복/);
  assert.match(input.systemInstruction, /운영자.*적용/);
});

test('new routing generations reject legacy planless output and malformed reviewer assignments', async () => {
  const { plan, ...legacy } = recommendation;
  for (const value of [legacy, { ...recommendation, plan: { ...plan, reviews: [] } }]) {
    const result = await generateOfficeRouting(request, async () => ({ ok: true, text: JSON.stringify(value), model: 'test-model' }));
    assert.equal(result.status, 'error');
    assert.equal(result.ownerId, undefined);
  }
});
