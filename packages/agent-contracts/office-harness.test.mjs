import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficeRequest } from './office.js';
import {
  OFFICE_HARNESS_VERSION, OFFICE_WORK_KINDS, OFFICE_HANDOFFS, officeReviewerCandidates,
  parseOfficeBreakdownRequest, parseOfficeBreakdownProposal, parseOfficeBreakdownResult, officeBreakdownResult,
  withOfficePacketOwner, officePacketStates, officePacketRequest,
} from './office-harness.js';

const request = { message: '신규 B2B 패키지 출시를 다음 달 안에 할지 정하고 첫 고객 제안까지 준비', scope: 'all' };
const packet = (index, change = {}) => ({
  key: `p${index}`, kind: 'scope_definition', scope: 'classin', ask: '이번 출시의 최소 범위를 정한다.',
  inputs: ['현재 패키지 구성'], deliverable: '포함/제외와 완료 기준', doneWhen: '운영자가 포함 범위를 확인했다.',
  dependsOn: [], reviewerIds: [], exit: 'office', ...change,
});
const proposal = {
  summary: '출시 여부를 비용과 범위로 판단한 뒤 첫 고객 제안을 준비한다.',
  decisionNeeded: '다음 달 출시를 할지',
  packets: [
    packet(1, { kind: 'cost_compare', ask: '출시 준비의 돈·시간을 계산한다.', reviewerIds: ['espeon'] }),
    packet(2, { dependsOn: ['p1'], reviewerIds: ['jolteon', 'umbreon'] }),
    packet(3, { kind: 'customer_contact', ask: '첫 고객 제안 메시지 초안', dependsOn: ['p2'], reviewerIds: ['umbreon'], exit: 'task' }),
  ],
  holds: ['전 채널 동시 홍보'],
  questions: [],
};

test('breakdown request is a bounded copied agenda with a known scope', () => {
  assert.deepEqual(parseOfficeBreakdownRequest(request), request);
  for (const value of [{ ...request, message: '' }, { ...request, message: '가'.repeat(6001) }, { ...request, scope: 'company' }, { ...request, ownerId: 'eevee' }, null])
    assert.throws(() => parseOfficeBreakdownRequest(value));
});

test('the harness, not the model, assigns owner and mode from the work kind', () => {
  const parsed = parseOfficeBreakdownProposal(proposal, request);
  assert.deepEqual(parsed.packets.map(p => [p.key, p.ownerId, p.mode, p.ownerSource]), [
    ['p1', 'leafeon', 'review', 'kind'], ['p2', 'glaceon', 'draft', 'kind'], ['p3', 'flareon', 'draft', 'kind'],
  ]);
  assert.equal(parsed.scope, 'all');
  assert.throws(() => parseOfficeBreakdownProposal({ ...proposal, packets: [{ ...packet(1), ownerId: 'eevee' }] }, request), /형식/);
  for (const kind of Object.keys(OFFICE_WORK_KINDS)) assert.ok(OFFICE_HANDOFFS[OFFICE_WORK_KINDS[kind].ownerId], kind);
});

test('packets are numbered, acyclic, bounded and stay inside the agenda scope', () => {
  const bad = [
    { packets: [] },
    { packets: Array.from({ length: 6 }, (_, i) => packet(i + 1)) },
    { packets: [packet(2)] },
    { packets: [packet(1, { dependsOn: ['p1'] })] },
    { packets: [packet(1), packet(2, { dependsOn: ['p3'] }), packet(3)] },
    { packets: [packet(1, { dependsOn: ['p0'] })] },
    { packets: [packet(1, { kind: 'intake' })] },
    { packets: [packet(1, { scope: 'all' })] },
    { packets: [packet(1, { exit: 'send_message' })] },
    { packets: [packet(1, { inputs: ['a', 'b', 'c', 'd', 'e'] })] },
    { packets: [packet(1, { doneWhen: '' })] },
    { holds: ['a', 'b', 'c', 'd'] },
    { questions: ['a', 'b', 'c'] },
    { decisionNeeded: '' },
    { autoRun: true },
  ];
  for (const change of bad) assert.throws(() => parseOfficeBreakdownProposal({ ...proposal, ...change }, request), JSON.stringify(change));
  const personal = { ...request, scope: 'personal' };
  assert.throws(() => parseOfficeBreakdownProposal(proposal, personal), /범위/);
  assert.equal(parseOfficeBreakdownProposal({ ...proposal, packets: [packet(1, { scope: 'personal' })] }, personal).packets[0].scope, 'personal');
});

