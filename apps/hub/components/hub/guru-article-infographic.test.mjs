import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GURU_CARDS, LEGEND_CARDS } from '../../../../packages/guru-guidance/index.ts';
import salesInfographics from '../../content/guru/infographics-sales.json' with { type: 'json' };
import otherInfographics from '../../content/guru/infographics-other.json' with { type: 'json' };
import { GuruArticleInfographic, getGuruInfographic, getGuruInfographicAlt } from './guru-article-infographic.jsx';

test('each reviewed Guru and Legend article has one distinct, bounded infographic summary', () => {
  const ids = [...GURU_CARDS, ...LEGEND_CARDS].map(card => card.id).sort();
  const items = [...salesInfographics, ...otherInfographics];
  assert.deepEqual(items.map(item => item.id).sort(), ids);
  assert.equal(new Set(items.map(item => item.id)).size, ids.length);
  for (const item of items) {
    assert.ok(['path', 'compare', 'filter', 'layers'].includes(item.layout), item.id);
    assert.ok(item.title && item.takeaway && item.boundary, item.id);
    assert.ok(item.nodes.length >= 2 && item.nodes.length <= 4, item.id);
    assert.ok(item.nodes.every(node => node.label && node.detail), item.id);
    assert.ok(getGuruInfographicAlt(item).includes(item.boundary), item.id);
  }
});

test('article infographic shows a private image and a legible mobile text equivalent', () => {
  const card = GURU_CARDS.find(item => item.id === 'sales-gap');
  const html = renderToStaticMarkup(React.createElement(GuruArticleInfographic, { card }));
  assert.match(html, /<figure\b[^>]*class="guidance-detail__infographic"/);
  assert.match(html, /<img\b[^>]*src="\/api\/hub\/guidance-articles\/sales-gap\/infographic"/);
  assert.match(html, /width="1536" height="1024"/);
  assert.match(html, /guidance-detail__infographic-mobile/);
  assert.match(html, /제안 범위/);
  assert.match(html, /<figcaption>/);
  assert.doesNotMatch(html, /<a\b|href=|<button\b|\/visual\b/);
});

test('unregistered card cannot select an infographic asset', () => {
  assert.equal(getGuruInfographic({ id: '../package.json' }), null);
  assert.equal(renderToStaticMarkup(React.createElement(GuruArticleInfographic, { card: { id: '../package.json' } })), '');
});
