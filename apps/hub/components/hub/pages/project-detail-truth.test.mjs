import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { canReviewProjectCompletion } from '../../../lib/project-action-state.js';
import { projectBrandContentMessage } from '../../../lib/project-brand-content.js';

const source = readFileSync(new URL('./project-detail-panel.jsx', import.meta.url), 'utf8');
const compiled = ts.transpile(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
const text = node => typeof node === 'string' ? node : node && typeof node === 'object' ? [node.props?.children || []].flat(Infinity).map(text).join('') : '';
const nodes = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...[node.props?.children || []].flat(Infinity).flatMap(child => nodes(child, predicate))];
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: initial => [initial, () => {}], useRef: current => ({ current }), useEffect() {} };
const scope = { React, canReviewProjectCompletion, projectBrandContentMessage, FEATURE_GATES: {}, projectCustomerRef: () => null, projectMemoContexts: () => [],
  ...Object.fromEntries(['Iconed', 'RelatedMemos', 'GoalLinks', 'GitHubPrMark', 'Badge', 'Button', 'Checkbox', 'IconButton', 'SegmentedControl', 'TruthBadge', 'ProjectCustomerPanel', 'ProjectDeliverySummary', 'BrandMark', 'ProjectProgressGauge', 'ProjectStatusBadge', 'TaskChecklistGauge', 'ProjectUnblockSection'].map(name => [name, name])) };
const Panel = new Function(...Object.keys(scope), `${compiled}\nreturn ProjectDetailPanel;`)(...Object.values(scope));
const project = { id: 'synthetic-project', name: '테스트 데모', brandId: 'brand-a', orgScope: 'personal', statusKey: 'active' };
const render = extra => Panel({ project, syncState: 'live', ...extra });
const section = tree => nodes(tree, node => node.props['aria-label'] === '같은 브랜드 콘텐츠')[0];
const button = (tree, label) => nodes(tree, node => node.type === 'Button' && text(node) === label)[0];

test('brand content attribution is not presented as a project link or unbounded total', () => {
  const tree = render({ contentState: 'live', content: [{ id: 'video', title: '브랜드 영상' }] });
  assert.match(text(section(tree)), /프로젝트에 직접 연결된 자료가 아닌/);
  assert.match(text(section(tree)), /최대 5건/);
  assert.equal(nodes(section(tree), node => node.type?.name === 'DetailSection')[0].props.title, '같은 브랜드 콘텐츠');
});

test('successful empty is distinct from loading/error/partial/preview and no brand', () => {
  const empty = nodes(section(render({ contentState: 'live' })), node => node.type?.name === 'DetailSection')[0];
  assert.match(empty.props.empty, /불러온 콘텐츠에서/);
  for (const contentState of ['idle', 'loading', 'error', 'partial', 'preview']) {
    const content = section(render({ contentState }));
    assert.equal(nodes(content, node => node.type?.name === 'DetailSection').length, 0);
    assert.ok(nodes(content, node => ['status', 'alert'].includes(node.props.role)).length);
  }
  assert.match(text(section(render({ project: { ...project, brandId: null }, contentState: 'live' }))), /브랜드가 지정되지/);
});

test('failed refresh retains visible previous items with alert and explicit retry', () => {
  let retries = 0;
  const tree = render({ contentState: 'error', content: [{ id: 'old', title: '이전 조회' }], onReloadContent: () => retries++ });
  assert.match(text(section(tree)), /이전 조회 결과/);
  assert.equal(nodes(section(tree), node => node.type?.name === 'ActivityRow').length, 1);
  button(tree, '콘텐츠 다시 확인').props.onClick(); assert.equal(retries, 1);
});

test('stale/failed task snapshots never promote result review as the primary action', () => {
  const todos = [{ id: 'task', title: '데모', done: true }];
  assert.ok(button(render({ todos }), '결과 확인하고 완료 검토'));
  for (const syncState of ['error', 'loading', 'preview']) assert.equal(button(render({ todos, syncState }), '결과 확인하고 완료 검토'), undefined);
  assert.equal(button(render({ todos, failedSources: ['tasks'] }), '결과 확인하고 완료 검토'), undefined);
  assert.equal(button(render({ todos, taskPartial: true }), '결과 확인하고 완료 검토'), undefined);
  assert.ok(button(render({ todos, syncState: 'error' }), '완료 검토'), 'manual result editor remains available; this is not a new completion policy');
});

test('Council is explicitly personal-only; company/unknown scope cannot invoke it from detail', () => {
  let called = null;
  const personal = render({ onConsultCouncil: value => { called = value; } });
  button(personal, 'Council 조언').props.onClick(); assert.equal(called, project);
  for (const orgScope of ['classin', undefined]) {
    const tree = render({ project: { ...project, orgScope }, onConsultCouncil: () => { throw new Error('must not call'); } });
    assert.equal(button(tree, 'Council 조언'), undefined);
    assert.ok(button(tree, '주문 보내기'), 'existing Office action is retained, not auto-run');
    assert.match(text(tree), orgScope === 'classin' ? /개인 프로젝트 전용/ : /범위를 확인할 수 없어/);
  }
});

test('Projects caller passes canonical scoped task records and explicit project scope', () => {
  const projects = readFileSync(new URL('./projects.jsx', import.meta.url), 'utf8');
  assert.match(projects, /for \(const t of scopedTodos\)[\s\S]{0,220}t\.project/);
  assert.match(projects, /orgScope: councilWidgetProject\?\.orgScope/);
  assert.match(projects, /todos: councilWidgetProject \? \(todosByProject\.get\(councilWidgetProject.id\) \|\| \[\]\) : \[\]/);
  assert.doesNotMatch(projects, /\(ledger.todos \|\| \[\]\)\.filter/);
});
