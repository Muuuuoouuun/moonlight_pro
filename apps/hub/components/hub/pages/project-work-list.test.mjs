import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as checklist from '../../../lib/task-checklist.js';
import * as indexOrder from '../../../lib/project-index-order.js';
import { appendProjectChecklistItem } from '../../../lib/project-direct-work.js';

const source = readFileSync(new URL('./project-work-list.jsx', import.meta.url), 'utf8');
const orderSource = readFileSync(new URL('./project-work-order.jsx', import.meta.url), 'utf8');
const compiled = ts.transpile((orderSource + '\n' + source).replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
const children = node => [node?.props?.children || []].flat(Infinity);
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : children(node).map(text).join('');
function walk(node, predicate, ancestors = []) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return { node, ancestors };
  for (const child of children(node)) {
    const found = walk(child, predicate, [...ancestors, node]);
    if (found) return found;
  }
  return null;
}
function makeDraftStore() {
  const store = { drafts: {}, draftsRef: { current: {} }, setDrafts(next) { store.drafts = next; } };
  return store;
}
function mount(options = {}) {
  const slots = [];
  const frames = [];
  const handle = { current: null };
  let cursor = 0;
  let tree;
  const effects = [];
  const listeners = new Map();
  const storage = options.storage || new Map();
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const window = { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  let props = { projectId: 'project-a', tasks: [], canWrite: true, pendingIds: new Set(),
    onCreate: async () => { throw new Error('unexpected create'); },
    onAddChecklist: async () => { throw new Error('unexpected checklist write'); },
    onToggleTask: async () => ({ ok: true }), onToggleChecklist: async () => ({ ok: true }), onEdit() {},
    draftStore: makeDraftStore(), ...options };
  const React = { createElement, Fragment: 'fragment', forwardRef: component => component,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useImperativeHandle(ref, create) { ref.current = create(); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index].deps[i]))) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
    useLayoutEffect(fn, deps) { this.useEffect(fn, deps); } };

  const scope = { React, Button: 'Button', Checkbox: 'Checkbox', IconButton: 'IconButton', Input: 'Input', LifecycleBadge: 'LifecycleBadge', Iconed: 'Iconed',
    localStorage, window, cancelAnimationFrame() {}, ...indexOrder, styles: new Proxy({}, { get: (_, key) => key }), requestAnimationFrame: callback => frames.push(callback), ...checklist };
  const Component = new Function(...Object.keys(scope), `${compiled}\nreturn ProjectWorkList;`)(...Object.values(scope));
  const render = (next = {}) => { props = { ...props, ...next }; cursor = 0; tree = Component(props, handle); effects.splice(0).forEach(fn => fn()); return tree; };
  const find = predicate => walk(tree, predicate)?.node;
  const input = label => find(node => node.type === 'Input' && node.props.ariaLabel === label);
  const submit = label => {
    const field = walk(tree, node => node.type === 'Input' && node.props.ariaLabel === label);
    field.ancestors.findLast(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  };
  render();
  return { render, find, input, submit, handle, storage, listeners, get tree() { return tree; }, get store() { return props.draftStore; }, flushFrames() { frames.splice(0).forEach(callback => callback()); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const task = (patch = {}) => ({ id: '11111111-1111-4111-8111-111111111111', title: '확인할 일', status: 'todo', done: false,
  updatedAt: '2026-09-23T01:00:00.123456+00:00', checklist: [], ...patch });

test('rapid submissions write once and a lost response retries the same immutable capture', async () => {
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  const requests = [];
  const view = mount({ onCreate: async request => { requests.push(request); return requests.length === 1 ? waiting : { ok: true }; } });
  view.input('할 일 제목').props.onChange('  자료 확인  ');
  view.render();
  view.submit('할 일 제목');
  view.submit('할 일 제목');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].title, '자료 확인');
  assert.equal(requests[0].projectId, 'project-a');
  view.render();
  assert.equal(view.input('할 일 제목').props.disabled, true);
  finish({ ok: false, status: 'error', message: '결과 확인 필요' });
  await settle();
  view.render();
  assert.equal(view.input('할 일 제목').props.value, '  자료 확인  ');
  assert.equal(view.input('할 일 제목').props.readOnly, true);
  assert.equal(view.find(node => node.type === 'Button' && text(node) === '입력 다시 작성'), undefined);
  view.submit('할 일 제목');
  await settle();
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  view.render();
  assert.equal(view.input('할 일 제목').props.value, '');
});

test('project switching and a list remount preserve the shared draft and unresolved request ID', async () => {
  const store = makeDraftStore();
  const requests = [];
  const onCreate = async request => { requests.push(request); return { ok: false, status: 'error' }; };
  const first = mount({ draftStore: store, onCreate });
  first.input('할 일 제목').props.onChange('A에 남길 일');
  first.render({ projectId: 'project-b' });
  assert.equal(first.input('할 일 제목').props.value, '');
  first.input('할 일 제목').props.onChange('B에 남길 일');
  first.render({ projectId: 'project-a' });
  assert.equal(first.input('할 일 제목').props.value, 'A에 남길 일');
  first.submit('할 일 제목');
  await settle();
  const second = mount({ draftStore: store, onCreate });
  assert.equal(second.input('할 일 제목').props.value, 'A에 남길 일');
  assert.equal(second.input('할 일 제목').props.readOnly, true);
  second.submit('할 일 제목');
  await settle();
  assert.equal(requests[0], requests[1]);
  assert.equal(requests[1].projectId, 'project-a');
  second.render({ projectId: 'project-b' });
  assert.equal(second.input('할 일 제목').props.value, 'B에 남길 일');
});

test('a remounted list cannot resubmit an in-flight capture from the shared store', async () => {
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  let calls = 0;
  const store = makeDraftStore();
  const onCreate = async () => { calls += 1; return waiting; };
  const first = mount({ draftStore: store, onCreate });
  first.input('할 일 제목').props.onChange('저장 중인 일');
  first.render();
  first.submit('할 일 제목');
  const second = mount({ draftStore: store, onCreate });
  second.submit('할 일 제목');
  assert.equal(calls, 1);
  assert.equal(second.input('할 일 제목').props.disabled, true);
  finish({ ok: true });
  await settle();
  second.render();
  assert.equal(second.input('할 일 제목').props.value, '');
  assert.equal(second.input('할 일 제목').props.disabled, false);
});

test('the fiftieth checklist item can confirm a lost acknowledgement without adding a fifty-first', async () => {
  let current = task({ checklist: Array.from({ length: 49 }, (_, index) => ({ id: crypto.randomUUID(), title: `단계 ${index + 1}`, done: false, note: '' })) });
  const requests = [];
  const view = mount({ tasks: [current], onAddChecklist: async (taskId, request) => {
    requests.push(request);
    assert.equal(taskId, current.id);
    if (requests.length === 1) {
      current = { ...current, checklist: [...current.checklist, { ...request, done: false, note: '' }] };
      return { ok: false, status: 'error' };
    }
    return appendProjectChecklistItem(current, request, { saveChanges: async () => { throw new Error('a read-back replay must not write'); } });
  } });
  const label = '확인할 일 세부 체크 추가';
  view.input(label).props.onChange('마지막 단계');
  view.render();
  view.submit(label);
  await settle();
  view.render({ tasks: [current] });
  assert.equal(current.checklist.length, 50);
  assert.equal(view.input(label).props.disabled, false, 'the pending intention can still be confirmed at the limit');
  view.submit(label);
  await settle();
  view.render();
  assert.equal(requests[0], requests[1]);
  assert.equal(current.checklist.length, 50);
  assert.equal(view.input(label).props.value, '');
  assert.equal(view.input(label).props.disabled, true, 'a new fifty-first capture stays disabled');
});

test('IME Enter suppresses implicit form submission while a normal Enter saves the capture', async () => {
  let calls = 0;
  const view = mount({ onCreate: async () => { calls += 1; return { ok: true }; } });
  view.input('할 일 제목').props.onChange('한글 입력');
  view.render();
  for (const details of [{ nativeEvent: { isComposing: true } }, { nativeEvent: {}, keyCode: 229 }]) {
    let prevented = false;
    view.input('할 일 제목').props.onKeyDown({ key: 'Enter', ...details, preventDefault() { prevented = true; } });
    if (!prevented) view.submit('할 일 제목');
    assert.equal(prevented, true);
  }
  assert.equal(calls, 0);
  let prevented = false;
  view.input('할 일 제목').props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault() { prevented = true; } });
  if (!prevented) view.submit('할 일 제목');
  await settle();
  assert.equal(calls, 1);
});

