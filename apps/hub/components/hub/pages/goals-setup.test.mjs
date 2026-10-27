import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { GOAL_WORK_BASE, goalHref, goalScope, goalView, goalObjectiveInput } from '../../../lib/goal-client.js';
import { sidebarChildren, SIDEBAR_SCOPES } from '../hub-nav.js';
import { NAV_TREE } from '../hub-data.js';

function compile(file, names) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  return ts.transpileModule(ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast).replace(/^export /, '')).join('\n'), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const goalsCode = compile('./goals.jsx', ['goalRecordHref', 'goalRecordsRequested', 'GoalSetupSurface', 'Goals']);
const formCode = compile('../goal-components.jsx', ['submitShortcut', 'GoalObjectiveForm']);
const draftCode = compile('../use-goals.js', ['useGoalDraft']);
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(child => find(child, predicate)) : node && typeof node === 'object'
  ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)] : [];
function hooks() {
  const slots = []; let cursor = 0;
  return { React: { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; }, useEffect() {}, useCallback: callback => callback, useId: () => 'local-goal-form',
  }, render(callback) { cursor = 0; return callback(); } };
}
const primitive = ({ children }) => React.createElement('div', null, children);
function surface(query = '', pathname = GOAL_WORK_BASE, readStatus = 'live') {
  const runtime = hooks(), navigations = [];
  let params = new URLSearchParams(query);
  const objective = { id: 'previous-goal', title: '기존에 저장한 목표 원문', description: '기존 설명', status: 'active', scope: 'personal', periodStart: '2026-10-01', periodEnd: '2026-10-31' };
  const model = { status: readStatus, objectives: [objective, { ...objective, id: 'archived-goal', title: '보관된 기록 원문', status: 'archived' }], metrics: [], observations: [], links: [], refresh() {} };
  const SegmentedControl = () => null, SelectField = () => null, Button = primitive;
  const deps = { React: runtime.React, GOAL_WORK_BASE, goalHref, goalScope, goalView,
    useRouter: () => ({ replace: href => navigations.push(href), push: href => navigations.push(href) }), useSearchParams: () => params, usePathname: () => pathname,
    useGoals: () => model, goalCheckRows: () => [], seoulToday: () => '2026-10-27', shortDate: value => value, weekRange: () => '현재 주',
    Button, SegmentedControl, SelectField, TruthBadge: () => null, Kbd: primitive, TextField: () => null,
    GoalReadFeedback: ({ model }) => React.createElement('p', null, `읽기 ${model.status}`), EmptyState: ({ title }) => React.createElement('p', null, title),
    GlanceView: ({ objectives }) => React.createElement('div', { 'data-existing-records': true }, objectives.map(item => React.createElement('p', { key: item.id }, item.title))),
    KpiView: () => React.createElement('div', null, '기존 KPI 기록'), GoalCheckList: () => React.createElement('div', null, '기존 체크인 기록'), GoalWeeklyActuals: () => React.createElement('div', null, '기존 주간 실측'),
    Drawer: primitive, GoalObjectiveForm: () => null, GoalMetricForm: () => null, KpiAddDrawer: () => null,
    GoalDetail: ({ id }) => React.createElement('div', { 'data-goal-detail': id }, '저장된 기록 상세'), GoalQuickRecord: ({ objectiveId }) => React.createElement('div', { 'data-record-goal': objectiveId }, '저장된 지표 편집'),
  };
  const Goals = new Function(...Object.keys(deps), `${goalsCode}; return Goals;`)(...Object.values(deps));
  let tree;
  const render = () => { tree = runtime.render(() => Goals()); return renderToStaticMarkup(tree); };
  render();
  return { render, model, navigations, tree: () => tree,
    query(value) { params = new URLSearchParams(value); return render(); },
    control(label) { return find(tree, node => node.type === SegmentedControl && node.props.label === label)[0]; },
    statusFilter() { return find(tree, node => node.type === SelectField && node.props.label === '목표 상태')[0]; },
    create() { find(tree, node => node.type === Button && node.props.icon === 'plus')[0].props.onClick(); },
  };
}

test('both dedicated entry points start with blank structure without presenting old objectives as current', () => {
  for (const path of [GOAL_WORK_BASE, '/dashboard/overview']) {
    const app = surface('', path), original = structuredClone(app.model.objectives), html = app.render();
    assert.match(html, /목표를 다시 정할 자리/); assert.match(html, /핵심 결과/); assert.match(html, /유지 지표/);
    assert.doesNotMatch(html, /기존에 저장한 목표 원문|보관된 기록 원문|2026-10-01|2026-10-31|0%/);
    assert.deepEqual(app.model.objectives, original); assert.equal(app.navigations.length, 0, 'rendering has no write or redirect side effect');
  }
});

test('records stay explicitly separate, include archived records and preserve scope and tab navigation', () => {
  const app = surface(); app.control('새 설정과 기존 기록').props.onChange('records');
  const target = app.navigations.at(-1); assert.match(target, /records=1/); app.query(target.split('?')[1]);
  assert.match(app.render(), /기존에 저장한 목표 원문/); assert.match(app.render(), /보관된 기록 원문/);
  assert.match(app.render(), /새 목표로 자동 채택하거나 복사하지 않습니다/); assert.equal(app.statusFilter().props.value, 'all');
  app.control('소속 선택').props.onChange('company'); assert.match(app.navigations.at(-1), /scope=classin/); assert.match(app.navigations.at(-1), /records=1/);
  app.control('목표 화면 보기').props.onChange('kpi'); assert.match(app.navigations.at(-1), /kpi=1/); assert.match(app.navigations.at(-1), /records=1/);
});

