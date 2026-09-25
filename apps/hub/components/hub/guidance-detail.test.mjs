import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GURU_CARDS, LEGEND_CARDS } from '../../../../packages/guru-guidance/index.ts';
import { GuidanceDetail } from './guidance-detail.jsx';
import { getGuidanceDetailContent } from './guidance-detail-content.js';

const cards = [...GURU_CARDS, ...LEGEND_CARDS];
const card = id => cards.find(item => item.id === id);
const render = (id, props = {}) => renderToStaticMarkup(React.createElement(GuidanceDetail, {
  card: card(id), onClose: () => {}, ...props,
}));

test('every reviewed Guru and Legend has a specific explanation and a boundary', () => {
  assert.equal(GURU_CARDS.length, 23);
  assert.equal(LEGEND_CARDS.length, 3);
  for (const item of cards) {
    const detail = getGuidanceDetailContent(item);
    assert.ok(detail, `${item.id} needs authored detail`);
    assert.ok(detail.steps.length >= 2, `${item.id} needs a claim breakdown`);
    assert.ok(detail.steps.every(step => step.label && step.text), `${item.id} has incomplete steps`);
    assert.ok(detail.boundary.length >= 18, `${item.id} needs a meaningful use boundary`);
    assert.ok(detail.steps.some(step => !item.text.includes(step.text)), `${item.id} should explain beyond the card copy`);
  }
});

test('only source-verified Keenan and Seth excerpts render as quotations', () => {
  const keenan = getGuidanceDetailContent(card('sales-gap'));
  const seth = getGuidanceDetailContent(card('marketing-smallest-market'));
  assert.equal(keenan.excerpt, "In every sale, there's a gap.");
  assert.equal(seth.excerpt, 'Specificity is the way.');
  assert.equal(getGuidanceDetailContent(card('legend-feynman')).excerpt, null);
  assert.equal(getGuidanceDetailContent(card('sales-carnegie-listen')).excerpt, null);
  const changedSource = { ...card('sales-gap'), source: { ...card('sales-gap').source, url: 'https://example.org/' } };
  assert.equal(getGuidanceDetailContent(changedSource).excerpt, null, 'an excerpt is tied to its verified original');
  assert.equal(cards.filter(item => getGuidanceDetailContent(item).excerpt).length, 2);
});

test('unknown cards cannot borrow an authored claim or quotation', () => {
  assert.equal(getGuidanceDetailContent(null), null);
  assert.equal(getGuidanceDetailContent({ id: 'unknown', source: {} }), null);
});

test('detail labels editorial interpretation, excerpt, full source and question distinctly', () => {
  const html = render('sales-gap');
  assert.match(html, /Keenan/);
  assert.match(html, /Moonlight 편집 요약 · 원문의 직접 인용 아님/);
  assert.match(html, /주장 풀어보기 · Moonlight 해석/);
  assert.match(html, /현재 상태/);
  assert.match(html, /써볼 때/);
  assert.match(html, /적용 경계/);
  assert.match(html, /스스로 묻는 질문/);
  assert.match(html, /원문에서 확인한 짧은 발췌/);
  assert.match(html, /In every sale, there&#x27;s a gap\./);
  assert.match(html, /href="https:\/\/salesgrowth\.com\/gap-selling-book\/"/);
  assert.match(html, /data-presentation="compact"/);
});

test('an unverified Legend shows the missing-excerpt state and cannot start a chat', () => {
  const html = render('legend-feynman', { onAsk: () => {} });
  assert.match(html, /검증된 직접 인용 미등록/);
  assert.match(html, /원전 열기/);
  assert.doesNotMatch(html, /질문 쓰기/);
  assert.doesNotMatch(html, /<blockquote/);
});

test('Guru question action is optional and unsafe source URLs never render as links', () => {
  const html = render('marketing-research', { onAsk: () => {} });
  assert.match(html, /질문 쓰기/);
  const unsafe = { ...card('marketing-research'), source: { ...card('marketing-research').source, url: 'javascript:alert(1)' } };
  const unsafeHtml = renderToStaticMarkup(React.createElement(GuidanceDetail, { card: unsafe, onClose: () => {} }));
  assert.doesNotMatch(unsafeHtml, /href="javascript:/);
  assert.match(unsafeHtml, /내부 요약 · 원전 링크 미확인/);
});
