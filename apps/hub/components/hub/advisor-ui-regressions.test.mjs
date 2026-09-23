import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RECOMMENDED_TRIADS } from './council-legends.js';

// Run the real component bodies; external services and hooks stay local to each test.
function componentBody(path, name) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const declaration = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(declaration, name);
  return ts.transpileModule(declaration.getText(ast).replace(/^export /, ''), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const councilCode = componentBody('./pages/agents.jsx', 'CouncilCoachPanel');
const ProgressRing = new Function('React', `${componentBody('./hub-primitives.jsx', 'ProgressRing')}; return ProgressRing;`)(React);

function mountCouncil() {
  const slots = [], pending = [];
  let index = 0, tree;
  const hooks = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(Boolean) } }),
    useState: initial => {
      const key = index++;
      if (!(key in slots)) slots[key] = initial;
      return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }];
    },
  };
  const dependencies = {
    React: hooks, RECOMMENDED_TRIADS,
    requestCouncilAdvice: input => new Promise(resolve => pending.push({ input, resolve })),
    councilChatPath: () => '/dashboard/agents/chat', Card: 'Card', Badge: 'Badge', Button: 'Button', Dot: 'Dot',
  };
  const Panel = new Function(...Object.keys(dependencies), `${councilCode}; return CouncilCoachPanel;`)(...Object.values(dependencies));
  function render() { index = 0; tree = Panel({}); return tree; }
  function findAll(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props.children || []).flatMap(child => findAll(predicate, child))];
  }
  render();
  return { render, findAll, pending };
}
const triadButton = (app, triad) => app.findAll(node => node.type === 'button' && node.props.children.includes(triad.label))[0];
const launch = app => app.findAll(node => node.type === 'Button' && node.props.variant === 'primary')[0].props.onClick();
const badges = app => app.findAll(node => node.type === 'Badge').map(node => node.props.children.join(''));
const answer = text => ({ state: 'done', text, council: { lenses: [{ lens: '선택된 관점', verdict: text, cost: '확인 전 확약 보류' }], dissent: '남은 이견', conditionalVerdict: '자료 확인 시 진행', nextAction: '자료 확인' } });

test('Council locks settings in flight and keeps each result attributed to the triad that actually generated it', async () => {
  const app = mountCouncil(), [first, second] = RECOMMENDED_TRIADS;
  triadButton(app, first).props.onClick(); app.render();
  const initial = launch(app); app.render();
  assert.deepEqual(app.pending[0].input.legendIds, first.legendIds);
  assert.ok(app.findAll(node => node.type === 'button').every(node => node.props.disabled));
  triadButton(app, second).props.onClick(); app.render();
  assert.equal(triadButton(app, first).props['aria-pressed'], true);
  app.pending[0].resolve(answer('첫 자문')); await initial; app.render();
  assert.ok(badges(app).includes(`${first.label} 트라이어드`));
  triadButton(app, second).props.onClick(); app.render();
  assert.equal(triadButton(app, second).props['aria-pressed'], true);
  assert.ok(badges(app).includes(`${first.label} 트라이어드`));
  assert.ok(!badges(app).includes(`${second.label} 트라이어드`));
  assert.ok(app.findAll(node => node.props.children.includes('첫 자문')).length);
  const next = launch(app); app.render();
  assert.deepEqual(app.pending[1].input.legendIds, second.legendIds);
  app.pending[1].resolve(answer('두 번째 자문')); await next; app.render();
  assert.ok(badges(app).includes(`${second.label} 트라이어드`));
  assert.ok(!app.findAll(node => node.props.children.includes('첫 자문')).length);
  for (const label of ['이견 보존 (Dissent)', '조건부 판정', '즉시 실행 1단계']) {
    assert.equal(app.findAll(node => node.type === 'Badge' && node.props.children.includes(label))[0].props.tone, 'neutral');
  }
  const rail = app.findAll(node => node.props.style?.boxShadow?.startsWith('inset'))[0];
  assert.equal(rail.props.style.boxShadow, 'inset 1px 0 0 var(--line-strong)');
});

test('a default Council result is not relabeled when a triad is selected for the next request', async () => {
  const app = mountCouncil();
  const running = launch(app); app.render();
  assert.equal(app.pending[0].input.legendIds, undefined);
  app.pending[0].resolve(answer('기본 자문')); await running; app.render();
  triadButton(app, RECOMMENDED_TRIADS[0]).props.onClick(); app.render();
  assert.equal(badges(app).some(label => label.endsWith('트라이어드')), false);
  assert.ok(app.findAll(node => node.props.children.includes('기본 자문')).length);
});

test('Council renders tactical tip with moon tone badge and inset line when present', async () => {
  const app = mountCouncil();
  const running = launch(app); app.render();
  const answerWithTip = {
    state: 'done',
    text: '자문 본문',
    council: {
      lenses: [{ lens: '카네기', verdict: '경청하라', cost: '반박 포기' }],
      dissent: '남은 이견',
      conditionalVerdict: '조건부 결론',
      nextAction: '1:1 대화 요청',
      tacticalTip: '논쟁에서 이기는 유일한 방법은 논쟁을 피하는 것임을 명심하십시오.',
    },
  };
  app.pending[0].resolve(answerWithTip); await running; app.render();
  assert.ok(app.findAll(node => node.props?.children?.includes('논쟁에서 이기는 유일한 방법은 논쟁을 피하는 것임을 명심하십시오.')).length);
  const tipBadge = app.findAll(node => node.type === 'Badge' && node.props?.children?.includes('💡 거장의 실전 팁'))[0];
  assert.ok(tipBadge);
  assert.equal(tipBadge.props.tone, 'moon');
});

test('ProgressRing exposes a bounded progress value and retains excess completion in accessible text', () => {
  for (const [value, expected] of [[-5, 0], [0, 0], [50, 50], [100, 100], [120, 100], [NaN, 0], [Infinity, 0]]) {
    const markup = renderToStaticMarkup(React.createElement(ProgressRing, { value, size: 28, showLabel: true }));
    assert.match(markup, new RegExp(`aria-valuenow="${expected}"`));
    assert.match(markup, /aria-valuemin="0" aria-valuemax="100"/);
    assert.match(markup, /font-size:12px/);
    if (value === 120) {
      assert.match(markup, /aria-valuetext="120% 달성, 목표보다 20% 초과"/);
      // Excess completion stays on Moonstone tokens — no raw hex (incl. the retired warm gold).
      assert.doesNotMatch(markup, /#[0-9a-f]{3,8}\b/i);
    }
  }
});
