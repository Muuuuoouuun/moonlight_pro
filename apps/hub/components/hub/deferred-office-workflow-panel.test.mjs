import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

function render(state, props = {}, frame = null) {
  const source = readFileSync(new URL('./deferred-office-workflow-panel.jsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(source.replace(/^import .*$/gm, '').replace('export function', 'function'), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const hooks = { ...React, useRef: () => ({ current: frame }) };
  const Component = new Function('React', 'useDeferredComponent', 'Button', 'EmptyState', 'Skeleton', `${js}\nreturn OfficeWorkflowPanel;`)(
    hooks, () => state, 'Button', 'EmptyState', 'Skeleton',
  );
  return Component(props);
}

test('Office code loading is inline and leaves the enclosing customer drawer in control', () => {
  const pending = render({ Component: null, error: false });
  assert.equal(pending.type, 'div');
  assert.equal(pending.props['aria-busy'], true);
  assert.equal(pending.props.children.type, 'Skeleton');
  assert.equal(pending.props.children.props.lines, 2);
});

test('retry retains keyboard focus on a stable boundary while replacing the failed control', () => {
  let focused = 0, retried = 0;
  const failed = render({ Component: null, error: true, retry: () => { retried++; } }, {}, { focus: () => { focused++; } });
  assert.equal(failed.props.tabIndex, -1);
  assert.equal(failed.props['aria-busy'], false);
  assert.equal(failed.props.children.type, 'EmptyState');
  failed.props.children.props.action.props.onClick();
  assert.equal(focused, 1);
  assert.equal(retried, 1);
});

test('ready Office gets exactly the current customer props with no automatic read or generation', () => {
  const Office = () => null, onNavigate = () => {};
  const props = { intent: 'customer_reply', scope: 'classin', originRef: { entityType: 'lead', entityId: 'current' }, title: '답장 초안', onNavigate };
  const ready = render({ Component: Office, error: false }, props);
  assert.equal(ready.props['aria-busy'], false);
  assert.equal(ready.props.children.type, Office);
  assert.deepEqual(ready.props.children.props, props);
});

test('Customers loads Office only inside the existing Customer360 render, independent of details expansion', () => {
  const customers = readFileSync(new URL('./pages/customers.jsx', import.meta.url), 'utf8');
  assert.match(customers, /import \{ OfficeWorkflowPanel \} from '\.\.\/deferred-office-workflow-panel'/);
  assert.doesNotMatch(customers, /from ['"]\.\.\/office-workflow-panel['"]/);
  const start = customers.indexOf('function Customer360Drawer(');
  const end = customers.indexOf('function NewCustomerDrawer(', start);
  const drawer = customers.slice(start, end);
  assert.equal((drawer.match(/<OfficeWorkflowPanel/g) || []).length, 1);
  assert.doesNotMatch(drawer, /onToggle=|helpOpen|officeOpen/);
  const source = readFileSync(new URL('./deferred-office-workflow-panel.jsx', import.meta.url), 'utf8');
  assert.match(source, /import\('\.\/office-workflow-panel'\)/);
  assert.doesNotMatch(source, /fetch\(|sendOffice|readOffice|loadOfficeWorkflowOrigin|requestPersona/);
});
