import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { collectGuruConversationHistory } from '../../lib/guru-chat-history.js';

const source = readFileSync(new URL('./floating-mentor-widget.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('floating-mentor-widget.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'FloatingMentorWidget');
assert.ok(declaration);
const code = ts.transpileModule(declaration.getText(ast).replace(/^export /, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mountWidget({
  agent = 'guru', guidanceId = null, initialTab = 'chat', contextType = 'customer',
  id = 'lead-classin', initialQuestion = '이 고객에게 무엇을 확인할까요?', guruResponses = [],
} = {}) {
  const states = [], refs = [], requests = [], personaRequests = [], councilRequests = [];
  let stateIndex = 0, refIndex = 0, tree;
  const React = { createElement: (type, props, ...children) => ({
    type, props: { ...props, children: children.flat(Infinity).filter(child => child !== undefined && child !== null && child !== false) },
  }), Fragment: 'Fragment' };
  const useState = initial => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  };
  const useRef = initial => {
    const index = refIndex++;
    if (!(index in refs)) refs[index] = { current: initial };
    return refs[index];
  };
  const lensMap = Object.fromEntries(['jobs', 'bezos', 'chouinard', 'voss', 'ogilvy', 'carnegie', 'hill']
    .map(key => [key, { label: key, name: key }]));
  const dependencies = {
    React, useState, useRef, useEffect: () => {},
    createAdviceTaskWriter: () => ({ save: async () => ({ state: 'saved' }) }),
    requestGuruCoaching: async input => { requests.push(input); return guruResponses[requests.length - 1] || { state: 'done', text: '코칭' }; },
    requestCouncilAdvice: async input => { councilRequests.push(input); return { state: 'done', text: '자문' }; },
    requestPersonaChat: async input => { personaRequests.push(input); return { state: 'done', text: '답변' }; },
    LEGEND_LENS_MAP: lensMap, renderAdviceWithCallouts: text => text,
    collectGuruConversationHistory,
    Badge: 'Badge', Button: 'Button', IconButton: 'IconButton', Dot: 'Dot', Iconed: 'Iconed',
  };
  const Widget = new Function(...Object.keys(dependencies), `${code}; return FloatingMentorWidget;`)(...Object.values(dependencies));
  const props = {
    isOpen: true, agent, guidanceId, initialTab,
    initialQuestion, contextType,
    contextTitle: '고객 A', contextData: { id, name: '고객 A', company: 'ClassIn' },
  };
  function render() {
    stateIndex = 0; refIndex = 0;
    tree = Widget(props);
    return tree;
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of node.props?.children || []) {
      const match = find(predicate, child);
      if (match) return match;
    }
    return null;
  }
  render();
  return { render, find, requests, personaRequests, councilRequests };
}

async function submitChat(app, text = null) {
  if (text !== null) {
    const input = app.find(node => node.type === 'input' && node.props.type === 'text');
    assert.ok(input);
    input.props.onChange({ target: { value: text } });
    app.render();
  }
  const form = app.find(node => node.type === 'form' && typeof node.props.onSubmit === 'function');
  assert.ok(form);
  await form.props.onSubmit({ preventDefault() {} });
  app.render();
}

test('selected customer Guru card chat sends a freeform question with its card and customer reference', async () => {
  const app = mountWidget({ guidanceId: 'sales-gap' });
  await submitChat(app);
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].mode, 'open-question');
  assert.equal(app.requests[0].guidanceId, 'sales-gap');
  assert.equal(app.requests[0].ref, 'lead-classin');
});

test('Guru widget passes bounded completed chat history separately from the current question', async () => {
  const app = mountWidget({ guidanceId: 'sales-gap', initialQuestion: '첫 질문' });
  await submitChat(app);
  await submitChat(app, '방금 조언을 줄여줘');
  assert.equal(app.requests[1].guidanceId, null, 'a card is only selected for the first question');
  assert.deepEqual(app.requests[1].history, [{ question: '첫 질문', answer: '코칭', guidanceId: 'sales-gap' }]);
  assert.match(app.requests[1].draft, /방금 조언을 줄여줘/);
  assert.doesNotMatch(app.requests[1].draft, /이전 대화|Guru: 코칭/);
});

