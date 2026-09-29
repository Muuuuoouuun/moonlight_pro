import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuidanceSource } from './guidance-source.jsx';

const source = {
  title: '세일즈 구루 12인 플레이북',
  section: 'Qualification — MEDDIC 프레임워크',
  path: 'docs/sales-guru-knowledge-base.md',
};

test('source credit identifies the internal reference without an outbound link or raw path', () => {
  const html = renderToStaticMarkup(React.createElement(GuidanceSource, {
    source: { ...source, url: 'https://example.org/meddic' },
  }));
  assert.match(html, /세일즈 구루 12인 플레이북/);
  assert.match(html, /Qualification — MEDDIC 프레임워크/);
  assert.match(html, /Moonlight 재구성/);
  assert.doesNotMatch(html, /<a\b|href=|<details|docs\/sales-guru-knowledge-base\.md|원전 열기/);
});

test('adapted source makes the analogy explicit without presenting it as a quotation', () => {
  const html = renderToStaticMarkup(React.createElement(GuidanceSource, {
    source: { ...source, application: 'adapted', note: '원전의 영상 구조를 카드뉴스에 응용' },
  }));
  assert.match(html, /Moonlight 응용/);
  assert.match(html, /원전의 영상 구조를 카드뉴스에 응용/);
  assert.doesNotMatch(html, /직접 인용|원문 그대로|href=/);
});
