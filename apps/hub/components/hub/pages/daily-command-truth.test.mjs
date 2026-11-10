import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('./daily-brief.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('daily-brief.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function compile(name) {
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, `production ${name} exists`);
  return ts.transpileModule(fn.getText(ast).replace('export function', 'function'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const CommandClear = new Function('React', 'Iconed', `${compile('CommandClear')}; return CommandClear;`)(React, ({ name }) => React.createElement('i', { 'data-icon': name }));
const render = state => renderToStaticMarkup(React.createElement(CommandClear, { state, signalCount: 0 }));

test('empty signals never announce all-clear before a complete full-brief read', () => {
  for (const syncState of ['syncing', 'loading', 'error', 'partial', 'mixed', 'preview', undefined]) {
    const html = render({ syncState });
    assert.doesNotMatch(html, /지금 급한 것은 없습니다|확인할 신호가 없습니다|data-icon="check"/);
    assert.match(html, /role="status"/);
    assert.match(html, /실제로 확인할 일이 있을 수|읽기가 끝나기 전/);
  }
  assert.match(render({ syncState: 'syncing' }), /읽고 있습니다/);
  assert.match(render({ syncState: 'error' }), /읽지 못했습니다/);
  assert.match(render({ syncState: 'partial' }), /모두 읽지 못했습니다/);
  assert.match(render({ syncState: 'mixed' }), /모두 읽지 못했습니다/);
});

test('verified empty is scoped to signals, not a claim that every task or urgent customer is cleared', () => {
  const html = render({ syncState: 'live', dailyFocus: { urgentKa: { item: { id: 'synthetic-urgent' } } } });
  assert.match(html, /확인할 신호가 없습니다/);
  assert.match(html, /data-icon="check"/);
  assert.doesNotMatch(html, /지금 급한 것은 없습니다/);
});

test('a cached empty signal snapshot describes the previous read instead of current all-clear', () => {
  for (const syncState of ['live', 'partial']) {
    const html = render({ syncState, briefStale: true });
    assert.match(html, /이전 조회에서 표시할 신호가 없었습니다/);
    assert.match(html, /최신 신호는 다시 확인/);
    assert.doesNotMatch(html, /확인할 신호가 없습니다|data-icon="check"/);
  }
});

test('auth and full-read truth win over stale or narrow task read state', () => {
  assert.match(render({ syncState: 'live', authRequired: true }), /로그인 후/);
  assert.doesNotMatch(render({ syncState: 'live', authRequired: true }), /data-icon="check"/);
  assert.match(render({ syncState: 'partial', briefSyncState: 'live' }), /확인할 신호가 없습니다/);
  assert.match(render({ syncState: 'live', briefSyncState: 'partial' }), /모두 읽지 못했습니다/);
  assert.match(render({ syncState: 'live', briefSyncState: 'error' }), /읽지 못했습니다/);
});

test('production page supplies full ledger truth to the empty-signal panel', () => {
  // Execute the actual page function with inert child/read boundaries; no effects, network or writes.
  const runtime = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: value => [value, () => {}], useCallback: value => value, useMemo: fn => fn(), useEffect() {} };
  const code = compile('DailyBrief');
  const ledger = { syncState: 'partial', briefSyncState: 'partial', sources: [{ key: 'calendar', state: 'error' }], signals: [], metrics: [], summary: {}, taskToday: { state: 'partial' }, refreshTasks() {} };
  const projectedTasks = { state: 'live', items: [], focus: { picked: 0, done: 0 } };
  const deps = { React: runtime, useDailyBriefLedger: () => ledger, useTodayTaskActions: taskToday => {
    assert.equal(taskToday, ledger.taskToday); return { taskToday: projectedTasks, pendingIds: [] };
  }, useGuruRecommendations: () => ({}), useToast: () => ({}), rankSignals: signals => signals };
  for (const match of code.matchAll(/React\.createElement\(([A-Z]\w*)/g)) deps[match[1]] ??= match[1];
  const Page = new Function(...Object.keys(deps), `${code}; return DailyBrief;`)(...Object.values(deps));
  const find = node => Array.isArray(node) ? node.flatMap(find) : node && typeof node === 'object' ? [...(node.type === 'CommandClear' ? [node] : []), ...find(node.props?.children)] : [];
  const panels = find(Page({ onNavigate() {} }));
  assert.equal(panels.length, 1);
  const supplied = panels[0].props.state;
  assert.equal(supplied.taskToday, projectedTasks, 'the page uses the acknowledged task projection');
  assert.equal(supplied.signals, ledger.signals); assert.equal(supplied.sources, ledger.sources);
  assert.equal(supplied.briefSyncState, 'partial'); assert.equal(supplied.syncState, 'partial', 'task truth cannot promote the full brief');
  assert.match(render(supplied), /모두 읽지 못했습니다/);
});