test('stale checklist deep links focus the task title while existing links focus the exact check', () => {
  const current = task({ done: true, status: 'done' });
  const view = mount({ tasks: [current] });
  const focused = [];
  const check = { dataset: { checkId: 'existing-step' }, scrollIntoView() {}, querySelector(selector) {
    assert.equal(selector, '[role="checkbox"]'); return { focus() { focused.push('step'); } };
  } };
  const row = { dataset: { taskId: current.id }, scrollIntoView() {}, querySelectorAll: () => [check],
    querySelector(selector) { return { focus() { focused.push(selector === '[data-task-expand]' ? 'title' : 'task-checkbox'); } }; } };
  view.tree.props.ref.current = { querySelectorAll: () => [row] };
  view.handle.current.focusTask(current.id, 'deleted-step');
  view.render();
  view.flushFrames();
  assert.deepEqual(focused, ['title']);
  assert.ok(view.find(node => node.props?.['data-task-id'] === current.id), 'completed section is opened for the linked item');
  view.handle.current.focusTask(current.id, 'existing-step');
  view.flushFrames();
  assert.deepEqual(focused, ['title', 'step']);
});

test('known conflicts permit an explicit new capture while long next actions remain intact for shortening', async () => {
  const requests = [];
  const view = mount({ onCreate: async request => { requests.push(request); return { ok: false, status: 'conflict' }; } });
  const original = '다음 행동 '.repeat(80);
  view.handle.current.focusNewTask(original);
  view.render();
  assert.equal(view.input('할 일 제목').props.value, original);
  view.submit('할 일 제목');
  await settle();
  view.render();
  assert.equal(requests.length, 0);
  assert.equal(view.input('할 일 제목').props.readOnly, false);
  assert.match(text(view.tree), /300자 이내/);
  view.input('할 일 제목').props.onChange('제목을 정리함');
  view.render();
  view.submit('할 일 제목');
  await settle();
  view.render();
  view.find(node => node.type === 'Button' && text(node) === '입력 다시 작성').props.onClick();
  view.render();
  assert.equal(view.input('할 일 제목').props.readOnly, false);
  view.input('할 일 제목').props.onChange('확인 후 새로 작성');
  view.render();
  view.submit('할 일 제목');
  await settle();
  assert.notEqual(requests[0].id, requests[1].id);
  assert.equal(requests[1].title, '확인 후 새로 작성');
});

