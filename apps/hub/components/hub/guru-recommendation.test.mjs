import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { GURU_CARDS } from '@com-moon/guru-guidance';
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
    assert.match(html, /내부 검토에서 아직 확인하지 못한 선택 기준이나 결정 단계는 무엇인가요\?/);
    assert.match(html, /근거<\/span><span>견적 단계 · 내가 정한 9\/20에서 5일 지남 · 그 뒤 연락 기록 없음/);
    assert.match(html, /한빛학원 도입/);
    assert.match(html, /참고 원문/);
    assert.doesNotMatch(html, /이 글 읽기/, 'the article link appears only where the page can navigate');
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

// 2026-09-25 09.bigmac1.5 병합: 카드의 주 읽기는 Moonlight 글(서가 ?card=)이고, 원문 리더는 보조다.
// 실제 컴포넌트 본문을 격리된 훅으로 그려 버튼 동작을 누른다.
function mountRecommendation(props) {
  const source = readFileSync(new URL('./guru-recommendation.jsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(source.replace(/^import[^\n]+\n/gm, '').replace(/^export /gm, ''), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const slots = [];
  let cursor = 0;
  const React = {
    createElement: (type, elementProps, ...children) => ({ type, props: { ...elementProps, children: children.flat(Infinity).filter((child) => child != null && child !== false) } }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useId: () => 'rec-reader',
  };
  const GuidanceSourceReader = function GuidanceSourceReader() {};
  const { GuruRecommendation: Component } = new Function('React', 'GURU_CARDS', 'TruthBadge', 'GuidanceSourceReader', `${js}; return { GuruRecommendation };`)(
    React, GURU_CARDS, 'TruthBadge', GuidanceSourceReader,
  );
  const render = () => { cursor = 0; return Component(props); };
  const find = (tree, predicate) => {
    if (!tree || typeof tree !== 'object') return [];
    return [...(predicate(tree) ? [tree] : []), ...(tree.props?.children || []).flatMap((child) => find(child, predicate))];
  };
  const text = (node) => (node && typeof node === 'object' ? (node.props?.children || []).map(text).join('') : String(node ?? ''));
  return { render, find, text, GuidanceSourceReader };
}

test('reading the Moonlight article is the primary read and the reference original stays secondary', () => {
  const navigations = [];
  const asked = [];
  const app = mountRecommendation({ recommendation: rec(), onAsk: (card) => asked.push(card.id), onNavigate: (path) => navigations.push(path) });
  let tree = app.render();
  const buttons = app.find(tree, (node) => node.type === 'button').map((node) => app.text(node).trim());
  assert.deepEqual(buttons, ['이 글 읽기', '참고 원문', '이 관점으로 질문']);
  app.find(tree, (node) => node.type === 'button' && /이 글 읽기/.test(app.text(node)))[0].props.onClick();
  assert.deepEqual(navigations, ['dashboard/agents/chat?card=sales-meddic']);
  assert.equal(app.find(tree, (node) => node.type === app.GuidanceSourceReader).length, 0);
  app.find(tree, (node) => node.type === 'button' && app.text(node).trim() === '참고 원문')[0].props.onClick();
  tree = app.render();
  const [reader] = app.find(tree, (node) => node.type === app.GuidanceSourceReader);
  assert.equal(reader.props.cardId, 'sales-meddic');
  assert.match(app.text(tree), /참고 원문 접기/);
  assert.deepEqual([navigations.length, asked.length], [1, 0], 'reading never asks the mentor');
});
