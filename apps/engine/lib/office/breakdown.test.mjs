import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_HARNESS_VERSION, OFFICE_WORK_KIND_IDS } from '@com-moon/agent-contracts/office-harness';
import { OFFICE_BREAKDOWN_MAX_BODY_BYTES, createOfficeBreakdownEngineHandler, generateOfficeBreakdown, officeBreakdownKindTable, officeBreakdownSchema } from './breakdown.ts';

const request = { message: '신규 패키지를 다음 달에 낼지 정하고 첫 고객 제안까지 준비', scope: 'classin' };
const proposal = {
  summary: '비용과 범위를 본 뒤 첫 제안을 준비한다.',
  decisionNeeded: '다음 달 출시 여부',
  packets: [
    { key: 'p1', kind: 'cost_compare', scope: 'classin', ask: '준비 비용과 시간을 계산한다.', inputs: [], deliverable: '비교표', doneWhen: '투입 상한을 정했다.', dependsOn: [], reviewerIds: ['espeon'], exit: 'office' },
    { key: 'p2', kind: 'customer_contact', scope: 'classin', ask: '첫 제안 메시지 초안', inputs: ['최근 고객 발언'], deliverable: '메시지 하나', doneWhen: '운영자가 보냈다.', dependsOn: ['p1'], reviewerIds: ['umbreon'], exit: 'task' },
  ],
  holds: [], questions: [],
};
const httpRequest = body => new Request('http://engine.test/api/ai/office-breakdown', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

test('breakdown uses structured generation without tools and the schema has no owner field', async () => {
  let input;
  const result = await generateOfficeBreakdown(request, async value => { input = value; return { ok: true, text: JSON.stringify(proposal), model: 'test-model' }; });
  assert.equal(result.status, 'recommended');
  assert.equal(result.version, OFFICE_HARNESS_VERSION);
  assert.deepEqual(result.packets.map(p => [p.ownerId, p.mode, p.ownerSource]), [['leafeon', 'review', 'kind'], ['flareon', 'draft', 'kind']]);
  assert.equal(input.tools, undefined);
  assert.equal(input.responseMimeType, 'application/json');
  assert.match(input.systemInstruction, /도구가 없습니다/);
  assert.match(input.systemInstruction, /나누지 말고 조각 하나만/);
  assert.match(input.prompt, /첫 고객 제안/);
  const item = input.responseJsonSchema.properties.packets.items;
  assert.equal(item.properties.ownerId, undefined);
  assert.deepEqual(item.properties.kind.enum, OFFICE_WORK_KIND_IDS);
  assert.deepEqual(item.properties.scope.enum, ['classin']);
});

test('the kind table names every kind and an all-scope agenda may pick either lane', () => {
  const table = officeBreakdownKindTable();
  for (const kind of OFFICE_WORK_KIND_IDS) assert.match(table, new RegExp(`^${kind}:`, 'm'));
  assert.deepEqual(officeBreakdownSchema({ message: 'x', scope: 'all' }).properties.packets.items.properties.scope.enum, ['classin', 'personal']);
});

test('missing provider is preview; model output that picks owners, cycles or drifts scope is an error', async () => {
  assert.equal((await generateOfficeBreakdown(request, async () => ({ ok: false, reason: 'missing-api-key' }))).status, 'preview');
  const bad = [
    '{',
    JSON.stringify({ ...proposal, packets: [{ ...proposal.packets[0], ownerId: 'eevee' }] }),
    JSON.stringify({ ...proposal, packets: [{ ...proposal.packets[0], dependsOn: ['p2'] }, proposal.packets[1]] }),
    JSON.stringify({ ...proposal, packets: [{ ...proposal.packets[0], scope: 'personal' }] }),
    JSON.stringify({ ...proposal, packets: [{ ...proposal.packets[0], reviewerIds: ['sylveon'] }] }),
  ];
  for (const text of bad) {
    const result = await generateOfficeBreakdown(request, async () => ({ ok: true, text, model: 'test-model' }));
    assert.equal(result.status, 'error', text.slice(0, 80));
    assert.equal(result.packets, undefined);
  }
});

test('Engine authorizes first, validates, caps bytes and has no write step', async () => {
  let calls = 0;
  const handler = createOfficeBreakdownEngineHandler(() => ({ ok: true }), async value => { calls++; return generateOfficeBreakdown(value, async () => ({ ok: true, text: JSON.stringify(proposal), model: 'm' })); });
  assert.equal((await createOfficeBreakdownEngineHandler(() => ({ ok: false }))(httpRequest(request))).status, 401);
  for (const body of [{ ...request, taskId: 'x' }, { ...request, message: '' }, { ...request, scope: 'company' }]) assert.equal((await handler(httpRequest(body))).status, 400);
  assert.equal((await handler(httpRequest('{'))).status, 400);
  assert.equal((await handler(httpRequest({ message: '가'.repeat(13000), scope: 'classin' }))).status, 413);
  assert.ok(Buffer.byteLength(JSON.stringify({ message: '가'.repeat(6000), scope: 'classin' })) <= OFFICE_BREAKDOWN_MAX_BODY_BYTES);
  assert.equal(calls, 0);
  const response = await handler(httpRequest(request));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).packets.length, 2);
  const preview = await createOfficeBreakdownEngineHandler(() => ({ ok: true }), async () => ({ status: 'preview', error: 'x' }))(httpRequest(request));
  assert.equal(preview.status, 202);
  const failed = await createOfficeBreakdownEngineHandler(() => ({ ok: true }), async () => ({ status: 'error', error: 'x' }))(httpRequest(request));
  assert.equal(failed.status, 502);
});
