import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { GURU_CARDS, LEGEND_CARDS, guidanceDailyWindow, listGuidanceCards, listGuidanceCardsForPerson, listGuidancePeople, selectGuidanceCard } from '../../../../../packages/guru-guidance/index.ts';
import { GuidanceSource } from '../guidance-source.jsx';

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
    'React', 'Button', 'Card', 'SegmentedControl', 'GuidanceSource',
    'selectGuidanceCard', 'guidanceDailyWindow', 'listGuidanceCards', 'listGuidancePeople', 'listGuidanceCardsForPerson',
    'sessionStorage', 'window', 'document',
    `${compiled}\nreturn MentorShelf;`,
  )(
    React, Button, Card, SegmentedControl, GuidanceSource,
    selectGuidanceCard,
    guidanceDailyWindow,
    listGuidanceCards,
    listGuidancePeople,
    listGuidanceCardsForPerson,
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
  const children = node.props?.children;
  return (Array.isArray(children) ? children : children == null ? [] : [children]).map(words).join(' ');
}

test('the shelf reads the current Seoul Guru window and weekly Legend together with full source identity', () => {
  assert.ok(source, 'mentor-shelf.jsx should implement the approved shelf');
  const app = mount();
  const tree = app.render();
  assert.match(words(tree), /필요할 때 꺼내 보는 관점/);
  assert.match(words(tree), /서울 기준 09·14·19시 교체/);
  assert.match(words(tree), /매주 한 장/);
  assert.match(words(tree), /다음\s+\d\d:\d\d/);
  assert.match(words(tree), /docs\/sales-guru-knowledge-base\.md/);
  assert.match(words(tree), /apps\/engine\/lib\/legend-cards\.ts/);
  assert.equal(nodes(tree, node => node.type === 'h2').length, 1);
  const [guruPerson, legendPerson] = nodes(tree, node => node.type === 'h4').map(node => words(node));
  const guru = GURU_CARDS.find(card => card.person === guruPerson);
  const legend = LEGEND_CARDS.find(card => card.person === legendPerson);
  assert.ok(guru && legend);
  for (const card of [guru, legend]) {
    assert.ok(words(tree).includes(card.frame), `${card.id} methodology should be visible`);
    assert.ok(words(tree).includes(card.question), `${card.id} question should be visible`);
  }
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

test('domain browsing exposes every reviewed card independently from the scheduled tip', () => {
  const asked = [];
  const app = mount({ onGuidanceAsk: card => asked.push(card) });
  let tree = app.render();
  nodes(tree, node => node.type === app.Button && /다른 관점/.test(words(node)))[0].props.onClick();
  tree = app.render();
  const scheduled = nodes(tree, node => node.type === 'h4')[0].props.children[0];
  const salesCards = listGuidanceCards({ cadence: 'daily', domain: 'sales' });
  assert.equal(salesCards.length, 13);
  const domainList = nodes(tree, node => node.type === 'ul' && node.props['aria-label'] === '세일즈 분야 카드 목록')[0];
  assert.ok(domainList, 'domain view should list reviewed cards, not three scheduled previews');
  assert.equal(nodes(domainList, node => node.type === 'button').length, salesCards.length);
  nodes(domainList, node => node.type === 'button' && /Napoleon Hill/.test(words(node)))[0].props.onClick();
  tree = app.render();
  assert.equal(nodes(tree, node => node.type === 'h4')[0].props.children[0], scheduled);
  const detail = nodes(tree, node => node.props?.role === 'region' && node.props?.className === 'mentor-shelf__person-detail')[0];
  assert.ok(detail);
  assert.match(words(detail), /Napoleon Hill/);
  assert.ok(words(detail).includes(salesCards.find(card => card.personName === 'Napoleon Hill').text));
  assert.equal(asked.length, 0);
  nodes(detail, node => node.type === app.Button && /선택한 관점으로 질문 쓰기/.test(words(node)))[0].props.onClick();
  assert.equal(asked[0].id, salesCards.find(card => card.personName === 'Napoleon Hill').id);
  const browseDomainControl = nodes(tree, node => node.type === app.SegmentedControl && node.props.label === '탐색 분야')[0];
  browseDomainControl.props.onChange('marketing');
  tree = app.render();
  assert.equal(nodes(tree, node => node.type === 'h4')[0].props.children[0], scheduled, 'browsing another domain must not reset the top card or its manual offset');
  const marketingList = nodes(tree, node => node.type === 'ul' && node.props['aria-label'] === '마케팅 분야 카드 목록')[0];
  assert.equal(nodes(marketingList, node => node.type === 'button').length, listGuidanceCards({ cadence: 'daily', domain: 'marketing' }).length);
});

test('the shelf lets the operator switch from domain browsing to a person and read that person’s source-backed card', () => {
  const asked = [];
  const app = mount({ onGuidanceAsk: card => asked.push(card) });
  let tree = app.render();
  const browseControl = nodes(tree, node => node.type === app.SegmentedControl && node.props.label === '멘토 탐색 방식')[0];
  assert.ok(browseControl, 'the existing browse section should offer domain and person views');
  browseControl.props.onChange('person');
  tree = app.render();
  assert.match(words(tree), /세일즈\s+멘토/);
  const person = nodes(tree, node => node.type === 'button' && /Keenan/.test(words(node)))[0];
  assert.ok(person, 'a verified person should be selectable without changing the scheduled card');
  const scheduled = nodes(tree, node => node.type === 'h4')[0].props.children[0];
  person.props.onClick();
  tree = app.render();
  assert.equal(nodes(tree, node => node.type === 'h4')[0].props.children[0], scheduled);
  assert.match(words(tree), /docs\/sales-guru-knowledge-base\.md/);
  assert.match(words(tree), /Keenan/);
  assert.equal(asked.length, 0, 'opening a person must stay read only');
  const ask = nodes(tree, node => node.type === app.Button && /선택한 관점으로 질문 쓰기/.test(words(node)))[0];
  assert.ok(ask);
  ask.props.onClick();
  assert.equal(asked.length, 1);
  assert.match(asked[0].person, /Keenan/);
});

test('all thirteen sales mentor profiles can be browsed even when a card is reserved for manual reading', () => {
  const people = listGuidancePeople({ domain: 'sales' });
  assert.equal(people.length, 13);
  assert.deepEqual(people.map(person => person.name), [...people.map(person => person.name)].sort((a, b) => a.localeCompare(b, 'en')));
  const hillCard = listGuidanceCardsForPerson('napoleon-hill')[0];
  assert.equal(hillCard.rotationEligible, false);
  const asked = [];
  const app = mount({ onGuidanceAsk: card => asked.push(card) });
  let tree = app.render();
  nodes(tree, node => node.type === app.SegmentedControl && node.props.label === '멘토 탐색 방식')[0].props.onChange('person');
  tree = app.render();
  assert.match(words(tree), /검수 카드가 있는 인물\s+13\s*명/);
  nodes(tree, node => node.type === 'button' && /Napoleon Hill/.test(words(node)))[0].props.onClick();
  tree = app.render();
  const detail = nodes(tree, node => node.props?.role === 'region' && node.props?.className === 'mentor-shelf__person-detail')[0];
  assert.ok(detail);
  assert.match(words(detail), /Napoleon Hill/);
  assert.ok(words(detail).includes(hillCard.text));
  assert.match(words(detail), /직접 선택해 읽는 관점 · 시간대 카드에는 나오지 않습니다/);
  assert.equal(asked.length, 0);
  nodes(detail, node => node.type === app.Button && /선택한 관점으로 질문 쓰기/.test(words(node)))[0].props.onClick();
  assert.equal(asked[0].id, hillCard.id);
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
  assert.deepEqual(navigations, ['dashboard/agents/chat?agent=guru']);
});

test('the shelf follows Hub token and responsive contracts', () => {
  assert.match(source, /sessionStorage/);
  assert.match(source, /guidanceDailyWindow\(now\)/);
  assert.match(source, /새 시간대 관점 보기/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.match(css, /\.mentor-shelf__domains \.hub-seg__btn,\s*\.mentor-shelf__browse-mode \.hub-seg__btn,\s*\.mentor-shelf__people-domains \.hub-seg__btn\s*\{[^}]*min-height:\s*44px/);
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b|rgba?\(|oklch\(/i);
  assert.doesNotMatch(source, /\bfetch\s*\(|work_order|approval/i);
});
