import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { GURU_CARDS, LEGEND_CARDS } from '@com-moon/guru-guidance';
import { containChatTab, GuidanceAnswer, GuidanceQuestionDrawer } from './guidance-question-drawer.jsx';

function mountChat(request, card = GURU_CARDS.find(item => item.domain === 'marketing')) {
  const source = readFileSync(new URL('./guidance-question-drawer.jsx', import.meta.url), 'utf8');
  const slots = [];
  let cursor = 0;
  const FakeReact = {
    Fragment: Symbol('fragment'),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(child => child != null && child !== false) } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect() {},
  };
  const Button = function Button() {};
  const IconButton = function IconButton() {};
  const TextAreaField = function TextAreaField() {};
  const TruthBadge = function TruthBadge() {};
  const GuidanceSource = function GuidanceSource() {};
  const compiled = ts.transpile(source.replace(/^import[^\n]+\n/gm, '').replace(/^export /gm, ''), {
    jsx: ts.JsxEmit.React,
    target: ts.ScriptTarget.ES2022,
  });
  const QuestionChat = new Function('React', 'GURU_CARDS', 'Button', 'IconButton', 'TextAreaField', 'TruthBadge', 'GuidanceSource', 'requestGuidanceAdvice', 'pushEscLayer', 'popEscLayer', 'isTopEscLayer', `${compiled}\nreturn QuestionChat;`)(
    FakeReact, GURU_CARDS, Button, IconButton, TextAreaField, TruthBadge, GuidanceSource, request,
    () => 1, () => {}, () => true,
  );
  return {
    Button,
    TextAreaField,
    render() { cursor = 0; return QuestionChat({ card, context: { ref: 'sinabro', label: '시나브로' }, onClose: () => {} }); },
  };
}

function nodes(tree, match) {
  const found = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (match(node)) found.push(node);
    for (const child of node.props?.children || []) visit(child);
  };
  visit(tree);
  return found;
}

function words(node) {
  if (!node || typeof node !== 'object') return String(node ?? '');
  return (node.props?.children || []).map(words).join(' ');
}

test('floating chat opens with a source lens and an empty operator input without making a request', () => {
  const previous = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => { sends += 1; throw new Error('unexpected request'); };
  try {
    const card = GURU_CARDS.find(item => item.domain === 'marketing');
    const html = renderToStaticMarkup(React.createElement(GuidanceQuestionDrawer, { card, context: { ref: 'sinabro', label: '시나브로' }, onClose: () => {} }));
    assert.match(html, /Seth Godin/);
    assert.match(html, /마케팅·브랜딩 구루 조사/);
    assert.match(html, /브랜드 멘토에게 보내기/);
    assert.match(html, /role="dialog"[^>]*aria-modal="false"/);
    assert.match(html, /class="guidance-chat/);
    assert.doesNotMatch(html, /hub-drawer-overlay/);
    assert.match(html, /<textarea[^>]*><\/textarea>/);
    assert.match(html, /생각해 볼 질문 · 이 메시지를 가장 먼저 자기 이야기로 받아들일 사람은 누구인가요/);
    assert.match(html, /대상 브랜드 · 시나브로/);
    assert.equal(sends, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test('floating chatbot can begin without attributing a question to an arbitrary card', () => {
  const html = renderToStaticMarkup(React.createElement(GuidanceQuestionDrawer, {
    context: { free: true }, onClose: () => {},
  }));
  assert.match(html, /영업 Guru/);
  assert.match(html, /자유 질문/);
  assert.doesNotMatch(html, /선택한 관점/);
});

test('floating chat keeps mobile input and send targets usable', () => {
  const css = readFileSync(new URL('./guidance-question-drawer.css', import.meta.url), 'utf8');
  assert.match(css, /\.guidance-chat\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /textarea\.guidance-chat__input\s*\{[^}]*font-size:\s*16px/);
  assert.match(css, /\.guidance-chat__send\s*\{[^}]*min-height:\s*44px/);
});

test('full-screen chat wraps keyboard focus within its visible controls', () => {
  const focused = [];
  const first = { focus: () => focused.push('first') };
  const last = { focus: () => focused.push('last') };
  const root = { querySelectorAll: () => [first, last], contains: element => element === first || element === last };
  const tab = (shiftKey, active) => {
    let prevented = false;
    containChatTab({ key: 'Tab', shiftKey, preventDefault: () => { prevented = true; } }, root, active);
    return prevented;
  };
  assert.equal(tab(false, last), true);
  assert.equal(tab(true, first), true);
  assert.equal(tab(false, first), false);
  assert.equal(tab(false, {}), true);
  assert.deepEqual(focused, ['first', 'last', 'first']);
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

test('follow-up questions carry completed turns and minimizing keeps the conversation', async () => {
  const calls = [];
  const app = mountChat(async (card, question, context, history) => {
    calls.push({ card, question, context, history });
    return { state: 'done', text: `답변 ${calls.length}` };
  });
  let tree = app.render();
  assert.equal(calls.length, 0);
  nodes(tree, node => node.type === app.TextAreaField)[0].props.onChange({ target: { value: '첫 질문' } });
  tree = app.render();
  nodes(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  tree = app.render();
  assert.match(words(tree), /첫 질문/);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].history, []);

  nodes(tree, node => node.type === app.TextAreaField)[0].props.onChange({ target: { value: '후속 질문' } });
  tree = app.render();
  nodes(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  tree = app.render();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].history.length, 1);
  assert.equal(calls[1].history[0].question, '첫 질문');
  assert.equal(calls[1].history[0].answer, '답변 1');
  assert.equal(calls[1].history[0].guidanceId, calls[1].card.id);

  nodes(tree, node => node.type === app.Button && node.props['aria-label'] === '대화 최소화')[0].props.onClick();
  tree = app.render();
  assert.match(words(tree), /대화 다시 열기\s+· 2회/);
  nodes(tree, node => node.type === app.Button)[0].props.onClick();
  tree = app.render();
  assert.match(words(tree), /첫 질문/);
  assert.match(words(tree), /후속 질문/);
  assert.equal(calls.length, 2);
});

test('failed response restores the operator draft for a deliberate retry', async () => {
  const app = mountChat(async () => ({ state: 'error', note: '연결 실패' }));
  let tree = app.render();
  nodes(tree, node => node.type === app.TextAreaField)[0].props.onChange({ target: { value: '다시 보낼 질문' } });
  tree = app.render();
  nodes(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  tree = app.render();
  assert.equal(nodes(tree, node => node.type === app.TextAreaField)[0].props.value, '다시 보낼 질문');
  assert.match(words(tree), /답변을 받지 못했습니다/);
  assert.equal(nodes(tree, node => node.props?.role === 'alert').length, 1);
});
