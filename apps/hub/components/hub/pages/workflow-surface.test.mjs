import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { goalCheckRows } from '../../../lib/goal-input-ux.js';
import { goalSectionState, measurementLabel } from '../../../lib/goal-client.js';
import { recordFirstRows } from './workflow-reading.js';

function compileDeclaration(file, name) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const node = ast.statements.find(item => (ts.isFunctionDeclaration(item) && item.name?.text === name)
    || (ts.isVariableStatement(item) && item.declarationList.declarations.some(declaration => declaration.name.getText(ast) === name)));
  assert.ok(node, `${name} is a production declaration`);
  return ts.transpileModule(node.getText(ast), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }) };
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(item => find(item, predicate)) : node && typeof node === 'object' ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)] : [];

function disclosure(query = '') {
  const values = [], effects = new Map(), frames = [], focused = [];
  let cursor = 0, dirty = false;
  const runtime = { ...React,
    useState(initial) { const key = cursor++; if (!(key in values)) values[key] = initial;
      return [values[key], value => { const next = typeof value === 'function' ? value(values[key]) : value; dirty ||= !Object.is(values[key], next); values[key] = next; }]; },
    useEffect(callback, dependencies) { const key = cursor++, previous = effects.get(key);
      if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) effects.set(key, { callback, dependencies, pending: true, cleanup: previous?.cleanup }); },
  };
  const dependencies = { React: runtime, Iconed: 'Iconed', useSearchParams: () => new URLSearchParams(query),
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }, cancelAnimationFrame: id => { frames[id - 1] = null; },
    document: { getElementById: id => ({ scrollIntoView() {}, focus: () => focused.push(id) }) } };
  const Component = new Function(...Object.keys(dependencies), `${compileDeclaration('./daily-brief.jsx', 'MoreDetail')}; return MoreDetail;`)(...Object.values(dependencies));
  const child = { type: 'input', props: { value: '작성 중인 합성 초안' } };
  const render = () => {
    let tree;
    for (let pass = 0; pass < 8; pass++) {
      cursor = 0; dirty = false; tree = Component({ title: '더보기', children: child, revealPanel: 'briefing' });
      for (const effect of effects.values()) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.callback(); }
      if (!dirty) return tree;
    }
    throw Error('Disclosure effects did not settle');
  };
  return { render, child, focused, flush: () => { frames.splice(0).forEach(frame => frame?.()); } };
}

test('secondary disclosure preserves the same child after collapse, including an unsaved draft', () => {
  const { render, child } = disclosure();
  let tree = render();
  assert.equal(find(tree, node => node.type === 'input').length, 0, 'secondary data stays lazy before first use');
  find(tree, node => node.type === 'button')[0].props.onClick();
  tree = render();
  assert.equal(find(tree, node => node.type === 'input')[0], child);
  find(tree, node => node.type === 'button')[0].props.onClick();
  tree = render();
  assert.equal(find(tree, node => node.type === 'input')[0], child, 'closing must not unmount or clear the draft');
  assert.equal(find(tree, node => node.props.hidden === true).length, 1);
  assert.equal(find(tree, node => node.type === 'button')[0].props['aria-expanded'], false);
});

test('an explicit briefing query reveals the same existing child and focuses its panel without a write', () => {
  const view = disclosure('panel=briefing'), tree = view.render();
  assert.equal(find(tree, node => node.type === 'button')[0].props['aria-expanded'], true);
  assert.equal(find(tree, node => node.type === 'input')[0], view.child);
  view.flush(); assert.deepEqual(view.focused, ['daily-brief-briefing']);
});

function glance(model, onRecord) {
  const deps = {
    React, goalCheckRows, recordFirstRows, goalSectionState, measurementLabel,
    seoulToday: () => '2026-10-20', objectiveToday: () => '2026-10-20',
    objectiveReading: () => ({ period: { phase: 'running' }, paceRows: [], keyResults: [], healthIndicators: [], unscored: 0 }),
    kpiRowsFor: () => [], splitObjectiveMetrics: () => ({ keyResults: [] }),
    paceSuggestion: () => null, objectiveSuggestion: () => null, attentionItems: () => [],
    OUTSIDE_RAIL_BUDGET: 3,
  };
  for (const name of ['Link', 'Button', 'TruthBadge', 'GlanceAttention', 'KpiStrip', 'GoalObjectiveCard', 'WeeklyMemo']) deps[name] = name;
  const Component = new Function(...Object.keys(deps), `${compileDeclaration('./goals.jsx', 'elapsedPercent')}
${compileDeclaration('./goals.jsx', 'GlanceView')}; return GlanceView;`)(...Object.values(deps));
  return Component({ model, objectives: model.objectives, hrefFor: objective => `/goal/${objective.id}`, checkHref: '/check?scope=personal', kpiHref: '/kpi', onRecord });
}

test('record-first action carries the original objective revision and metric, with attention before scorecards', () => {
  const objective = { id: 'local-goal', title: '합성 목표', status: 'active', scope: 'personal', revision: 17 };
  const metric = { id: 'local-metric', name: '합성 지표', objectiveId: objective.id, sourceKey: 'manual', measurement: { value: 0, coverage: 'complete' } };
  const model = { status: 'live', objectives: [objective], metrics: [metric], failedSources: [] };
  const calls = [];
  const tree = glance(model, (...args) => calls.push(args));
  const record = find(tree, node => node.type === 'Button' && node.props['data-record-metric'] === metric.id)[0];
  const event = { currentTarget: { id: 'same-opener' } };
  record.props.onClick(event);
  assert.deepEqual(calls, [[event, objective, metric]]);
  assert.equal(find(tree, node => node.type === 'Link')[0].props.href, '/check?scope=personal');
  const order = find(tree, node => ['GlanceAttention', 'KpiStrip', 'GoalObjectiveCard'].includes(node.type)).map(node => node.type);
  assert.deepEqual(order, ['GlanceAttention', 'KpiStrip', 'GoalObjectiveCard']);
  const failed = glance({ ...model, status: 'partial', failedSources: ['operating_metrics'] }, () => assert.fail('no write'));
  assert.equal(find(failed, node => node.type === 'Button' && node.props['data-record-metric']).length, 0, 'failed metric rows cannot offer record actions from stale data');
  assert.equal(find(failed, node => node.type === 'TruthBadge')[0].props.state, 'error');
});

test('record-first empty state requires both objective and metric sources to be complete', () => {
  const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
  const model = { status: 'live', objectives: [], metrics: [], failedSources: [] };
  assert.match(text(glance(model)), /이 조건의 직접 기록 지표가 없습니다/);
  for (const incomplete of [
    { failedSources: ['operating_objectives'] },
    { truncatedSources: ['operating_objectives'] },
    { failedSources: ['operating_metrics'] },
    { truncatedSources: ['operating_metrics'] },
  ]) {
    const tree = glance({ ...model, status: 'partial', ...incomplete });
    assert.match(text(tree), /직접 기록 지표를 모두 확인하지 못했습니다/);
    assert.doesNotMatch(text(tree), /이 조건의 직접 기록 지표가 없습니다/);
    assert.ok(find(tree, node => node.type === 'TruthBadge').length, 'incomplete source remains visible');
  }
});
