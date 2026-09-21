import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { NOTE_QUESTIONS, CONTEXT_TYPES, selectedNoteExcerpt } from '../../../lib/journal-client.js';
import * as tags from '../../../lib/journal-tags.js';

// Evaluate the actual component handlers without a browser; primitives remain
// element boundaries so accessibility props and disclosure placement are visible.
function load(name, component, extra = {}) {
  const source = readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'fragment',
    useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: () => {}, useMemo: fn => fn() };
  const scope = { React, Link: 'Link', Button: 'Button', Drawer: 'Drawer', Kbd: 'Kbd', SelectField: 'SelectField', Skeleton: 'Skeleton',
    TextAreaField: 'TextAreaField', TextField: 'TextField', TruthBadge: 'TruthBadge', MemoContextPicker: 'MemoContextPicker',
    NOTE_QUESTIONS, CONTEXT_TYPES, selectedNoteExcerpt, ...tags, ...extra };
  const compiled = ts.transpile(source, { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(scope), `${compiled}\nreturn ${component};`)(...Object.values(scope));
}
function find(node, predicate, ancestors = []) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return { node, ancestors };
  for (const child of [node.props?.footer, ...[node.props?.children || []].flat(Infinity)]) {
    const result = find(child, predicate, [...ancestors, node]);
    if (result) return result;
  }
  return null;
}
const MemoComposer = load('./memo-composer.jsx', 'MemoComposer');
function compose(noteMeta = { kind: 'note', enhancement: '' }, extra = {}) {
  const edits = [];
  const model = { draft: { body: '기록', title: '', occurredAt: '2026-09-20T01:00:00Z', noteMeta, contexts: [] }, ready: true,
    locked: false, busy: false, dirty: true, source: 'live', edit: patch => edits.push(patch), save: () => {}, ...extra };
  return { tree: MemoComposer({ model, isNew: true, onClose() {}, onReload() {} }), edits };
}
test('tags and business links are immediately reachable before save outside title/time disclosure', () => {
  const { tree, edits } = compose();
  const field = find(tree, node => node.type === 'TextField' && node.props.label.startsWith('태그'));
  assert.ok(field, 'tag input is present before the first save');
  assert.equal(field.ancestors.some(node => node.type === 'details'), false);
  assert.equal(find(tree, node => node.type === 'MemoContextPicker').ancestors.some(node => node.type === 'details'), false);
  field.node.props.onChange({ target: { value: ' 후속 , 계획,' } });
  assert.deepEqual(edits[0].noteMeta, { kind: 'note', enhancement: '', tags: [' 후속 ', ' 계획', ''] });
});
test('tag validation blocks save without discarding input and respects unresolved requests', () => {
  const { tree } = compose({ kind: 'note', enhancement: '', tags: ['x'.repeat(33)] });
  const result = find(tree, node => node.type === 'TextField' && node.props.label.startsWith('태그'));
  assert.ok(result, 'tag validation input must exist');
  const field = result.node;
  assert.equal(field.props.value, 'x'.repeat(33));
  assert.ok(field.props.error);
  assert.equal(tree.props.footer.props.children[0].props.disabled, true);
  const locked = compose({ kind: 'note', enhancement: '', tags: ['후속'] }, { locked: true }).tree;
  assert.equal(find(locked, node => node.type === 'TextField' && node.props.label.startsWith('태그')).node.props.disabled, true);
});
test('context search Enter respects IME and leaves the save shortcut to the composer', async () => {
  let searches = 0;
  const Picker = load('./memo-context-picker.jsx', 'MemoContextPicker', { fetchJournal: async () => { searches++; return { status: 'live', contexts: [] }; } });
  const tree = Picker({ selected: [], onChange() {} });
  const input = find(tree, node => node.type === 'TextField').node;
  const event = extra => ({ key: 'Enter', nativeEvent: {}, preventDefault() {}, stopPropagation() {}, ...extra });
  input.props.onKeyDown(event({ nativeEvent: { isComposing: true } }));
  input.props.onKeyDown(event({ keyCode: 229 }));
  input.props.onKeyDown(event({ metaKey: true }));
  input.props.onKeyDown(event({ ctrlKey: true }));
  assert.equal(searches, 0);
  input.props.onKeyDown(event({}));
  assert.equal(searches, 1);
});
