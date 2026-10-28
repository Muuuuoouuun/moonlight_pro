import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { councilChatPath } from '../council-client.js';
import { RECOMMENDED_TRIADS } from '../council-legends.js';
import { createCouncilDraftState, reduceCouncilDraft, COUNCIL_HANDOFF_DRAFT_LIMIT } from '../council-desktop-handoff.js';

const source = readFileSync(new URL('./agents.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('agents.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function component(name, states, extras = {}) {
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  const code = ts.transpileModule(declaration.getText(ast).replace(/^export /, ''), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let stateIndex = 0;
  const dependencies = {
    React: {
      Fragment: 'Fragment',
      createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(value => value != null && value !== false) } }),
      useState: initial => { const index = stateIndex++; return [Object.hasOwn(states, index) ? states[index] : initial, () => {}]; },
      useRef: value => ({ current: value }), useCallback: callback => callback, useEffect() {},
      useReducer: (_reducer, _initial, initialize) => [initialize(), () => {}],
    },
    DEFAULT_PERSONA_KEY: 'order', CHAT_PERSONAS: { order: { name: '오더', intro: [] } },
    GURU_LENS_CHIPS: [], GURU_LENS_MAP: {}, GURU_CARDS: [], TASK_OUTCOME: {},
    councilChatPath, RECOMMENDED_TRIADS, createCouncilDraftState, reduceCouncilDraft, COUNCIL_HANDOFF_DRAFT_LIMIT,
    ...extras,
  };
  for (const primitive of ['Card', 'Badge', 'Dot', 'Button', 'IconButton', 'Avatar', 'Kbd', 'GuruGuidanceCard', 'TruthBadge', 'Iconed', 'TextAreaField']) dependencies[primitive] = primitive;
  return new Function(...Object.keys(dependencies), `${code}\nreturn ${name};`)(...Object.values(dependencies));
}
function nodes(predicate, node) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => nodes(predicate, child))];
}
const text = node => typeof node === 'string' ? node : node?.props?.children.map(text).join('') || '';

test('legacy conversation history states its limit without offering fake restoration controls', () => {
  const Component = component('AgentsChat', { 5: [
    { name: '현재 세션', active: true, agent: '오더', time: '지금' },
    { name: '이전 세션', active: false, agent: '오더', time: '이전' },
  ] });
  const tree = Component({});
  assert.match(text(tree), /이전 대화 복원은 준비 중/);
  assert.match(text(tree), /이전 세션 · 복원 준비 중/);
  assert.equal(nodes(node => node.type === 'button' && /이전 세션/.test(text(node)), tree).length, 0);
  const attach = nodes(node => node.type === 'Button' && text(node) === '첨부 준비 중', tree)[0];
  assert.equal(attach.props.disabled, true);
  assert.equal(attach.props.onClick, undefined);
  assert.match(attach.props.title, /아직 연결되지 않았습니다/);
});

test('Council links to a new chat and explicitly says the current advice is not passed along', () => {
  const Component = component('CouncilCoachPanel', { 0: 'done', 1: '검토된 자문 결과' });
  const paths = [], tree = Component({ onNavigate: path => paths.push(path) });
  const launch = nodes(node => node.type === 'Button' && text(node) === '새 자문 대화 열기', tree)[0];
  assert.ok(launch);
  assert.match(text(tree), /현재 안건과 답변은 자동 전달되지 않습니다/);
  assert.doesNotMatch(text(tree), /코칭·대화에서 이어가기/);
  launch.props.onClick();
  assert.deepEqual(paths, ['dashboard/agents/chat?agent=council']);
  assert.equal(new URLSearchParams(paths[0].split('?')[1]).has('prompt'), false, 'opening the new chat does not request automatic synthesis');
});
