import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GURU_CARDS, LEGEND_CARDS } from '@com-moon/guru-guidance';
import { GuidanceAnswer, GuidanceQuestionDrawer } from './guidance-question-drawer.jsx';

test('question drawer keeps a customer-facing card prompt out of the mentor message', () => {
  const previous = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => { sends += 1; throw new Error('unexpected request'); };
  try {
    const card = GURU_CARDS.find(item => item.domain === 'marketing');
    const html = renderToStaticMarkup(React.createElement(GuidanceQuestionDrawer, { card, context: { ref: 'sinabro', label: '시나브로' }, onClose: () => {} }));
    assert.match(html, /Seth Godin/);
    assert.match(html, /마케팅·브랜딩 구루 조사/);
    assert.match(html, /브랜드 멘토에게 보내기/);
    assert.match(html, /<textarea[^>]*><\/textarea>/);
    assert.doesNotMatch(html, /이 메시지를 가장 먼저 자기 이야기로 받아들일 사람은 누구인가요/);
    assert.match(html, /대상 브랜드 · 시나브로/);
    assert.equal(sends, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test('question drawer keeps mobile input and send targets usable', () => {
  const css = readFileSync(new URL('./guidance-question-drawer.css', import.meta.url), 'utf8');
  assert.match(css, /textarea\.guidance-question__input\s*\{[^}]*font-size:\s*16px/);
  assert.match(css, /\.guidance-question__footer-button\s*\{[^}]*min-height:\s*44px/);
});

test('Legend reading cannot open a question drawer', () => {
  assert.equal(renderToStaticMarkup(React.createElement(GuidanceQuestionDrawer, { card: LEGEND_CARDS[0], onClose: () => {} })), '');
});

test('generated advice renders headings, bullets, and emphasis as readable safe text', () => {
  const html = renderToStaticMarkup(React.createElement(GuidanceAnswer, {
    text: '**1. 관찰**\n* **사실**: 확인된 내용\n* 다음 질문\n\n판단은 직접 합니다.',
  }));
  assert.match(html, /<h4>1\. 관찰<\/h4>/);
  assert.match(html, /<ul><li><strong>사실<\/strong>: 확인된 내용<\/li><li>다음 질문<\/li><\/ul>/);
  assert.match(html, /<p>판단은 직접 합니다\.<\/p>/);
  assert.doesNotMatch(html, /\*\*/);
  assert.match(html, /role="status"[^>]*>답변이 도착했습니다\.<\/span>/);
});
