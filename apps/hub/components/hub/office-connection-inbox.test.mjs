import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OFFICE_CUSTOMER_PREPARATION_VERSION, createOfficeCustomerApproval, officeCustomerApprovalPayload } from '@com-moon/agent-contracts/office-workflow';
import { createOfficeWorkflowSessions, validWorkflowReceipt } from './office-workflow-client.js';
import { createOfficeConnectionInbox, officeCouncilConnectionSource, officeCustomerConnectionSource, loadOfficeConnectionBrands } from './office-connection-inbox.js';

const brandA = '11111111-1111-4111-8111-111111111111';
const brandB = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const originRef = { entityType: 'lead', entityId: '44444444-4444-4444-8444-444444444444' };
const hash = 'a'.repeat(64);
const council = (id = requestId, scope = 'personal', brandId = brandA) => ({ id, message: ' 원문\n공백 보존 ',
  request: { scope, mode: 'council', ownerId: 'eevee', message: '모델에 보낸 원문', history: [{ role: 'user', text: '앞선 원문' }] },
  result: { scope, mode: 'council', status: 'generated', ownerId: 'eevee', answer: '<script>보존할 생성 본문</script>', evidence: ['검증 안 된 근거'], nextAction: '추가 행동 없음' },
  officeBoundary: { scope, brandId } });
function customer(scope = 'personal', brandId = brandA) {
  const state = { pending: false, loading: false, approvalBusy: false, draft: '', reviewedSources: true, reviewedQuestions: true,
    request: { requestId, scope, mode: 'draft', ownerId: 'flareon', intent: 'customer_reply', originRef, expectedContextHash: hash, message: '이번 연락의 원문' },
    context: { status: 'ready', scope, originRef, contextHash: hash, facts: { customer: { id: originRef.entityId, entityType: originRef.entityType, name: '현재 고객', brandId }, activities: [{ body: '연락의 원문 전체' }] } },
    receipt: { status: 'generated', requestId, intent: 'customer_reply', scope, originRef, ownerId: 'flareon', mode: 'draft', resultRevision: 1,
      persistence: { persisted: true }, recoveryToken: 'private-recovery',
      result: { status: 'generated', requestId, scope, mode: 'draft', ownerId: 'flareon', resultRevision: 1, summary: '고객 대응', context: { contextHash: hash },
        artifact: { body: '추천 답장 원문 전체' }, evidence: [], uncertainties: [], sourceCheck: 'none', nextStep: null,
        customerPreparation: { version: OFFICE_CUSTOMER_PREPARATION_VERSION, purpose: '연락 목적', materials: [], questions: ['확인 질문 전체'] } } } };
  state.customerApprovalKey = officeCustomerApprovalPayload(state.receipt.result, { reviewedContextHash: hash });
  state.customerApproval = { version: OFFICE_CUSTOMER_PREPARATION_VERSION, requestId, resultRevision: 1, contextHash: hash, reviewedContextHash: hash,
    resultHash: createHash('sha256').update(state.customerApprovalKey).digest('hex'), sourcesReviewed: true, questionsReviewed: true };
  return state;
}

test('council source preserves full original and boundary without inventing factual brand data', () => {
  const turn = council(), result = officeCouncilConnectionSource(turn);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.source.source.turn, turn);
  assert.equal(result.source.boundary.brandId, brandA);
  assert.equal(result.source.source.turn.request.brandId, undefined);
  turn.result.answer = '후속 수정'; turn.officeBoundary.brandId = brandB;
  assert.equal(result.source.source.turn.result.answer, '<script>보존할 생성 본문</script>');
  assert.equal(result.source.boundary.brandId, brandA);
  assert.ok(Object.isFrozen(result.source.source.turn.result));
});

test('legacy, all-scope, ungenerated, mismatched and personal-unbranded council sources need the user', () => {
  const legacy = council(); delete legacy.officeBoundary;
  assert.equal(officeCouncilConnectionSource(legacy).status, 'needs_user');
  assert.equal(officeCouncilConnectionSource(council(requestId, 'all', null)).status, 'needs_user');
  assert.equal(officeCouncilConnectionSource(council(requestId, 'personal', null)).status, 'needs_user');
  for (const change of [{ result: { status: 'error', scope: 'personal' } }, { request: { scope: 'classin' } }, { request: { scope: 'personal', mode: 'chat' } }, { officeBoundary: { scope: 'personal', brandId: 'invalid-id' } }]) {
    assert.equal(officeCouncilConnectionSource({ ...council(), ...change }).status, 'needs_user');
  }
  assert.equal(officeCouncilConnectionSource(council(requestId, 'classin', null)).status, 'ready');
});

