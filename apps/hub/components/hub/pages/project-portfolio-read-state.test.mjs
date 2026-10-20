import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { readTaskChecklist } from '../../../lib/task-checklist.js';
import { projectIndexDoneState } from '../../../lib/project-index-order.js';
import { canReviewProjectCompletion, resolveProjectNextAction } from '../../../lib/project-action-state.js';

// Render the real workspace branches; primitive/hook doubles inspect truth and
// callbacks. Browser checks cover the actual primitives, layout and focus.
const source = readFileSync(new URL('./project-portfolio-workspace.jsx', import.meta.url), 'utf8');
const compiled = ts.transpile(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
const children = node => [node?.props?.children || []].flat(Infinity);
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : children(node).map(text).join('');
const nodes = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...children(node).flatMap(child => nodes(child, predicate))];
const placeholders = tree => nodes(tree, node => node.type === 'EmptyState');
const copy = tree => text(tree) + placeholders(tree).map(node => `${node.props.title} ${node.props.description}`).join(' ');
const buttons = (tree, label) => nodes(tree, node => ['Button', 'button'].includes(node.type) && text(node) === label);
const item = { id: 'project-a', name: '검토할 프로젝트', statusKey: 'active', brand: 'personal', deadlineAlertSuppressed: true };

test('Projects starts uncached reads as loading and preserves a verified cached state', () => {
  const projects = readFileSync(new URL('./projects.jsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('projects.jsx', projects, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let initial;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === '[syncState, setSyncState]') initial = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(initial);
  const initialize = new Function('cachedProjects', `return ${initial};`);
  assert.equal(initialize(null), 'loading');
  for (const syncState of ['live', 'partial']) assert.equal(initialize({ syncState }), syncState);
});

function mount(initial = {}) {
  const slots = []; let cursor = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'fragment',
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect() {} };
  const styles = new Proxy({}, { get: (_, key) => key });
  const scope = { React, readTaskChecklist, projectIndexDoneState, canReviewProjectCompletion, resolveProjectNextAction,
    workStyles: styles, indexStyles: styles, deliveryStyles: styles,
    portfolioWindow: () => ({}), classifyProjectPortfolio: () => ({}), selectUrgentProjectItems: () => [],
    buildCurrentMonthProjectPreview: () => ({}), projectStatusLabel: value => value || '',
    useProjectIndexControls: projects => ({ ordered: projects, sortLabel: '직접 정렬', doneCollapsed: false, listRef: { current: null } }),
    ...Object.fromEntries(['Badge', 'Button', 'Drawer', 'EmptyState', 'IconButton', 'Input', 'SegmentedControl', 'Skeleton',
      'Iconed', 'ProjectWorkList', 'ProjectIndexMenu', 'ProjectDeliverySummary', 'BrandMark'].map(name => [name, name])) };
  const Component = new Function(...Object.keys(scope), `${compiled}\nreturn ProjectPortfolioWorkspace;`)(...Object.values(scope));
  let props = { projects: [], portfolioProjects: [], todosByProject: new Map(), brandByKey: new Map(), sourceState: 'live', ...initial };
  return { render(next = {}) { props = { ...props, ...next }; cursor = 0; return Component(props); } };
}

test('first read error is unknown in both panes and retry invokes the read callback', () => {
  let reads = 0;
  const tree = mount({ sourceState: 'error', readError: '읽기 연결 실패', onReload: () => reads++ }).render();
  assert.doesNotMatch(copy(tree), /프로젝트 없음|첫 프로젝트|프로젝트를 추가해 시작|조건에 맞는 프로젝트/);
  assert.match(copy(tree), /목록 확인 필요/);
  assert.match(text(tree), /읽기 연결 실패/);
  assert.equal(nodes(tree, node => node.props['aria-label'] === '프로젝트 수 미확인').length, 1);
  buttons(tree, '다시 시도')[0].props.onClick(); assert.equal(reads, 1);
});

test('error with a requested project or filters does not claim missing selection or no matches', () => {
  for (const extra of [{ selectedProjectId: 'unread-id' }, { query: '찾을 이름', activeFilter: 'active' }]) {
    const tree = mount({ sourceState: 'error', ...extra }).render();
    assert.doesNotMatch(copy(tree), /찾을 수 없습니다|조건에 맞는 프로젝트|첫 프로젝트/);
    assert.match(copy(tree), /목록 확인 필요/);
  }
});

test('initial and retry loading use skeletons, not empty prompts or a confirmed zero', () => {
  const view = mount({ sourceState: 'error' }); view.render();
  const loading = view.render({ sourceState: 'loading', readError: null });
  assert.equal(placeholders(loading).length, 0);
  assert.equal(nodes(loading, node => node.type === 'Skeleton').length, 2);
  assert.doesNotMatch(text(loading), /첫 프로젝트|프로젝트 없음|전체 0개/);
  assert.equal(nodes(loading, node => node.props['aria-label'] === '프로젝트 수 미확인').length, 1);
});

test('only a confirmed empty project read offers the first-project prompt', () => {
  let creates = 0;
  const tree = mount({ onCreateProject: () => creates++ }).render();
  assert.match(copy(tree), /프로젝트 없음/); assert.match(text(tree), /첫 프로젝트를 시작하세요/);
  buttons(tree, '프로젝트 추가').at(-1).props.onClick(); assert.equal(creates, 1);
});

test('incomplete project reads do not assert absence, unlike unrelated partial sources', () => {
  for (const extra of [{ projectCorePartial: true }, { failedSources: ['projects'] }]) {
    const tree = mount({ sourceState: 'partial', ...extra }).render();
    assert.match(copy(tree), /목록 확인 필요/);
    assert.doesNotMatch(copy(tree), /프로젝트 없음|첫 프로젝트|찾을 수 없습니다/);
  }
  const taskFailure = mount({ sourceState: 'partial', failedSources: ['tasks'] }).render();
  assert.match(text(taskFailure), /첫 프로젝트를 시작하세요/);
});

test('confirmed filter misses and missing selection retain their recovery actions', () => {
  let query, filter;
  const tree = mount({ query: '찾을 이름', onQueryChange: value => { query = value; }, onFilterChange: value => { filter = value; } }).render();
  assert.match(copy(tree), /조건에 맞는 프로젝트/);
  buttons(tree, '검색·필터 지우기')[0].props.onClick(); assert.equal(query, ''); assert.equal(filter, null);
  assert.match(text(mount({ selectedProjectId: 'missing-id' }).render()), /요청한 프로젝트를 찾을 수 없습니다/);
});

test('cached project and work drafts survive error, retry and recovery', () => {
  const view = mount({ projects: [item], portfolioProjects: [item], canWriteTasks: true });
  const initial = view.render();
  const work = tree => nodes(tree, node => node.type === 'ProjectWorkList')[0];
  const draft = { 'project-a': { title: '아직 보내지 않은 입력' } };
  work(initial).props.draftStore.setDrafts(draft);
  for (const sourceState of ['error', 'loading', 'live']) {
    const tree = view.render({ sourceState, canWriteTasks: sourceState === 'live' });
    assert.equal(work(tree).props.projectId, 'project-a');
    assert.equal(work(tree).props.draftStore.drafts, draft);
    assert.match(text(tree), /검토할 프로젝트/);
    assert.doesNotMatch(copy(tree), /첫 프로젝트|프로젝트 없음/);
    if (sourceState === 'error') assert.match(text(tree), /이전에 읽은 프로젝트/);
  }
});

test('read transitions keep an open create surface and manual create entry', () => {
  let creates = 0;
  const draft = { type: 'draft-form', props: { children: '작성 중인 프로젝트' } };
  const view = mount({ createSurface: draft, onCreateProject: () => creates++ });
  for (const sourceState of ['error', 'loading', 'partial', 'live']) {
    const tree = view.render({ sourceState });
    assert.equal(nodes(tree, node => node.type === 'draft-form')[0], draft);
    buttons(tree, '프로젝트 추가')[0].props.onClick();
  }
  assert.equal(creates, 4);
});

test('preview stays explicitly disconnected and is not a confirmed live empty index', () => {
  const tree = mount({ sourceState: 'preview' }).render();
  assert.match(placeholders(tree)[0].props.title, /Preview/);
  assert.match(text(tree), /Preview · 실제 프로젝트 없음/);
});