test('Guru widget excludes failed answers and bounds history to the latest three exchanges', async () => {
  const app = mountWidget({ initialQuestion: '실패 질문', guruResponses: [{ state: 'error', note: '실패' }] });
  await submitChat(app);
  for (const number of [1, 2, 3, 4]) await submitChat(app, `성공 질문 ${number}`);
  await submitChat(app, '마지막 후속 질문');
  assert.deepEqual(app.requests.at(-1).history.map(turn => turn.question), ['성공 질문 2', '성공 질문 3', '성공 질문 4']);
  assert.equal(app.requests.at(-1).history.some(turn => turn.answer.includes('실패')), false);
});

test('Council chat keeps its existing draft conversation path', async () => {
  const app = mountWidget({ agent: 'council', contextType: 'content', initialQuestion: '첫 질문' });
  await submitChat(app);
  await submitChat(app, '후속 질문');
  assert.match(app.councilRequests[1].draft, /이전 대화:/);
  assert.match(app.councilRequests[1].draft, /Council: 자문/);
});

test('Guru persona lens requests are conversation only in critique and chat', async () => {
  const app = mountWidget({ guidanceId: 'sales-gap', initialTab: 'critique' });
  const lens = app.find(node => node.type === 'button' && node.props.children.includes('jobs'));
  assert.ok(lens);
  lens.props.onClick(); app.render();
  const button = app.find(node => node.type === 'Button' && node.props.children.includes('냉철 평가 재실행'));
  assert.ok(button);
  await button.props.onClick();
  assert.equal(app.personaRequests[0].conversationOnly, true);

  const chat = mountWidget({ guidanceId: 'sales-gap' });
  const chatLens = chat.find(node => node.type === 'button' && node.props.children.includes('jobs'));
  chatLens.props.onClick(); chat.render();
  await submitChat(chat);
  assert.equal(chat.personaRequests[0].conversationOnly, true);
  assert.deepEqual(chat.personaRequests[0].context, { source: 'operator-provided', scope: 'selected-record' });
  assert.match(chat.personaRequests[0].draft, /고객 A/);

  const defaultLens = chat.find(node => node.type === 'button' && node.props.children.includes('기본'));
  defaultLens.props.onClick(); chat.render();
  await submitChat(chat, 'Guru에게 이어서 묻습니다');
  assert.deepEqual(chat.requests[0].history, [], 'persona lens answer is not attributed to Guru history');
});

test('Guru quick actions retain their named mode after switching away from a legend lens', async () => {
  const app = mountWidget({ initialTab: 'chat', contextType: 'deal', id: 'deal-classin' });
  const lens = app.find(node => node.type === 'button' && node.props.children.includes('jobs'));
  assert.ok(lens);
  lens.props.onClick(); app.render();
  const quick = app.find(node => node.type === 'button' && node.props.children.includes('⚡ 조언'));
  quick.props.onClick(); app.render();
  assert.equal(app.find(node => node.type === 'button' && node.props.children.includes('jobs')), null);
  const button = app.find(node => node.type === 'Button' && node.props.children.includes('딜 진단 (Keenan 4층)'));
  await button.props.onClick();
  assert.equal(app.requests[0].mode, 'deal-review');
  assert.equal(app.personaRequests.length, 0);
});

test('explicit Guru quick deal review remains a deal review', async () => {
  const app = mountWidget({ guidanceId: null, initialTab: 'quick', contextType: 'deal', id: 'deal-classin' });
  const button = app.find(node => node.type === 'Button' && node.props.children.includes('딜 진단 (Keenan 4층)'));
  assert.ok(button);
  await button.props.onClick();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].mode, 'deal-review');
  assert.equal(app.requests[0].ref, 'deal-classin');
});
