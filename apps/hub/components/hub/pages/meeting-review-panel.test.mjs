import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const BODY = '운영자 내 할 일: 고객에게 자료 발송';
const SOURCE = { quote: BODY, start: 0, end: BODY.length };

function equalDeps(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
}

function makeHooks() {
  const cells = [];
  let cursor = 0;
  let effects = [];
  const React = {
    createElement(type, props, ...children) {
      return { type, props: { ...props, children } };
    },
    useId() { return `candidate-${cursor++}`; },
    useRef(initial) {
      const index = cursor++;
      return cells[index] ??= { current: initial };
    },
    useState(initial) {
      const index = cursor++;
      const cell = cells[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cell.value, (next) => { cell.value = typeof next === 'function' ? next(cell.value) : next; }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!cells[index] || !equalDeps(cells[index].deps, deps)) effects.push({ index, effect, deps });
    },
  };
  function render(component, props) {
    cursor = 0;
    effects = [];
    const tree = component(props);
    for (const pending of effects) cells[pending.index] = { deps: pending.deps, cleanup: pending.effect() };
    return tree;
  }
  return { React, render };
}

function loadCandidate(React) {
  const source = readFileSync(new URL('./meeting-review-panel.jsx', import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, { fileName: 'meeting-review-panel.jsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
      esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const fakePrimitives = Object.fromEntries([
    'Button', 'CertaintyBadge', 'LifecycleBadge', 'SegmentedControl', 'Skeleton',
    'TextAreaField', 'TextField', 'TruthBadge',
  ].map((name) => [name, function Primitive() {}]));
  const fakeRequire = (name) => name === 'react' ? React
    : name === 'next/link' ? function Link() {}
      : name === '../hub-primitives' ? fakePrimitives
        : name === './meeting-review-panel.css' ? {} : require(name);
  new Function('require', 'module', 'exports', `${javascript}\nmodule.exports.Candidate = Candidate;`)(fakeRequire, module, module.exports);
  return { Candidate: module.exports.Candidate, primitives: fakePrimitives };
}

function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.map((item) => find(item, predicate)).find(Boolean);
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate);
}

function acceptedProposal() {
  return {
    id: '22222222-2222-4222-8222-222222222222', kind: 'action', text: '고객에게 자료 발송',
    certainty: 'derived', source: SOURCE, actionScope: 'mine',
    review: { status: 'accepted', text: '고객에게 자료 발송',
      execution: { actionScope: 'mine', dueAt: null, method: null, checklist: [] } },
    application: { status: 'none' },
  };
}

test('an unrelated proposal refresh preserves unsaved meeting plan fields', () => {
  const hooks = makeHooks();
  const { Candidate } = loadCandidate(hooks.React);
  const props = { proposal: acceptedProposal(), body: BODY, disabled: false, busy: false,
    selected: false, onSelect() {}, onReview() {}, onApplyTask() {} };
  const plan = (tree) => find(tree, (element) => element.type?.name === 'ActionExecutionFields');

  let tree = hooks.render(Candidate, props);
  plan(tree).props.setExecution((previous) => ({ ...previous, dueAt: '2026-10-02',
    method: '이메일로 PDF 발송', checklist: [{ id: 'step-1', title: 'PDF 확인', done: false, note: '' }] }));
  tree = hooks.render(Candidate, props);
  assert.equal(plan(tree).props.execution.dueAt, '2026-10-02');

  props.proposal = structuredClone(props.proposal); // controller GET reconstructs every proposal object
  tree = hooks.render(Candidate, props);
  tree = hooks.render(Candidate, props); // flush a scheduled synchronization effect, if any
  assert.deepEqual(plan(tree).props.execution, {
    actionScope: 'mine', dueAt: '2026-10-02', method: '이메일로 PDF 발송',
    checklist: [{ id: 'step-1', title: 'PDF 확인', done: false, note: '' }],
  });
});

test('this proposal still adopts a changed saved review', () => {
  const hooks = makeHooks();
  const { Candidate } = loadCandidate(hooks.React);
  const props = { proposal: acceptedProposal(), body: BODY, disabled: false, busy: false,
    selected: false, onSelect() {}, onReview() {}, onApplyTask() {} };
  const plan = (tree) => find(tree, (element) => element.type?.name === 'ActionExecutionFields');

  let tree = hooks.render(Candidate, props);
  plan(tree).props.setExecution((previous) => ({ ...previous, method: '미저장 초안' }));
  props.proposal = structuredClone(props.proposal);
  props.proposal.review.execution = { ...props.proposal.review.execution, method: '서버에서 확인한 방법' };
  hooks.render(Candidate, props);
  tree = hooks.render(Candidate, props);
  assert.equal(plan(tree).props.execution.method, '서버에서 확인한 방법');
});

test('review acceptance does not turn an AI interpretation into a confirmed fact', () => {
  const hooks = makeHooks();
  const { Candidate, primitives } = loadCandidate(hooks.React);
  const tree = hooks.render(Candidate, { proposal: acceptedProposal(), body: BODY,
    disabled: false, busy: false, selected: false, onSelect() {}, onReview() {}, onApplyTask() {} });
  const certainty = find(tree, (element) => element.type === primitives.CertaintyBadge);
  const lifecycle = find(tree, (element) => element.type === primitives.LifecycleBadge);
  assert.equal(certainty.props.state, 'recommended');
  assert.equal(certainty.props.label, 'AI 해석');
  assert.equal(lifecycle.props.label, '확인됨');
});

test('an unreviewed source statement is still a proposal', () => {
  const hooks = makeHooks();
  const { Candidate, primitives } = loadCandidate(hooks.React);
  const proposal = acceptedProposal();
  proposal.certainty = 'stated';
  proposal.review = { status: 'pending' };
  const tree = hooks.render(Candidate, { proposal, body: BODY,
    disabled: false, busy: false, selected: false, onSelect() {}, onReview() {}, onApplyTask() {} });
  const certainty = find(tree, (element) => element.type === primitives.CertaintyBadge);
  assert.equal(certainty.props.state, 'recommended');
  assert.equal(certainty.props.label, '원문 진술');
});