test('view-only links stay empty while explicit history and direct goal/record links open existing records', () => {
  const app = surface(); app.control('목표 화면 보기').props.onChange('check');
  const href = app.navigations.at(-1); assert.match(href, /setup=1/); assert.match(href, /check=1/);
  assert.doesNotMatch(app.query(href.split('?')[1]), /기존 체크인 기록/);
  assert.doesNotMatch(app.query('check=1'), /기존 체크인 기록/);
  assert.match(app.query('check=1&records=1'), /기존 체크인 기록/);
  assert.match(app.query('goal=previous-goal'), /data-goal-detail="previous-goal"/);
  assert.match(app.query('goal=previous-goal&record=metric-id'), /data-record-goal="previous-goal"/);
});

test('actual sidebar and palette goal destinations all enter fresh structure without an explicit record identity', () => {
  const hrefs = SIDEBAR_SCOPES.flatMap(({ key }) => [...sidebarChildren('tasks', key), ...sidebarChildren('overview', key)].filter(item => ['my-okr', 'overview-goals'].includes(item.key)).map(item => item.path));
  hrefs.push(...NAV_TREE.filter(item => ['goals', 'my-okr', 'goals-check', 'goals-weekly'].includes(item.key)).map(item => item.path));
  hrefs.push('/dashboard/work/goals?kpi=1', '/dashboard/work/goals?check=1', '/dashboard/work/goals?weekly=1');
  assert.ok(hrefs.length >= 10);
  for (const href of hrefs) {
    const url = new URL(href.startsWith('/') ? href : `/${href}`, 'https://local.invalid');
    const app = surface(url.search, url.pathname), html = app.render();
    assert.equal(app.control('새 설정과 기존 기록').props.value, 'setup', href);
    assert.match(html, /목표를 다시 정할 자리/, href); assert.doesNotMatch(html, /기존에 저장한 목표 원문|기존 체크인 기록|기존 주간 실측/, href);
  }
});

test('fresh setup creation preserves the selected scope and never seeds an old goal identity', () => {
  const app = surface('scope=classin'); app.create();
  assert.match(app.navigations.at(-1), /new=goal/); assert.match(app.navigations.at(-1), /scope=classin/); assert.match(app.navigations.at(-1), /setup=1/);
  assert.doesNotMatch(app.navigations.at(-1), /goal=previous-goal/);
});

function formHarness(storage, onSubmit = async () => ({ state: 'error' })) {
  const runtime = hooks(), writes = [], TextField = () => null;
  const local = { readGoalLocal: (key, fallback) => storage.has(key) ? storage.get(key) : fallback, writeGoalLocal: (key, value) => { if (value === null) storage.delete(key); else storage.set(key, value); } };
  const useGoalDraft = new Function('React', ...Object.keys(local), `${draftCode}; return useGoalDraft;`)(runtime.React, ...Object.values(local));
  const deps = { React: runtime.React, useGoalDraft, useGoalCommand: (_key, _onSaved) => ({ locked: false, state: 'error', submit: async (...args) => { writes.push(args); return onSubmit(...args); } }),
    goalObjectiveInput, TextField, TextAreaField: () => null, SelectField: () => null, Button: primitive, Kbd: primitive, GoalCommandFeedback: () => null };
  const Form = new Function(...Object.keys(deps), `${formCode}; return GoalObjectiveForm;`)(...Object.values(deps));
  let tree;
  const render = () => { tree = runtime.render(() => Form({ freshSetup: true, scope: 'personal' })); return tree; };
  const input = label => find(tree, node => node.type === TextField && node.props.label === label)[0];
  render();
  return { writes, render, input, edit(label, value) { input(label).props.onChange({ target: { value } }); render(); }, submit: () => tree.props.onSubmit({ preventDefault() {} }) };
}

test('new setup isolates old drafts, leaves dates blank, and preserves only newly typed input after failed save and reopening', async () => {
  const storage = new Map([['draft:new:personal', { title: '이전 초안 제목', description: '이전 초안', scope: 'personal', periodStart: '2026-10-01', periodEnd: '2026-10-31', timezone: 'Asia/Seoul', status: 'active' }]]);
  let app = formHarness(storage); assert.equal(app.input('목표 이름').props.value, ''); assert.equal(app.input('시작일').props.value, ''); assert.equal(app.input('종료일').props.value, '');
  app.edit('목표 이름', '사용자가 직접 입력한 새 목표'); await app.submit(); assert.equal(app.writes.length, 0, 'blank period cannot be silently assigned');
  app.edit('시작일', '2027-01-11'); app.edit('종료일', '2027-02-12'); await app.submit();
  assert.equal(app.writes.length, 1); assert.equal(app.writes[0][1].periodStart, '2027-01-11');
  app = formHarness(storage); assert.equal(app.input('목표 이름').props.value, '사용자가 직접 입력한 새 목표'); assert.equal(app.input('종료일').props.value, '2027-02-12');
  assert.equal(storage.get('draft:new:personal').title, '이전 초안 제목', 'historical draft bytes remain unchanged');
});
