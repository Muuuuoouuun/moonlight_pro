import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { guidancePeriodKey, selectGuidanceCard } from '../../../../../packages/guru-guidance/index.ts';

const jsxFile = new URL('./mentor-shelf.jsx', import.meta.url);
const cssFile = new URL('./mentor-shelf.css', import.meta.url);
const source = existsSync(jsxFile) ? readFileSync(jsxFile, 'utf8') : '';
const css = existsSync(cssFile) ? readFileSync(cssFile, 'utf8') : '';

function mount({ onGuidanceAsk = () => {}, onNavigate = () => {} } = {}) {
  const slots = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children: children.flat(Infinity).filter(value => value != null && value !== false) },
    }),
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      }];
    },
    useEffect: () => {},
  };
  const Button = function Button() {};
  const Card = function Card() {};
  const SegmentedControl = function SegmentedControl() {};
  const compiled = ts.transpile(
    source.replace(/^import[^\n]+\n/gm, '').replace(/^export /gm, ''),
    { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  );
  const MentorShelf = new Function(
    'React', 'Button', 'Card', 'SegmentedControl',
    'selectGuidanceCard', 'guidancePeriodKey', 'sessionStorage', 'window', 'document',
    `${compiled}\nreturn MentorShelf;`,
  )(
    React, Button, Card, SegmentedControl,
    selectGuidanceCard,
    guidancePeriodKey,
    { getItem: () => null, setItem: () => {} },
    { addEventListener: () => {}, removeEventListener: () => {} },
    { addEventListener: () => {}, removeEventListener: () => {}, hidden: false },
  );
  return {
    Button,
    SegmentedControl,
    render() { cursor = 0; return MentorShelf({ onGuidanceAsk, onNavigate }); },
  };
}

function nodes(tree, match) {
  const found = [];
  function visit(node) {
    if (node == null || typeof node !== 'object') return;
    if (match(node)) found.push(node);
    for (const child of node.props?.children || []) visit(child);
  }
  visit(tree);
  return found;
}

function words(node) {
  if (node == null) return '';
  if (typeof node !== 'object') return String(node);
  if (typeof node.type === 'function' && node.type.name === 'GuidanceSource') return words(node.type(node.props));
  return (node.props?.children || []).map(words).join(' ');
}

test('the shelf reads a daily Guru and weekly Legend together with full source identity', () => {
  assert.ok(source, 'mentor-shelf.jsx should implement the approved shelf');
  const app = mount();
  const tree = app.render();
  assert.match(words(tree), /필요할 때 꺼내 보는 관점/);
  assert.match(words(tree), /매일 한 장/);
  assert.match(words(tree), /매주 한 장/);
  assert.match(words(tree), /docs\/sales-guru-knowledge-base\.md/);
  assert.match(words(tree), /apps\/engine\/lib\/legend-cards\.ts/);
  assert.equal(nodes(tree, node => node.type === 'h2').length, 1);
});

test('domain changes and manual next stay local until the operator explicitly asks', () => {
  const asked = [];
  const app = mount({ onGuidanceAsk: card => asked.push(card) });
  let tree = app.render();
  const domainControl = nodes(tree, node => node.type === app.SegmentedControl)[0];
  domainControl.props.onChange('marketing');
  tree = app.render();
  const firstMarketing = nodes(tree, node => node.type === 'h4')[0].props.children[0];
  assert.match(firstMarketing, /Seth Godin|David Ogilvy/);
  const ask = nodes(tree, node => node.type === app.Button && /브랜드 멘토에게 질문 쓰기/.test(words(node)))[0];
  assert.ok(ask);
  assert.equal(asked.length, 0);
  const next = nodes(tree, node => node.type === app.Button && /다른 관점/.test(words(node)))[0];
  next.props.onClick();
  tree = app.render();
  const nextMarketing = nodes(tree, node => node.type === 'h4')[0].props.children[0];
  assert.notEqual(nextMarketing, firstMarketing);
  assert.equal(asked.length, 0);
  nodes(tree, node => node.type === app.Button && /브랜드 멘토에게 질문 쓰기/.test(words(node)))[0].props.onClick();
  assert.equal(asked[0].person, nextMarketing);
});

test('Legend remains reading only and conversation starts through the explicit route', () => {
  const navigations = [];
  const app = mount({ onNavigate: path => navigations.push(path) });
  let tree = app.render();
  assert.equal(nodes(tree, node => node.type === app.Button && /Legend.*질문/.test(words(node))).length, 0);
  nodes(tree, node => node.type === app.Button && /다른 Legend 보기/.test(words(node)))[0].props.onClick();
  tree = app.render();
  assert.equal(navigations.length, 0);
  nodes(tree, node => node.type === app.Button && /대화 시작/.test(words(node)))[0].props.onClick();
  assert.deepEqual(navigations, ['dashboard/agents/chat?view=chat']);
});

test('the shelf follows Hub token and responsive contracts', () => {
  assert.match(source, /sessionStorage/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b|rgba?\(|oklch\(/i);
  assert.doesNotMatch(source, /\bfetch\s*\(|work_order|approval/i);
});