test('customer capture retains actual request, facts, receipt and review as reference, omitting credentials recursively', () => {
  const state = customer();
  state.context.credentials = { password: 'private-password' };
  state.context.access_token = 'private-access';
  state.receipt.result.credentials = { apiKey: 'private-key' };
  const result = officeCustomerConnectionSource(state, { scope: 'personal', brandId: brandA });
  assert.equal(result.status, 'ready');
  assert.equal(result.source.source.state.request.message, state.request.message);
  assert.equal(result.source.source.state.context.facts.activities[0].body, state.context.facts.activities[0].body);
  assert.equal(result.source.source.state.receipt.result.artifact.body, state.receipt.result.artifact.body);
  assert.deepEqual(result.source.source.state.customerApproval, state.customerApproval);
  assert.equal(result.source.source.state.reviewedSources, true);
  assert.doesNotMatch(JSON.stringify(result.source), /private-recovery|private-password|private-key|private-access|recoveryToken|credentials|access_token/);
  assert.equal(state.receipt.recoveryToken, 'private-recovery');
  assert.equal(state.context.credentials.password, 'private-password');
  const inbox = createOfficeConnectionInbox();
  assert.equal(inbox.publish(result.source).status, 'shared');
  assert.equal(inbox.get('personal').length, 1);
  assert.equal(result.source.source.state.customerApprovalKey, undefined);
});

test('customer capture accepts only generated persisted current customer results in the original boundary', () => {
  const boundary = { scope: 'personal', brandId: brandA };
  for (const change of [
    s => { s.receipt.status = 'unsaved'; }, s => { s.receipt.persistence.persisted = false; },
    s => { s.receipt.result.status = 'preview'; }, s => { s.receipt.result.customerPreparation = null; },
    s => { s.request.intent = 'weekly_report'; }, s => { s.context.scope = 'classin'; },
    s => { s.context.contextHash = 'b'.repeat(64); }, s => { s.context.originRef = { ...originRef, entityId: brandB }; },
    s => { s.context.facts.customer.brandId = brandB; }, s => { delete s.context.facts.customer.brandId; },
    s => { s.pending = true; }, s => { s.loading = true; }, s => { s.approvalBusy = true; },
    s => { s.applicationUnknown = true; }, s => { s.draft = '수정 중인 원문'; },
    s => { s.ownerId = 'umbreon'; }, s => { s.cancelledRequestId = requestId; }, s => { s.rejectedRequestId = requestId; },
    s => { s.request.ownerId = 'umbreon'; }, s => { s.receipt.result.ownerId = 'umbreon'; },
    s => { s.request.mode = 'council'; }, s => { s.receipt.result.mode = 'council'; },
    s => { s.reviewedSources = false; }, s => { s.reviewedQuestions = false; }, s => { s.customerApproval = null; },
    s => { s.customerApprovalKey = 'stale'; }, s => { s.customerApproval.requestId = 'stale'; }, s => { s.customerApproval.reviewedContextHash = 'b'.repeat(64); },
    s => { s.receipt.intent = 'weekly_report'; }, s => { s.receipt.ownerId = 'umbreon'; }, s => { s.receipt.scope = 'classin'; },
    s => { s.receipt.resultRevision = 2; }, s => { s.receipt.originRef = { ...originRef, entityId: brandB }; },
    s => { s.receipt.result.artifact.body = '가'.repeat(1001); },
  ]) { const s = customer(); change(s); assert.equal(officeCustomerConnectionSource(s, boundary).status, 'needs_user'); }
  assert.equal(officeCustomerConnectionSource(customer('personal', null), { scope: 'personal', brandId: null }).status, 'needs_user');
  assert.equal(officeCustomerConnectionSource(customer('personal', null), boundary).status, 'needs_user');
  assert.equal(officeCustomerConnectionSource(customer('classin', null), { scope: 'classin', brandId: null }).status, 'ready');
  assert.equal(officeCustomerConnectionSource(customer(), { scope: 'classin', brandId: brandA }).status, 'needs_user');
});

test('project-inclusive Council source stays needs-user because projects have no selected-brand provenance', () => {
  const turn = council(); turn.request.includeProjects = true;
  const blocked = officeCouncilConnectionSource(turn);
  assert.equal(blocked.status, 'needs_user'); assert.match(blocked.note, /프로젝트 참고를 끄고/);
  assert.equal(turn.request.includeProjects, true);
  const source = officeCouncilConnectionSource({ ...turn, request: { ...turn.request, includeProjects: false } });
  assert.equal(source.status, 'ready');
});

