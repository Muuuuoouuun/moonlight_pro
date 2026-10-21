import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { NOTE_QUESTIONS, selectedNoteExcerpt } from '../../../lib/journal-client.js';
import * as tags from '../../../lib/journal-tags.js';

// Run the actual composer handlers with persistent hook cells. The journal model
// remains the owner of persistence; these scenarios drive its public states.
function harness(overrides = {}) {
  const cells = [], calls = { save: 0, retry: 0, use: [], close: 0 };
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'fragment',
    useState(value) { const i = cursor++; if (!(i in cells)) cells[i] = typeof value === 'function' ? value() : value; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
    useRef(value) { const i = cursor++; return cells[i] ||= { current: value }; },
    useEffect() {}, useMemo: fn => fn(),
  };
  const source = readFileSync(new URL('./memo-composer.jsx', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const scope = { React, Link: 'Link', Button: 'Button', Drawer: 'Drawer', Kbd: 'Kbd', SelectField: 'SelectField', Skeleton: 'Skeleton',
    TextAreaField: 'TextAreaField', TextField: 'TextField', TruthBadge: 'TruthBadge', MemoContextPicker: 'MemoContextPicker',
    GoalLinks: 'GoalLinks', MeetingReviewController: 'MeetingReviewController', NOTE_QUESTIONS, selectedNoteExcerpt, ...tags };
  const compiled = ts.transpile(source, { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
  const Composer = new Function(...Object.keys(scope), `${compiled}\nreturn MemoComposer;`)(...Object.values(scope));
  const model = {
    draft: { id: 'draft-1', body: '원문을 그대로 남깁니다. 다음에 확인할 내용입니다.', title: '', occurredAt: '2026-10-20T00:00:00Z', contexts: [], noteMeta: { kind: 'note', enhancement: '' } },
    entry: null, ready: true, dirty: true, locked: false, busy: false, pending: null, conflict: null, source: 'live', workspaceConfirmed: true,
    edit(patch) { this.draft = { ...this.draft, ...patch }; this.dirty = true; },
    save() { calls.save++; }, retry() { calls.retry++; }, prepareUse(...args) { calls.use.push(args); }, ...overrides,
  };
  const render = () => { cursor = 0; return Composer({ model, isNew: true, onClose() { calls.close++; }, onReload() {} }); };
  return { model, calls, render };
}
function nodes(node, visible = true, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (visible && node.props?.hidden) return result;
  result.push(node);
  for (const child of [node.props?.footer, ...[node.props?.children || []].flat(Infinity)]) nodes(child, visible, result);
  return result;
}
const text = node => !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
const button = (tree, label) => nodes(tree).find(node => node.type === 'Button' && text(node) === label);
const step = tree => nodes(tree).find(node => node.props?.['aria-current'] === 'step');
const body = tree => nodes(tree).find(node => node.type === 'TextAreaField' && node.props.maxLength === 20000);
const saved = h => Object.assign(h.model, { entry: { id: 'saved-1', revision: 1, links: [] }, dirty: false, pending: null, locked: false, busy: false, saveState: 'saved' });

test('titleless capture advances only after the journal model confirms save, without creating a next action', () => {
  const h = harness();
  let tree = h.render();
  assert.equal(text(step(tree)), '1원문 저장');
  assert.equal(button(tree, '2검토').props.disabled, true);
  assert.equal(button(tree, '3다음 행동').props.disabled, true);
  assert.equal(body(tree).props.readOnly, false);
  button(tree, '메모 저장 ⌘↵').props.onClick();
  assert.equal(h.calls.save, 1);
  assert.equal(text(step(h.render())), '1원문 저장', 'clicking save is not evidence of persistence');
  saved(h);
  tree = h.render();
  assert.equal(text(step(tree)), '2검토');
  assert.equal(body(tree).props.readOnly, true);
  assert.equal(body(tree).props.value, h.model.draft.body);
  assert.equal(nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'MemoActionExtractor').props.active, false);
  button(tree, '다음 행동 선택').props.onClick();
  tree = h.render();
  assert.equal(text(step(tree)), '3다음 행동');
  assert.deepEqual(h.calls.use, [], 'step navigation never executes a write');
  button(tree, '메모 전체를 할 일로').props.onClick();
  assert.deepEqual(h.calls.use, [['create_task', selectedNoteExcerpt(h.model.draft.body, 0, h.model.draft.body.length)]]);
});

test('unknown save stays in capture, preserves the original and exposes the same request retry', () => {
  const h = harness();
  const original = h.model.draft;
  button(h.render(), '메모 저장 ⌘↵').props.onClick();
  Object.assign(h.model, { pending: { id: 'frozen-command' }, locked: true, message: '저장 결과를 확인해 주세요.', saveState: 'unknown' });
  let tree = h.render();
  assert.equal(text(step(tree)), '1원문 저장');
  assert.equal(body(tree).props.value, original.body);
  assert.equal(button(tree, '3다음 행동').props.disabled, true);
  assert.equal(button(tree, '이전 요청 결과 확인').props.onClick, h.model.retry);
  button(tree, '이전 요청 결과 확인').props.onClick();
  assert.equal(h.calls.retry, 1);
  assert.equal(h.model.draft, original);
  assert.equal(h.model.pending.id, 'frozen-command');
  saved(h); // A confirmed duplicate receipt has the same public saved model state.
  tree = h.render();
  assert.equal(text(step(tree)), '2검토');
  assert.deepEqual(h.calls.use, []);
});

test('review preserves an exact long-memo selection across steps and offers a route back to choose it', () => {
  const h = harness(); saved(h);
  h.model.draft.body = `앞${'긴 원문 '.repeat(800)}선택할 문장끝`;
  let tree = h.render();
  button(tree, '다음 행동 선택').props.onClick();
  tree = h.render();
  assert.equal(button(tree, '메모 전체를 할 일로').props.disabled, true);
  button(tree, '원문에서 발췌 선택').props.onClick();
  tree = h.render();
  const start = h.model.draft.body.indexOf('선택할');
  body(tree).props.onSelect({ currentTarget: { value: h.model.draft.body, selectionStart: start, selectionEnd: start + 6 } });
  button(h.render(), '다음 행동 선택').props.onClick();
  tree = h.render();
  assert.equal(button(tree, '발췌를 콘텐츠로').props.disabled, false);
  button(tree, '발췌를 콘텐츠로').props.onClick();
  const excerpt = h.calls.use[0][1];
  assert.equal(excerpt.prefix + excerpt.text + excerpt.suffix, h.model.draft.body);
  assert.equal(excerpt.text, '선택할 문장');
});

test('editing, conflict and source uncertainty cannot bypass capture save/recovery', () => {
  const h = harness(); saved(h);
  button(h.render(), '원문·연결 수정').props.onClick();
  let tree = h.render();
  assert.equal(body(tree).props.readOnly, false);
  assert.equal(button(tree, '저장된 원문 검토').props.disabled, undefined);
  Object.assign(h.model, { dirty: true, conflict: { body: '다른 저장본' }, message: '변경 비교가 필요합니다.' });
  tree = h.render();
  assert.equal(text(step(tree)), '1원문 저장');
  assert.equal(button(tree, '3다음 행동').props.disabled, true);
  assert.equal(button(tree, '수정 저장 ⌘↵').props.disabled, true);
  assert.ok(nodes(tree).some(node => node.props?.['aria-label'] === '메모 변경 비교'));
  h.model.source = 'error'; h.model.conflict = null;
  assert.equal(button(h.render(), '수정 저장 ⌘↵').props.disabled, true);
  assert.deepEqual(h.calls.use, []);
});

test('explicit keep-as-memo closes without a downstream write; pending extractor commands stay mounted outside hidden panels', () => {
  const h = harness(); saved(h);
  let tree = h.render();
  const extractor = nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'MemoActionExtractor');
  assert.ok(extractor, 'step changes preserve visible extractor recovery and request ownership');
  assert.equal(extractor.props.active, false);
  button(tree, '메모로 남겨두기').props.onClick();
  assert.equal(h.calls.close, 1);
  assert.deepEqual(h.calls.use, []);
  assert.equal(h.calls.save, 0);
});