const taskRows = tree => children(tree).filter(node => node?.props?.['data-task-id']).map(node => node.props['data-task-id']);
const orderHandle = (view, title) => view.find(node => node.type === 'IconButton' && node.props.tooltip === `${title} 순서 변경·편집`);
const keyMove = (view, title, key) => orderHandle(view, title).props.onKeyDown({ key, altKey: true, preventDefault() {}, stopPropagation() {} });

test('task, milestone and work-group completion controls have distinct shapes and named types', () => {
  const rows = ['task', 'milestone', 'subproject'].map((itemType, index) => task({ id: String(index), title: itemType, itemType }));
  const view = mount({ tasks: rows });
  for (const [index, shape] of ['square', 'diamond', 'folder'].entries()) {
    const checkbox = view.find(node => node.type === 'Checkbox' && node.props.label.endsWith(`: ${rows[index].title}`));
    assert.equal(checkbox.props.shape, shape);
    assert.equal(checkbox.props.checked, false);
    assert.match(checkbox.props.label, /할 일|마일스톤|작업 묶음/);
  }
});

test('keyboard reorder persists per project across remounts and preserves completed slots', async () => {
  const rows = [task({ id: 'a', title: '첫째' }), task({ id: 'done', title: '처리됨', done: true }), task({ id: 'b', title: '둘째' })];
  const view = mount({ tasks: rows });
  keyMove(view, '둘째', 'ArrowUp');
  await settle();
  view.render();
  assert.deepEqual(taskRows(view.tree), ['b', 'a']);
  assert.match(text(view.tree), /순서 저장됨 · 이 브라우저/);
  assert.deepEqual(JSON.parse(view.storage.get('mlp.projectWork.project-a.v1')).order, ['b', 'done', 'a']);
  const again = mount({ tasks: rows, storage: view.storage });
  again.render();
  assert.deepEqual(taskRows(again.tree), ['b', 'a']);
  again.render({ projectId: 'project-b' });
  again.render();
  assert.deepEqual(taskRows(again.tree), ['a', 'b']);
  assert.equal(view.storage.has('mlp.projectWork.project-b.v1'), false);
});

test('a failed local preference write is explicit and read-only lists cannot reorder', async () => {
  const rows = [task({ id: 'a', title: '첫째' }), task({ id: 'b', title: '둘째' })];
  const view = mount({ tasks: rows, storage: { get() {}, set() { throw new Error('storage unavailable'); } } });
  keyMove(view, '둘째', 'ArrowUp');
  await settle();
  view.render();
  assert.deepEqual(taskRows(view.tree), ['b', 'a']);
  assert.match(text(view.tree), /브라우저에 저장하지 못했습니다/);
  const readOnly = mount({ tasks: rows, canWrite: false });
  keyMove(readOnly, '둘째', 'ArrowUp');
  await settle();
  readOnly.render();
  assert.deepEqual(taskRows(readOnly.tree), ['a', 'b']);
  assert.equal(readOnly.storage.size, 0);
});