test('saved receipt inspection after reload becomes eligible only after current source/question review and fresh approval', async () => {
  const original = customer(), store = createOfficeWorkflowSessions(), key = 'restored-customer';
  store.update(key, { context: original.context });
  assert.equal(validWorkflowReceipt(original.receipt, { requestId, scope: 'personal' }), true);
  store.selectReceipt(key, original.receipt);
  assert.equal(store.get(key).request, null);
  const boundary = { scope: 'personal', brandId: brandA };
  assert.equal(officeCustomerConnectionSource(store.get(key), boundary).status, 'needs_user');
  const approval = await createOfficeCustomerApproval(original.receipt.result, { sourcesReviewed: true, questionsReviewed: true, reviewedContextHash: original.context.contextHash });
  store.update(key, { reviewedSources: true, reviewedQuestions: true, customerApproval: approval,
    customerApprovalKey: officeCustomerApprovalPayload(original.receipt.result, { reviewedContextHash: original.context.contextHash }) });
  const captured = officeCustomerConnectionSource(store.get(key), boundary);
  assert.equal(captured.status, 'ready');
  assert.equal(captured.source.source.state.request, null);
  assert.equal(captured.source.source.state.receipt.result.artifact.body, original.receipt.result.artifact.body);
  assert.deepEqual(captured.source.source.state.context, original.context);
  assert.deepEqual(captured.source.source.state.customerApproval, approval);
  const inbox = createOfficeConnectionInbox();
  assert.equal(inbox.publish(captured.source).status, 'shared');
});

test('another receipt request is ignored while an exact current original request is preserved verbatim', () => {
  const state = customer(), originalRequest = state.request;
  const direct = officeCustomerConnectionSource(state, { scope: 'personal', brandId: brandA });
  assert.deepEqual(direct.source.source.state.request, originalRequest);
  state.request = { requestId: brandB, intent: 'weekly_report', message: '이전 다른 업무의 원문' };
  const fallback = officeCustomerConnectionSource(state, { scope: 'personal', brandId: brandA });
  assert.equal(fallback.status, 'ready'); assert.equal(fallback.source.source.state.request, null);
  assert.equal(state.request.message, '이전 다른 업무의 원문');
  assert.doesNotMatch(JSON.stringify(fallback.source), /이전 다른 업무의 원문|보관된 고객 대응 원문 연결/);
});

test('restored receipt does not substitute newer customer facts even after a new approval of that newer context', () => {
  const state = customer(); state.request = null;
  state.context = { ...state.context, contextHash: 'b'.repeat(64), facts: { ...state.context.facts, customer: { ...state.context.facts.customer, brandId: brandB } } };
  state.customerApproval = { ...state.customerApproval, reviewedContextHash: state.context.contextHash };
  state.customerApprovalKey = officeCustomerApprovalPayload(state.receipt.result, { reviewedContextHash: state.context.contextHash });
  assert.equal(officeCustomerConnectionSource(state, { scope: 'personal', brandId: brandB }).status, 'needs_user');
  assert.equal(state.receipt.result.context.contextHash, hash);
});

test('restored receipt keeps personal brand and typed customer origin requirements; company unbranded remains eligible', () => {
  const personal = customer(); personal.request = null;
  assert.equal(officeCustomerConnectionSource(personal, { scope: 'personal', brandId: brandA }).status, 'ready');
  for (const mutation of [s => { delete s.context.facts.customer.brandId; }, s => { s.context.facts.customer.id = brandB; }, s => { s.context.facts.customer.entityType = 'deal'; }, s => { s.receipt.originRef = { ...originRef, entityId: brandB }; }]) {
    const state = customer(); state.request = null; mutation(state);
    assert.equal(officeCustomerConnectionSource(state, { scope: 'personal', brandId: brandA }).status, 'needs_user');
  }
  const company = customer('classin', null); company.request = null;
  assert.equal(officeCustomerConnectionSource(company, { scope: 'classin', brandId: null }).status, 'ready');
});

