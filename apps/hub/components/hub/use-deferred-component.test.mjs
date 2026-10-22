import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

const hookSource = readFileSync(new URL('./use-deferred-component.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function createHarness(load) {
  const slots = [], pending = [];
  let cursor = 0, stateWrites = 0;
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { stateWrites++; slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const useDeferred = new Function('React', `${hookSource.replace(/^import .*$/m, '').replace('export function', 'function')}\nreturn useDeferredComponent;`)(hooks);
  return {
    render() { cursor = 0; const state = useDeferred(load); pending.splice(0).forEach(fn => fn()); return state; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    get writes() { return stateWrites; },
  };
}

test('deferred load reports failure, retries, and exposes the successfully loaded component', async () => {
  const Component = () => null;
  let calls = 0;
  const app = createHarness(() => ++calls === 1 ? Promise.reject(new Error('chunk unavailable')) : Promise.resolve(Component));
  assert.deepEqual(app.render().Component, null);
  await tick();
  const failed = app.render();
  assert.equal(failed.error, true);
  failed.retry();
  assert.equal(app.render().error, false);
  await tick();
  assert.equal(app.render().Component, Component);
  assert.equal(calls, 2);
  app.unmount();
});

test('closing during a pending import does not update the unmounted view', async () => {
  let resolve;
  const app = createHarness(() => new Promise(done => { resolve = done; }));
  app.render();
  app.unmount();
  const writes = app.writes;
  resolve(() => null);
  await tick();
  assert.equal(app.writes, writes);
});

function wrapper(name, state) {
  const source = readFileSync(new URL(name, import.meta.url), 'utf8');
  const js = ts.transpileModule(source.replace(/^import .*$/gm, '').replace('export function', 'function'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exportName = name.includes('contact') ? 'ContactRecordDrawer' : 'GuidanceSourceReader';
  return new Function('React', 'useDeferredComponent', 'Button', 'Drawer', 'EmptyState', 'Skeleton', `${js}\nreturn ${exportName};`)(React, () => state, 'Button', 'Drawer', 'EmptyState', 'Skeleton');
}

test('pending and failed record drawer stays dismissible and retry does not replace its draft', () => {
  const onClose = () => {}, retry = () => {}, draft = { summary: 'unsaved input' };
  const props = { target: null, draft, onClose };
  const pending = wrapper('./deferred-contact-record-drawer.jsx', { Component: null, error: false, retry })(props);
  assert.equal(pending.type, 'Drawer');
  assert.equal(pending.props.presentation, 'compact');
  assert.equal(pending.props.onClose, onClose);
  assert.equal(pending.props.children.type, 'Skeleton');
  const failed = wrapper('./deferred-contact-record-drawer.jsx', { Component: null, error: true, retry })(props);
  assert.equal(failed.props.onClose, onClose);
  assert.equal(failed.props.children.props.action.props.onClick, retry);
  const Component = () => null;
  const ready = wrapper('./deferred-contact-record-drawer.jsx', { Component })(props);
  assert.equal(ready.type, Component);
  assert.equal(ready.props.draft, draft);
  assert.equal(ready.props.onClose, onClose);
});

test('deferred source reader preserves its disclosure target, retry, and focus options', () => {
  const retry = () => {}, onClose = () => {};
  const props = { id: 'reader', className: 'source-reader', cardId: 'sales-gap', autoFocus: true, onClose };
  const pending = wrapper('./deferred-guidance-source-reader.jsx', { Component: null, error: false, retry })(props);
  assert.equal(pending.props.id, props.id);
  assert.equal(pending.props['aria-busy'], true);
  const failed = wrapper('./deferred-guidance-source-reader.jsx', { Component: null, error: true, retry })(props);
  assert.equal(failed.props.children.props.action.props.onClick, retry);
  const Component = () => null;
  const ready = wrapper('./deferred-guidance-source-reader.jsx', { Component })(props);
  assert.deepEqual(ready.props, props);
});
