import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GuruRecommendation,
  GuruRecommendationList,
  guruRecommendationCard,
  recommendationAskContext,
} from './guru-recommendation.jsx';
import { actRecommendations, recommendationForSubject } from './guru-recommendations-client.js';

const rec = (over = {}) => ({
  id: 'quote-date-passed:deal:deal-1',
  ruleId: 'quote-date-passed',
  cardId: 'sales-meddic',
  severity: 'act',
  basis: 'record',
  subject: { type: 'deal', id: 'deal-1', name: '한빛학원 도입', lane: 'classin', laneBlocked: false },
  facts: ['견적 단계', '내가 정한 9/20에서 5일 지남', '그 뒤 연락 기록 없음'],
  reason: '견적 단계 · 내가 정한 9/20에서 5일 지남 · 그 뒤 연락 기록 없음',
  ...over,
});

const render = (element) => renderToStaticMarkup(element);

test('a recommendation shows the technique, its question and the stored facts as the reason', () => {
  const previous = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => { sends += 1; throw new Error('unexpected request'); };
  try {
    const html = render(React.createElement(GuruRecommendation, { recommendation: rec(), onAsk: () => {}, showSubject: true }));
    assert.match(html, /기록 기반 추천/);
    assert.match(html, /Dick Dunkel · MEDDIC/);
    assert.match(html, /내부에서 이 제안을 판단할 때 기준과 최종 승인 과정은 어떻게 되나요\?/);
    assert.match(html, /근거<\/span><span>견적 단계 · 내가 정한 9\/20에서 5일 지남 · 그 뒤 연락 기록 없음/);
    assert.match(html, /한빛학원 도입/);
    assert.match(html, /원문 보기/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /이 관점으로 질문/);
    // 원문 리더는 운영자가 열 때만 붙는다 — 렌더만으로 아무것도 읽거나 보내지 않는다.
    assert.doesNotMatch(html, /원문 그대로 ·/);
    assert.equal(sends, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test('asking is offered only for a confirmed ClassIn record, with the shown facts as context', () => {
  assert.deepEqual(recommendationAskContext(rec()), {
    label: '한빛학원 도입', ref: 'deal-1', facts: ['견적 단계', '내가 정한 9/20에서 5일 지남', '그 뒤 연락 기록 없음'],
  });
  for (const subject of [
    { type: 'deal', id: 'deal-1', name: 'A', lane: 'personal', laneBlocked: false },
    { type: 'deal', id: 'deal-1', name: 'A', lane: null, laneBlocked: true },
    { type: 'deal', id: '', name: 'A', lane: 'classin', laneBlocked: false },
  ]) {
    assert.equal(recommendationAskContext(rec({ subject })), null, JSON.stringify(subject));
    const html = render(React.createElement(GuruRecommendation, { recommendation: rec({ subject }), onAsk: () => {} }));
    assert.doesNotMatch(html, /이 관점으로 질문/, JSON.stringify(subject));
  }
  const blocked = render(React.createElement(GuruRecommendation, { recommendation: rec({ subject: { type: 'deal', id: 'd', name: 'A', lane: null, laneBlocked: true } }) }));
  assert.match(blocked, /소속 확인 필요/);
});

test('an agenda match says it came from the agenda wording', () => {
  const html = render(React.createElement(GuruRecommendation, {
    recommendation: { id: 'agenda:decision-process', ruleId: 'decision-process', cardId: 'sales-meddic', basis: 'agenda', facts: ['안건 문구 “…견적 보낸 뒤…”'] },
    onAsk: () => {},
  }));
  assert.match(html, /안건 문구 기준/);
  assert.match(html, /안건 문구 “…견적 보낸 뒤…”/);
});

test('an unknown card renders nothing rather than an unsourced tip', () => {
  assert.equal(guruRecommendationCard({ cardId: 'invented' }), null);
  assert.equal(render(React.createElement(GuruRecommendation, { recommendation: rec({ cardId: 'invented' }) })), '');
});

test('list surfaces stay silent while loading, in preview or with nothing to recommend, and say so on a read failure', () => {
  for (const status of ['idle', 'loading', 'preview']) {
    assert.equal(render(React.createElement(GuruRecommendationList, { result: { status, recommendations: [rec()] } })), '', status);
  }
  assert.equal(render(React.createElement(GuruRecommendationList, { result: { status: 'live', recommendations: [rec({ severity: 'organize' })] } })), '');
  const error = render(React.createElement(GuruRecommendationList, { result: { status: 'error', recommendations: [] }, onRetry: () => {} }));
  assert.match(error, /기록 기반 추천을 불러오지 못했습니다/);
  assert.match(error, /다시 불러오기/);
  const partial = render(React.createElement(GuruRecommendationList, { result: { status: 'partial', recommendations: [rec()] } }));
  assert.match(partial, /연락 기록 일부를 읽지 못했습니다/);
  assert.match(partial, /MEDDIC/);
});

test('the list shows at most three act-level items, and a drawer finds its own record by id', () => {
  const result = {
    status: 'live',
    recommendations: [1, 2, 3, 4].map((n) => rec({ id: `r${n}`, subject: { type: 'deal', id: `deal-${n}`, name: `고객 ${n}`, lane: 'classin' } })),
  };
  assert.equal(actRecommendations(result).length, 3);
  const html = render(React.createElement(GuruRecommendationList, { result }));
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.equal(recommendationForSubject(result, 'deal-4').id, 'r4');
  assert.equal(recommendationForSubject(result, 'deal-9'), null);
  assert.equal(recommendationForSubject({ status: 'error' }, 'deal-1'), null);
});
