import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficeRequest } from '@com-moon/agent-contracts/office';
import { officeBreakdownResult, parseOfficeBreakdownProposal } from '@com-moon/agent-contracts/office-harness';
import { createOfficeBreakdownStore, fetchOfficeBreakdown, officeBreakdownProgress } from './office-breakdown-session.js';

const agenda = '출시 여부를 정하고 첫 고객 제안까지 준비';
const body = request => ({ ...officeBreakdownResult(parseOfficeBreakdownProposal({
  summary: '비용 → 제안 순서로 본다.', decisionNeeded: '출시 여부',
  packets: [
    { key: 'p1', kind: 'cost_compare', scope: 'classin', ask: '비용 계산', inputs: [], deliverable: '비교표', doneWhen: '상한을 정했다.', dependsOn: [], reviewerIds: ['espeon'], exit: 'office' },
    { key: 'p2', kind: 'customer_contact', scope: 'classin', ask: '제안 메시지', inputs: [], deliverable: '메시지', doneWhen: '보냈다.', dependsOn: ['p1'], reviewerIds: [], exit: 'task' },
  ], holds: [], questions: [],
}, request)), businessWrites: false });

test('a breakdown is a recommendation until applied, and stale or drifting answers are dropped', () => {
  const store = createOfficeBreakdownStore();
  assert.throws(() => store.begin('classin', ''));
  const first = store.begin('classin', agenda);
  const second = store.begin('classin', agenda);
  assert.equal(store.resolve('classin', first.readId, body(first.request)), null, 'an older read cannot overwrite a newer one');
  store.resolve('classin', second.readId, body(second.request));
  assert.equal(store.get('classin').status, 'recommended');
  assert.equal(store.open('classin', 'p1', { turnCount: 0 }), null, 'packets open only after apply');
  assert.equal(store.mark('classin', 'p1', 'done'), null);
  store.apply('classin');
  assert.equal(store.get('classin').status, 'applied');
  assert.equal(store.get('personal'), null, 'scopes do not share a breakdown');

  const drift = store.begin('classin', agenda);
  store.resolve('classin', drift.readId, { ...body(drift.request), businessWrites: true });
  assert.equal(store.get('classin').status, 'error');
  const preview = store.begin('classin', agenda);
  store.resolve('classin', preview.readId, { status: 'preview', error: '연결 필요' });
  assert.deepEqual([store.get('classin').status, store.get('classin').error], ['preview', '연결 필요']);
});

test('opening builds a valid Office request; done keeps only an answer produced after opening', () => {
  const store = createOfficeBreakdownStore();
  const started = store.begin('classin', agenda);
  store.resolve('classin', started.readId, body(started.request));
  store.apply('classin');
  assert.deepEqual(store.states('classin'), { p1: 'ready', p2: 'waiting' });

  const council = store.open('classin', 'p1', { turnCount: 3, withReviewers: true });
  assert.deepEqual([council.mode, council.participants], ['council', ['leafeon', 'espeon']]);
  assert.doesNotThrow(() => parseOfficeRequest(council));
  store.mark('classin', 'p1', 'done', { latestAnswer: '이전 판의 답', turnCount: 3 });
  assert.equal(store.get('classin').priors.p1, undefined, 'no new turn since opening → no copy');
  store.mark('classin', 'p1', null);
  store.open('classin', 'p1', { turnCount: 3 });
  store.mark('classin', 'p1', 'done', { latestAnswer: '비교표 결과', turnCount: 4 });
  assert.equal(store.get('classin').priors.p1, '비교표 결과');
  assert.deepEqual(store.states('classin'), { p1: 'done', p2: 'ready' });
  assert.deepEqual(officeBreakdownProgress(store.get('classin'), store.states('classin')), { done: 1, closed: 1, total: 2 });

  const next = store.open('classin', 'p2', { turnCount: 4 });
  assert.match(next.message, /앞선 조각 p1 결과 · 운영자가 붙여 넣은 사본\]\n비교표 결과/);
  assert.equal(next.ownerId, 'flareon');
  store.mark('classin', 'p1', 'skipped');
  assert.equal(store.get('classin').priors.p1, undefined, 'skipping drops the copy');
  store.setOwner('classin', 'p2', 'eevee');
  assert.deepEqual([store.get('classin').breakdown.packets[1].ownerId, store.get('classin').breakdown.packets[1].ownerSource], ['eevee', 'operator']);
  store.discard('classin');
  assert.equal(store.get('classin'), null);
});

test('refused requests explain themselves and the fetch helper keeps preview apart from failure', async () => {
  const store = createOfficeBreakdownStore();
  store.refuse('all', '먼저 안건을 입력해 주세요.');
  assert.deepEqual(store.get('all'), { status: 'error', error: '먼저 안건을 입력해 주세요.' });
  assert.equal((await fetchOfficeBreakdown({ message: agenda, scope: 'all' }, async () => Response.json({ status: 'preview', error: 'x' }, { status: 202 }))).status, 'preview');
  assert.equal((await fetchOfficeBreakdown({ message: agenda, scope: 'all' }, async () => new Response('nope', { status: 502 }))).status, 'error');
  let sent;
  await fetchOfficeBreakdown({ message: agenda, scope: 'all' }, async (url, init) => { sent = [url, init.method, JSON.parse(init.body)]; return Response.json({}); });
  assert.deepEqual(sent, ['/api/hub/office/breakdown', 'POST', { message: agenda, scope: 'all' }]);
});
