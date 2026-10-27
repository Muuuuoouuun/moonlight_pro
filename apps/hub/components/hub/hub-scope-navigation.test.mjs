import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as navigation from './hub-nav.js';
import { goalHref, goalView } from '../../lib/goal-client.js';

const source = readFileSync(new URL('./hub-sidebar.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hub-sidebar.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let callback;
function find(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'changeScope') callback = node.initializer.arguments[0];
  ts.forEachChild(node, find);
}
find(ast);
assert.ok(callback, 'actual Sidebar changeScope callback');

function changeScope({ active, view, search = '' }, next) {
  const visited = [], selected = [];
  const dependencies = { ...navigation, active, view, search, goalHref, goalView,
    setScope: value => { selected.push(value); return navigation.normalizeScope(value); },
    onNavigate: value => visited.push(value),
  };
  new Function(...Object.keys(dependencies), `return (${callback.getText(ast)});`)(...Object.values(dependencies))(next);
  return { visited, selected };
}

for (const scope of ['classin', 'personal', 'all']) test(`overview summary remains selected when switching to ${scope}`, () => {
  const result = changeScope({ active: 'dashboard/overview', view: 'summary', search: 'view=summary' }, scope);
  assert.deepEqual(result.selected, [scope]);
  assert.deepEqual(result.visited, ['dashboard/overview?view=summary']);
  assert.equal(navigation.topNavigationForRoute(result.visited[0], scope, 'summary').activeTab?.key, 'overview-summary');
});

test('overview goal lens and OKR subviews retain their existing scope navigation', () => {
  assert.deepEqual(changeScope({ active: 'dashboard/overview' }, 'personal').visited, ['dashboard/overview']);
  for (const suffix of ['weekly=1', 'check=1', 'kpi=1']) {
    assert.deepEqual(changeScope({ active: 'dashboard/overview', view: 'goals', search: `view=goals&${suffix}` }, 'classin').visited,
      [`dashboard/overview?view=goals&scope=classin&${suffix}`]);
  }
});

test('Office and revenue preserve their distinct existing scope destinations', () => {
  assert.deepEqual(changeScope({ active: 'dashboard/agents/office-council' }, 'personal').visited, ['dashboard/agents/office-council?scope=personal']);
  assert.deepEqual(changeScope({ active: 'dashboard/revenue/deals' }, 'classin').visited, ['dashboard/classin/pipeline']);
  assert.deepEqual(changeScope({ active: 'dashboard/revenue/customers' }, 'personal').visited, ['dashboard/revenue/customers?scope=personal']);
});
