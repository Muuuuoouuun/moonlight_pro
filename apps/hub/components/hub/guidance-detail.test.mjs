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

test('detail opens the internal article reader with explicit editorial and loading states', () => {
  const html = render('sales-gap');
  assert.match(html, /Keenan/);
  assert.match(html, /참고자료를 바탕으로 Moonlight가 재구성한 글/);
  assert.match(html, /멘토 글 불러오는 중/);
  assert.match(html, /class="guidance-detail__read-status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /세일즈 구루 12인 플레이북/);
  assert.doesNotMatch(html, /<a\b|href=|원전 열기|원자료 · 원문 확인/);
  assert.match(html, /data-presentation="compact"/);
});

test('an unverified Legend can be read but cannot start a chat', () => {
  const html = render('legend-feynman', { onAsk: () => {} });
  assert.match(html, /Legend 마이크로 카드/);
  assert.doesNotMatch(html, /질문 쓰기/);
  assert.doesNotMatch(html, /<blockquote/);
});

test('Guru question action is optional and source URLs never render as links', () => {
  const html = render('marketing-research', { onAsk: () => {} });
  assert.match(html, /질문 쓰기/);
  const unsafe = { ...card('marketing-research'), source: { ...card('marketing-research').source, url: 'javascript:alert(1)' } };
  const unsafeHtml = renderToStaticMarkup(React.createElement(GuidanceDetail, { card: unsafe, onClose: () => {} }));
  assert.doesNotMatch(unsafeHtml, /href=/);
  assert.match(unsafeHtml, /Moonlight 재구성/);
});
