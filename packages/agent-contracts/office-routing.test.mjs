import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficeRoutingRequest, parseOfficeRoutingRecommendation, parseOfficeRoutingResult, OFFICE_ROUTING_VERSION } from './office-routing.js';

const request = { message: '고객 미팅 뒤 견적 답장을 준비해 주세요.', scope: 'classin' };
const recommendation = { ownerId: 'flareon', reviewerIds: ['leafeon', 'umbreon'], reason: '고객 답장은 부스터가 맡고 비용과 약속을 함께 확인합니다.', scope: 'classin' };

test('routing accepts only a bounded copied agenda and scope', () => {
  assert.deepEqual(parseOfficeRoutingRequest(request), request);
  assert.deepEqual(parseOfficeRoutingRequest({ message: '  안건  ', scope: 'personal' }), { message: '안건', scope: 'personal' });
  for (const value of [
    { ...request, message: '' }, { ...request, message: '가'.repeat(6001) },
    { ...request, scope: 'company' }, { ...request, taskId: 'task' },
    { ...request, participants: ['flareon'] }, null,
  ]) assert.throws(() => parseOfficeRoutingRequest(value));
});

test('Eevee recommendation has one registered owner, zero to two distinct other reviewers, reason and matching scope', () => {
  assert.deepEqual(parseOfficeRoutingRecommendation(recommendation, request), recommendation);
  assert.deepEqual(parseOfficeRoutingRecommendation({ ...recommendation, reviewerIds: [] }, request).reviewerIds, []);
  for (const change of [
    { ownerId: 'guru' }, { ownerId: null }, { reviewerIds: ['flareon'] },
    { reviewerIds: ['umbreon', 'umbreon'] }, { reviewerIds: ['umbreon', 'leafeon', 'espeon'] },
    { reviewerIds: ['legend'] }, { reviewerIds: undefined }, { reason: '' },
    { reason: '가'.repeat(401) }, { scope: 'personal' },
    { taskWrite: true },
  ]) assert.throws(() => parseOfficeRoutingRecommendation({ ...recommendation, ...change }, request));
});

test('transport result binds the current contract and rejects persistence claims', () => {
  const result = { status: 'recommended', version: OFFICE_ROUTING_VERSION, ...recommendation };
  assert.deepEqual(parseOfficeRoutingResult(result, request), result);
  for (const change of [{ version: 'old' }, { status: 'generated' }, { businessWrites: true }, { scope: 'personal' }]) {
    assert.throws(() => parseOfficeRoutingResult({ ...result, ...change }, request));
  }
});