test('reviewers come from the owner handoffs or 블래키, never the owner', () => {
  assert.deepEqual(officeReviewerCandidates('flareon'), ['leafeon', 'umbreon']);
  assert.deepEqual(officeReviewerCandidates('umbreon'), ['jolteon', 'flareon', 'eevee']);
  for (const reviewerIds of [['glaceon'], ['sylveon'], ['jolteon', 'jolteon'], ['jolteon', 'umbreon', 'vaporeon']])
    assert.throws(() => parseOfficeBreakdownProposal({ ...proposal, packets: [packet(1, { reviewerIds })] }, request));
});

test('transport binds the version and rejects pre-applied operator owners', () => {
  const result = officeBreakdownResult(parseOfficeBreakdownProposal(proposal, request));
  assert.equal(result.version, OFFICE_HARNESS_VERSION);
  assert.deepEqual(parseOfficeBreakdownResult(result, request), result);
  assert.throws(() => parseOfficeBreakdownResult({ ...result, version: 'old' }, request));
  assert.throws(() => parseOfficeBreakdownResult({ ...result, status: 'applied' }, request));
  assert.throws(() => parseOfficeBreakdownResult(withOfficePacketOwner(result, 'p2', 'eevee'), request));
  assert.throws(() => parseOfficeBreakdownResult({ ...result, packets: [{ ...result.packets[0], ownerId: 'eevee' }, ...result.packets.slice(1)] }, request));
});

test('operator owner override wins and drops a reviewer who became the owner', () => {
  const result = officeBreakdownResult(parseOfficeBreakdownProposal(proposal, request));
  const changed = withOfficePacketOwner(result, 'p2', 'jolteon');
  assert.deepEqual([changed.packets[1].ownerId, changed.packets[1].ownerSource, changed.packets[1].reviewerIds], ['jolteon', 'operator', ['umbreon']]);
  assert.equal(result.packets[1].ownerId, 'glaceon');
  assert.throws(() => withOfficePacketOwner(result, 'p9', 'eevee'));
  assert.throws(() => withOfficePacketOwner(result, 'p1', 'guru'));
});

test('packet states follow operator marks and dependencies only', () => {
  const result = officeBreakdownResult(parseOfficeBreakdownProposal(proposal, request));
  assert.deepEqual(officePacketStates(result), { p1: 'ready', p2: 'waiting', p3: 'waiting' });
  assert.deepEqual(officePacketStates(result, { p1: 'done' }), { p1: 'done', p2: 'ready', p3: 'waiting' });
  assert.deepEqual(officePacketStates(result, { p1: 'skipped' }), { p1: 'skipped', p2: 'waiting', p3: 'waiting' });
  assert.throws(() => officePacketStates(result, { p1: 'running' }));
  assert.throws(() => officePacketStates(result, { p7: 'done' }));
});

test('a ready packet becomes a valid Office request with clipped upstream copies', () => {
  const result = officeBreakdownResult(parseOfficeBreakdownProposal(proposal, request));
  const single = officePacketRequest(result, 'p2', { agenda: request.message, priorResults: { p1: '가'.repeat(3000) } });
  assert.deepEqual([single.ownerId, single.mode, single.scope, single.participants], ['glaceon', 'draft', 'classin', []]);
  assert.match(single.message, /\[업무 조각 p2 · 완료 기준\]/);
  assert.match(single.message, /범위: 회사\(ClassIn\)/);
  assert.match(single.message, /앞선 조각 p1 결과 · 운영자가 붙여 넣은 사본/);
  assert.ok(single.message.length <= 6000);
  assert.ok(!single.message.includes('가'.repeat(1500)));
  assert.equal(parseOfficeRequest(single).ownerId, 'glaceon');
  const council = officePacketRequest(result, 'p2', { agenda: request.message, withReviewers: true });
  assert.deepEqual([council.mode, council.participants], ['council', ['glaceon', 'jolteon', 'umbreon']]);
  assert.equal(parseOfficeRequest(council).mode, 'council');
  const p1 = officePacketRequest(result, 'p1', { agenda: '가'.repeat(6000) });
  assert.ok(p1.message.length <= 6000);
  assert.doesNotThrow(() => parseOfficeRequest(p1));
  assert.throws(() => officePacketRequest(result, 'p2', { agenda: request.message, priorResults: { p3: 'x' } }));
  assert.throws(() => officePacketRequest(result, 'p2', { agenda: '' }));
  assert.throws(() => officePacketRequest(result, 'p8', { agenda: request.message }));
});
