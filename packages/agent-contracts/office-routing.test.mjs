import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficeRoutingRequest, parseOfficeRoutingRecommendation, parseOfficeRoutingResult, OFFICE_ROUTING_VERSION } from './office-routing.js';

const request = { message: '고객 미팅 뒤 견적 답장을 준비해 주세요.', scope: 'classin' };
const recommendation = { ownerId: 'flareon', reviewerIds: ['leafeon', 'umbreon'], reason: '고객 답장은 부스터가 맡고 비용과 약속을 함께 확인합니다.', scope: 'classin', plan: { ownerDeliverable: '고객 견적 답장 초안 한 편', reviews: [{ reviewerId: 'leafeon', question: '가격과 유지 비용을 같은 기간으로 비교했는가?' }, { reviewerId: 'umbreon', question: '지원 약속이 제공된 근거와 일치하는가?' }] } };

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
  assert.deepEqual(parseOfficeRoutingRecommendation({ ...recommendation, reviewerIds: [], plan: { ownerDeliverable: recommendation.plan.ownerDeliverable, reviews: [] } }, request).reviewerIds, []);
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


test('v2 model recommendations require a bounded owner deliverable and one question per reviewer', () => {
  assert.equal(OFFICE_ROUTING_VERSION, '2026-10-04.v2');
  for (const plan of [
    undefined, null, {}, { ownerDeliverable: '', reviews: recommendation.plan.reviews },
    { ownerDeliverable: '가'.repeat(301), reviews: recommendation.plan.reviews },
    { ...recommendation.plan, reviews: [] },
    { ...recommendation.plan, reviews: [...recommendation.plan.reviews].reverse() },
    { ...recommendation.plan, reviews: [{ reviewerId: 'flareon', question: '범위를 확인하는가?' }, recommendation.plan.reviews[1]] },
    { ...recommendation.plan, reviews: [{ reviewerId: 'leafeon', question: '' }, recommendation.plan.reviews[1]] },
    { ...recommendation.plan, reviews: [{ reviewerId: 'leafeon', question: '가'.repeat(301) }, recommendation.plan.reviews[1]] },
    { ...recommendation.plan, execute: true },
    { ...recommendation.plan, reviews: [{ ...recommendation.plan.reviews[0], callTool: true }, recommendation.plan.reviews[1]] },
  ]) assert.throws(() => parseOfficeRoutingRecommendation({ ...recommendation, plan }, request));
});

test('review questions are distinct after Unicode, case and whitespace normalization', () => {
  for (const questions of [[' 같은  근거인가? ', '같은 근거인가?'], ['ROI 비교', 'ＲＯＩ 비교'], ['ROI 비교', 'roi 비교']]) {
    const reviews = recommendation.reviewerIds.map((reviewerId, index) => ({ reviewerId, question: questions[index] }));
    assert.throws(() => parseOfficeRoutingRecommendation({ ...recommendation, plan: { ...recommendation.plan, reviews } }, request));
  }
  const parsed = parseOfficeRoutingRecommendation({ ...recommendation, plan: { ownerDeliverable: '  고객 답장  ', reviews: recommendation.plan.reviews } }, request);
  assert.equal(parsed.plan.ownerDeliverable, '고객 답장');
});

test('v1 stored results remain readable without inventing a plan; new generations cannot use v1 shape', () => {
  const { plan, ...legacy } = recommendation;
  const result = { status: 'recommended', version: '2026-09-24.v1', ...legacy };
  assert.deepEqual(parseOfficeRoutingResult(result, request), result);
  assert.throws(() => parseOfficeRoutingRecommendation(legacy, request));
  assert.throws(() => parseOfficeRoutingResult({ ...result, version: OFFICE_ROUTING_VERSION }, request));
  assert.throws(() => parseOfficeRoutingResult({ ...result, plan }, request));
});