function attachRows(view, ids) {
  const anchor = { setPointerCapture() {}, releasePointerCapture() {}, getBoundingClientRect: () => ({ left: 300, bottom: 40 }) };
  view.tree.props.ref.current = { getBoundingClientRect: () => ({ top: 0, bottom: ids.length * 40, left: 0, right: 400 }),
    querySelectorAll: () => ids.map((id, index) => ({ dataset: { orderGroup: 'open', orderId: id }, getBoundingClientRect: () => ({ top: index * 40, height: 40 }) })) };
  const event = y => ({ pointerId: 1, button: 0, isPrimary: true, clientX: 300, clientY: y, currentTarget: anchor, preventDefault() {} });
  return event;
}

test('drag drop moves once, suppresses the following click, and Escape cancels without saving', async () => {
  const rows = [task({ id: 'a', title: '첫째' }), task({ id: 'b', title: '둘째' }), task({ id: 'c', title: '셋째' })];
  const view = mount({ tasks: rows });
  const event = attachRows(view, ['a', 'b', 'c']);
  const handle = orderHandle(view, '첫째');
  handle.props.onPointerDown(event(20));
  handle.props.onPointerMove(event(115));
  handle.props.onPointerUp(event(115));
  handle.props.onClick({ ...event(115), detail: 1 });
  await settle();
  view.render();
  assert.deepEqual(taskRows(view.tree), ['b', 'c', 'a']);
  assert.equal(view.find(node => node.props.role === 'menu'), undefined);
  const saved = view.storage.get('mlp.projectWork.project-a.v1');
  attachRows(view, ['b', 'c', 'a']);
  const second = orderHandle(view, '둘째');
  second.props.onPointerDown(event(20));
  second.props.onPointerMove(event(115));
  view.listeners.get('keydown')({ key: 'Escape', preventDefault() {} });
  second.props.onPointerUp(event(115));
  await settle();
  assert.equal(view.storage.get('mlp.projectWork.project-a.v1'), saved);
});

test('a changed group or switched project cancels a drag instead of applying stale positions', async () => {
  const rows = [task({ id: 'a', title: '첫째' }), task({ id: 'b', title: '둘째' })];
  const view = mount({ tasks: rows });
  const event = attachRows(view, ['a', 'b']);
  const handle = orderHandle(view, '첫째');
  handle.props.onPointerDown(event(20));
  handle.props.onPointerMove(event(75));
  view.render({ tasks: [rows[0], { ...rows[1], done: true }] });
  handle.props.onPointerUp(event(75));
  await settle();
  assert.equal(view.storage.size, 0);
  view.render({ tasks: rows });
  handle.props.onPointerDown(event(20));
  handle.props.onPointerMove(event(75));
  view.render({ projectId: 'project-b' });
  handle.props.onPointerUp(event(75));
  await settle();
  assert.equal(view.storage.size, 0);
});

test('inline checklist reordering uses durable writer, blocks duplicates, and reports failure honestly', async () => {
  let finish;
  let calls = 0;
  const current = task({ checklist: [{ id: 'a', title: '첫 단계' }, { id: 'b', title: '둘째 단계' }] });
  const view = mount({ tasks: [current], onReorderChecklist: async (observed, source, target, placement) => {
    calls += 1;
    assert.equal(observed, current);
    assert.deepEqual([source, target, placement], ['b', 'a', 'before']);
    return new Promise(resolve => { finish = resolve; });
  } });
  const handle = view.find(node => node.type === 'IconButton' && node.props.tooltip === '둘째 단계 순서 변경');
  const event = { key: 'ArrowUp', altKey: true, preventDefault() {}, stopPropagation() {} };
  handle.props.onKeyDown(event);
  handle.props.onKeyDown(event);
  assert.equal(calls, 1);
  view.render();
  assert.match(text(view.tree), /순서 저장 중/);
  finish({ ok: false, status: 'conflict', message: '다른 곳에서 먼저 바뀌었습니다.' });
  await settle();
  view.render();
  assert.match(text(view.tree), /다른 곳에서 먼저 바뀌었습니다/);
  assert.doesNotMatch(text(view.tree), /순서 저장됨/);
  assert.equal(view.storage.size, 0);
});
