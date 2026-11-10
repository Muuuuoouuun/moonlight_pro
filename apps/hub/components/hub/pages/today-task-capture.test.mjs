import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createQuickCaptureSession, shouldSubmitQuickTask, submitQuickCapture } from '../../../lib/quick-task-capture.js';
import { dateKeyInZone } from '../../../lib/task-today.js';
import { isCanonicalUuid } from '../../../lib/uuid.js';

function compile(file, names) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  return ts.transpileModule(ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.includes(item.name.getText(ast))))
    .map(node => node.getText(ast).replace(/^export /, '')).join('\n'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const captureCode = compile('./today-task-capture.jsx', ['TodayTaskCapture']);
const formCode = compile('../quick-capture.jsx', ['HINTS', 'QuickCaptureForm']);
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(item => find(item, predicate)) : node && typeof node === 'object'
  ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null ? '' : String(node);
function hooks() {
  const state = []; let index = 0;
  return { React: {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) { const key = index++; if (!(key in state)) state[key] = typeof initial === 'function' ? initial() : initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(initial) { const key = index++; return state[key] ??= { current: initial }; },
    useEffect() {}, useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  }, render(callback) { index = 0; return callback(); } };
}
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

function mount({ picked = 0 } = {}) {
  const wrapper = hooks(), form = hooks(); let key = 0, reads = 0, tree, formTree;
  const date = dateKeyInZone(new Date()), chosen = [];
  const actions = { pendingIds: [], async run(task, body) { chosen.push({ task, body }); return chosen.length === 1 ? { ok: false, message: '선택 응답을 확인하지 못했습니다.' } : { ok: true }; } };
  const createClientId = () => `00000000-0000-4000-8000-${String(++key).padStart(12, '0')}`;
  const captureDeps = { React: wrapper.React, QuickCaptureForm: 'QuickCaptureForm', Button: 'Button', CheckboxRow: 'CheckboxRow', dateKeyInZone, MAX_FOCUS_PER_DAY: 3, isCanonicalUuid, createQuickCaptureSession, createClientId };
  const Capture = new Function(...Object.keys(captureDeps), `${captureCode}; return TodayTaskCapture;`)(...Object.values(captureDeps));
  const formDeps = { React: form.React, createQuickCaptureSession, shouldSubmitQuickTask, submitQuickCapture,
    createClientId,
    Button: 'Button', Card: 'Card', Drawer: 'Drawer', Kbd: 'Kbd', TruthBadge: 'TruthBadge', Iconed: 'Iconed' };
  const Form = new Function(...Object.keys(formDeps), `${formCode}; return QuickCaptureForm;`)(...Object.values(formDeps));
  const render = () => {
    tree = wrapper.render(() => Capture({ taskToday: { state: 'live', focus: { date, picked } }, actions, onChanged: () => { reads++; } }));
    formTree = form.render(() => Form(find(tree, node => node.type === 'QuickCaptureForm')[0].props));
  };
  render();
  return { chosen, render, tree: () => tree, form: () => formTree, reads: () => reads,
    edit(raw) { find(formTree, node => node.type === 'input')[0].props.onChange({ target: { value: raw } }); render(); },
    async submit() { await find(formTree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} }); await settle(); render(); },
    input: () => find(formTree, node => node.type === 'input')[0],
  };
}

test('lost capture response retries its receipt; duplicate success followed by failed focus retries only the saved task', async t => {
  const requests = [], taskId = '11111111-1111-4111-8111-111111111111';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (requests.length === 1) throw Object.assign(new Error('synthetic timeout'), { name: 'TimeoutError' });
    return { ok: true, json: async () => ({ status: 'duplicate', destinationType: 'task', destinationId: taskId }) };
  });
  const app = mount(); app.edit('재시도할 원문'); await app.submit();
  assert.equal(app.input().props.value, '재시도할 원문'); assert.equal(app.chosen.length, 0);
  await app.submit(); assert.deepEqual(requests[0].body, requests[1].body);
  assert.equal(app.input().props.value, ''); assert.equal(app.chosen.length, 1);
  assert.equal(app.chosen[0].task.id, taskId); assert.match(text(app.tree()), /할 일은 저장했습니다/);
  const retry = find(app.tree(), node => node.type === 'Button' && text(node) === '이 할 일을 오늘 3개로')[0];
  await retry.props.onClick(); app.render();
  assert.equal(requests.length, 2, 'focus retry never sends another capture');
  assert.equal(app.chosen.length, 2); assert.equal(app.chosen[1].task.id, taskId);
  assert.match(text(app.tree()), /오늘 3개에 넣었습니다/);
});

test('full choices still allow a simple capture into the list without an invalid fourth selection', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ status: 'saved', destinationType: 'task', destinationId: '11111111-1111-4111-8111-111111111111' }) }));
  const app = mount({ picked: 3 }); app.edit('목록에 보관할 일'); await app.submit();
  assert.equal(app.input().props.value, ''); assert.equal(app.chosen.length, 0); assert.equal(app.reads(), 1);
  const formProps = find(app.tree(), node => node.type === 'QuickCaptureForm')[0].props;
  assert.equal(formProps.submitLabel, '할 일 추가');
  const choice = formProps.controls.props.children[0];
  assert.equal(choice.props.checked, false); assert.equal(choice.props.disabled, true);
});

test('the capture intent stays locked while its receipt is pending, including same-render checkbox callbacks', async t => {
  let finish;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const app = mount(); app.edit('입력 중 선택 유지');
  const first = find(app.tree(), node => node.type === 'QuickCaptureForm')[0].props.controls.props.children[0];
  const pending = app.submit();
  first.props.onChange(); app.render();
  const during = find(app.tree(), node => node.type === 'QuickCaptureForm')[0].props.controls.props.children[0];
  assert.equal(during.props.checked, true); assert.equal(during.props.disabled, true);
  finish({ ok: true, json: async () => ({ status: 'saved', destinationType: 'task', destinationId: '11111111-1111-4111-8111-111111111111' }) });
  await pending; assert.equal(app.chosen.length, 1);
});
