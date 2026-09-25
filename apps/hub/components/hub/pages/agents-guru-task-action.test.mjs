import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./agents.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('agents.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'AgentsChat');
assert.ok(declaration);
const code = ts.transpileModule(declaration.getText(ast).replace(/^export /, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function taskActionsFor(agentKey, message) {
  let stateIndex = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    Fragment: 'Fragment',
    useState: initial => [stateIndex++ === 4 ? [message] : initial, () => {}],
    useRef: initial => ({ current: initial }),
    useCallback: fn => fn,
    useEffect: () => {},
  };
  const personas = {
    guru: { name: 'Guru', role: '영업 멘토', intro: [] },
    sales: { name: '세일즈', role: '영업', model: '모델', intro: [] },
  };
  const lensMap = Object.fromEntries(['jobs', 'bezos', 'chouinard', 'voss', 'ogilvy', 'carnegie', 'hill']
    .map(id => [id, { label: id, name: id }]));
  const dependencies = {
    React, CHAT_PERSONAS: personas, DEFAULT_PERSONA_KEY: agentKey,
    LEGEND_LENS_MAP: lensMap, GURU_CARDS: [], GURU_MODE_LABEL: {},
    GURU_PREVIEW_NOTE: '', collectGuruConversationHistory: () => [],
    Avatar: 'Avatar', Button: 'Button', IconButton: 'IconButton', GuruGuidanceCard: 'GuruGuidanceCard',
  };
  const AgentsChat = new Function(...Object.keys(dependencies), `${code}; return AgentsChat;`)(...Object.values(dependencies));
  const tree = AgentsChat({});
  const buttons = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Button' && node.props.children.includes('태스크로 등록')) buttons.push(node);
    for (const child of node.props?.children || []) visit(child);
  }
  visit(tree);
  return buttons;
}

test('Guru greeting cannot become a task; a generated answer can', () => {
  const greeting = { role: 'agent', name: 'Guru', text: '필요할 때 관점을 빌려드릴게요.' };
  const answer = { role: 'agent', name: 'Guru', text: '답변입니다.', generated: true };
  assert.equal(taskActionsFor('guru', greeting).length, 0);
  assert.equal(taskActionsFor('guru', answer).length, 1);
});

test('existing persona replies retain their task action', () => {
  const reply = { role: 'agent', name: '세일즈', text: '고객과 다음 단계를 확인합니다.' };
  assert.equal(taskActionsFor('sales', reply).length, 1);
});
