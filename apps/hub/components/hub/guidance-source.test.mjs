import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuidanceSource, safeGuidanceSourceUrl } from './guidance-source.jsx';

const source = {
  title: '세일즈 구루 12인 플레이북',
  section: 'Qualification — MEDDIC 프레임워크',
  path: 'docs/sales-guru-knowledge-base.md',
};

test('verified HTTPS original links open safely while internal paths stay in details', () => {
  const html = renderToStaticMarkup(React.createElement(GuidanceSource, {
    source: { ...source, url: 'https://example.org/meddic' },
  }));
  assert.match(html, /세일즈 구루 12인 플레이북/);
  assert.match(html, /Qualification — MEDDIC 프레임워크/);
  assert.match(html, /href="https:\/\/example\.org\/meddic"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /<details[^>]*>[\s\S]*docs\/sales-guru-knowledge-base\.md[\s\S]*<\/details>/);
});

test('unverified and unsafe URLs never become original links', () => {
  assert.equal(safeGuidanceSourceUrl('javascript:alert(1)'), null);
  assert.equal(safeGuidanceSourceUrl('https://user:pass@example.org/private'), null);
  const html = renderToStaticMarkup(React.createElement(GuidanceSource, {
    source: { ...source, url: 'javascript:alert(1)' },
  }));
  assert.match(html, /내부 요약 · 원전 링크 미확인/);
  assert.doesNotMatch(html, /href=/);
});

test('adapted source makes the analogy explicit without presenting it as a quotation', () => {
  const html = renderToStaticMarkup(React.createElement(GuidanceSource, {
    source: { ...source, application: 'adapted', note: '원전의 영상 구조를 카드뉴스에 응용' },
  }));
  assert.match(html, /Moonlight 응용/);
  assert.match(html, /원전의 영상 구조를 카드뉴스에 응용/);
  assert.doesNotMatch(html, /직접 인용|원문 그대로/);
});

test('source link and disclosure remain full touch targets', () => {
  const css = readFileSync(new URL('./guidance-source.css', import.meta.url), 'utf8');
  assert.match(css, /\.guidance-source__link\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.guidance-source__details summary\s*\{[^}]*min-height:\s*44px/);
});
