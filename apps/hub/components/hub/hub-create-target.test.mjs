import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { normalizeScope } from './hub-nav.js';
import { GOAL_WORK_BASE, goalHref, goalView } from '../../lib/goal-client.js';

const source = readFileSync(new URL('./hub-app.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hub-app.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let callback;
function find(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'createTargetForPath') callback = node.initializer.arguments[0];
  ts.forEachChild(node, find);
}
find(ast);
assert.ok(callback, 'the actual HubApp createTargetForPath callback must exist');

function target(path, query = '') {
  const searchParams = new URLSearchParams(query);
  const createTarget = new Function('queryScope', 'searchParams', 'normalizeScope', 'GOAL_WORK_BASE', 'goalHref', 'goalView',
    `return (${callback.getText(ast)});`)(searchParams.get('scope'), searchParams, normalizeScope, GOAL_WORK_BASE, goalHref, goalView);
  return createTarget(path);
}

for (const [path, kind] of [
  ['dashboard/revenue/customers', 'customer'],
  ['dashboard/revenue/deals', 'deal'],
  ['dashboard/revenue/inquiries', 'inquiry'],
  ['dashboard/revenue/leads', 'lead'],
  ['dashboard/revenue/accounts', 'account'],
  ['dashboard/revenue/cases', 'case'],
]) {
  for (const scope of ['personal', 'classin', 'all']) test(`${path} New preserves explicit ${scope} scope`, () => {
    assert.equal(target(path, `scope=${scope}&view=board`), `${path}?new=${kind}&scope=${scope}`);
  });
  test(`${path} New keeps the existing unscoped destination when scope is absent`, () => {
    assert.equal(target(path), `${path}?new=${kind}`);
  });
}

test('ClassIn trade tab creates on the same workspace route instead of falling back to the palette', () => {
  assert.equal(target('dashboard/classin/pipeline'), 'dashboard/classin/pipeline?new=deal');
  assert.equal(target('dashboard/classin/pipeline', 'scope=classin'), 'dashboard/classin/pipeline?new=deal&scope=classin');
});

test('report, discovery, and goal creation retain their existing context contracts', () => {
  assert.equal(target('dashboard/reports', 'scope=personal&view=archive&report=abc'), 'dashboard/reports?scope=personal&view=archive&report=abc&new=report');
  assert.equal(target('dashboard/discovery', 'scope=classin'), 'dashboard/discovery?new=discovery&scope=classin');
  assert.equal(target('dashboard/discovery'), 'dashboard/discovery?new=discovery');
  for (const [path, query, expected] of [
    ['dashboard/overview', 'view=goals&scope=classin&weekly=1', 'dashboard/overview?view=goals&scope=classin&weekly=1&new=goal'],
    ['dashboard/work/goals', 'scope=personal&check=1', 'dashboard/work/goals?scope=personal&check=1&new=goal'],
    ['dashboard/work/goals', 'scope=classin&kpi=1', 'dashboard/work/goals?scope=classin&kpi=1&new=goal'],
  ]) assert.equal(target(path, query), expected);
  assert.equal(target('dashboard/settings'), null);
});