test('receipt fallback cannot bypass saved-status, owner, origin, current approval or context failures', () => {
  for (const mutation of [s => { s.receipt.status = 'unsaved'; }, s => { s.receipt.persistence.persisted = false; }, s => { s.receipt.ownerId = 'umbreon'; },
    s => { s.receipt.scope = 'classin'; }, s => { s.context.status = 'error'; }, s => { s.reviewedQuestions = false; }, s => { s.customerApproval = null; },
    s => { s.cancelledRequestId = requestId; }, s => { s.rejectedRequestId = requestId; }, s => { s.context.facts.customer.id = null; },
    s => { s.context.contextHash = ''; }, s => { s.receipt.originRef = null; }]) {
    const state = customer(); state.request = null; mutation(state);
    assert.equal(officeCustomerConnectionSource(state, { scope: 'personal', brandId: brandA }).status, 'needs_user');
  }
});

test('inbox keeps stable scoped snapshots, at most ten originals, duplicate sharing and explicit removal', () => {
  const inbox = createOfficeConnectionInbox(); let changes = 0;
  const unsubscribe = inbox.subscribe(() => { changes += 1; });
  assert.strictEqual(inbox.get('personal'), inbox.get('personal'));
  for (let index = 0; index < 10; index += 1) {
    const scope = index % 2 ? 'classin' : 'personal';
    const source = officeCouncilConnectionSource(council(`turn-${index}`, scope, scope === 'personal' ? brandA : null)).source;
    assert.equal(inbox.publish(source).status, 'shared');
  }
  assert.equal(inbox.get('all').length, 10);
  const first = inbox.get('personal')[0], original = inbox.get('all');
  assert.equal(inbox.publish(first).status, 'shared');
  assert.strictEqual(inbox.get('all'), original);
  assert.equal(changes, 10);
  assert.equal(inbox.publish(officeCouncilConnectionSource(council('overflow')).source).status, 'needs_user');
  assert.strictEqual(inbox.get('all'), original);
  assert.equal(inbox.remove(first.id), true); assert.equal(inbox.remove(first.id), false);
  assert.equal(inbox.clear('classin'), true); assert.equal(inbox.get('personal').length, 4);
  assert.equal(inbox.get('classin').length, 0);
  unsubscribe(); assert.equal(inbox.clear('all'), true); assert.equal(changes, 12);
  assert.equal(createOfficeConnectionInbox().get('all').length, 0);
});

test('inbox refuses envelope relabels, tampered source boundaries and replacement of an existing original', () => {
  const inbox = createOfficeConnectionInbox(), source = officeCouncilConnectionSource(council()).source;
  for (const changed of [
    { ...source, scope: 'classin' }, { ...source, boundary: { scope: 'personal', brandId: brandB } },
    { ...source, artifactId: 'another' }, { ...source, artifactRevision: 2 },
    { ...source, source: { turn: { ...source.source.turn, officeBoundary: { scope: 'classin', brandId: null } } } },
  ]) assert.equal(inbox.publish(changed).status, 'needs_user');
  assert.equal(inbox.publish(source).status, 'shared');
  const changed = officeCouncilConnectionSource({ ...council(), result: { ...council().result, answer: '나중에 바꾼 본문' } }).source;
  assert.equal(inbox.publish(changed).status, 'needs_user');
  assert.equal(inbox.get('personal')[0].source.turn.result.answer, source.source.turn.result.answer);
});

test('brand reader is read-only, scope filtered and distinguishes partial, preview and failures', async () => {
  const reads = [];
  const read = (body, status = 200, scope = 'personal') => loadOfficeConnectionBrands(scope, { fetcher: async (url, options) => { reads.push([url, options]); return Response.json(body, { status }); } });
  const brands = [{ id: brandA, orgScope: 'personal', name: '선택할 개인 브랜드' }, { id: brandB, orgScope: 'classin', name: '회사 브랜드' }, { id: 'bad', orgScope: 'personal', name: '불확실한 행' }];
  assert.deepEqual((await read({ status: 'ok', brands })).brands, [brands[0]]);
  assert.equal((await read({ status: 'partial', brands })).status, 'partial');
  assert.equal((await read({ status: 'preview', brands })).status, 'preview');
  assert.equal((await read({ status: 'error', brands })).status, 'error');
  assert.equal((await read({ status: 'ok', source: 'error', brands })).status, 'error');
  assert.equal((await read({ status: 'ok', brands }, 502)).status, 'error');
  assert.equal((await read({ status: 'unknown', brands })).status, 'error');
  assert.equal((await loadOfficeConnectionBrands('personal', { fetcher: async () => { throw Error('offline'); } })).status, 'error');
  const before = reads.length;
  assert.equal((await read({ status: 'ok', brands }, 200, 'all')).status, 'needs_user');
  assert.equal(reads.length, before);
  assert.ok(reads.every(([url, options]) => url === '/api/hub/brands' && options.cache === 'no-store' && !options.method));
});
