import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { GURU_CARDS, LEGEND_CARDS, guidanceDailyWindow, listGuidanceCards, listGuidanceCardsForPerson, listGuidancePeople, selectGuidanceCard } from '../../../../../packages/guru-guidance/index.ts';
import { SOURCE_PEOPLE } from '../../../../../packages/guru-guidance/source-people.generated.js';
import { GuidanceSource } from '../guidance-source.jsx';

const jsxFile = new URL('./mentor-shelf.jsx', import.meta.url);
const cssFile = new URL('./mentor-shelf.css', import.meta.url);
const source = existsSync(jsxFile) ? readFileSync(jsxFile, 'utf8') : '';
const css = existsSync(cssFile) ? readFileSync(cssFile, 'utf8') : '';

function mount({ onGuidanceAsk = () => {}, onNavigate = () => {}, getElementById = () => null } = {}) {
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
  // The reader loads the original text lazily; here it only records what the shelf asked for.
  const GuidanceSourceReader = function GuidanceSourceReader() {};
  const compiled = ts.transpile(
    source.replace(/^import[^\n]+\n/gm, '').replace(/^export /gm, ''),
    { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  );
  const MentorShelf = new Function(
    'React', 'Button', 'Card', 'SegmentedControl', 'GuidanceSource', 'GuidanceSourceReader', 'SOURCE_PEOPLE',
    'selectGuidanceCard', 'guidanceDailyWindow', 'listGuidanceCards', 'listGuidancePeople', 'listGuidanceCardsForPerson',
    'sessionStorage', 'window', 'document',
    `${compiled}\nreturn MentorShelf;`,
  )(
    React, Button, Card, SegmentedControl, GuidanceSource, GuidanceSourceReader, SOURCE_PEOPLE,
    selectGuidanceCard,
    guidanceDailyWindow,
    listGuidanceCards,
    listGuidancePeople,
    listGuidanceCardsForPerson,
    { getItem: () => null, setItem: () => {} },
    { addEventListener: () => {}, removeEventListener: () => {} },
    { addEventListener: () => {}, removeEventListener: () => {}, hidden: false, getElementById },
  );
  return {
    Button,
    SegmentedControl,
    GuidanceSourceReader,
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
  assert.match(words(tree), /packages\/guru-guidance\/legend-library\.ts/);
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

test('domain browsing leads with the method while person browsing leads with the name', () => {
  const app = mount();
  let tree = app.render();
  const domainList = nodes(tree, node => node.type === 'ul' && node.props['aria-label'] === '세일즈 분야 카드 목록')[0];
  const firstDomainChoice = nodes(domainList, node => node.type === 'button')[0];
  const firstDomainCard = listGuidanceCards({ cadence: 'daily', domain: 'sales' })
    .find(card => card.id === firstDomainChoice.props['data-card-id']);
  assert.equal(words(nodes(firstDomainChoice, node => node.type === 'strong')[0]), firstDomainCard.methodLabel);
  assert.equal(words(nodes(firstDomainChoice, node => node.type === 'span')[0]), firstDomainCard.personName);
  assert.equal(firstDomainChoice.props['aria-expanded'], undefined, 'selection is not a disclosure');
  nodes(tree, node => node.type === app.SegmentedControl && node.props.label === '멘토 탐색 방식')[0].props.onChange('person');
  tree = app.render();
  const personList = nodes(tree, node => node.type === 'ul' && node.props['aria-label'] === '세일즈 멘토 목록')[0];
  const firstPersonChoice = nodes(personList, node => node.type === 'button')[0];
  assert.equal(words(nodes(firstPersonChoice, node => node.type === 'strong')[0]), listGuidancePeople({ domain: 'sales' })[0].name);
  assert.equal(firstPersonChoice.props['aria-expanded'], undefined);
});

test('the shelf gives a direct browse jump and returns focus to the selected list item', () => {
  const focused = [];
  const scrolled = [];
  const app = mount({ getElementById: id => ({ focus: () => focused.push(id), scrollIntoView: () => scrolled.push(id) }) });
  let tree = app.render();
  nodes(tree, node => node.type === app.Button && /멘토 찾아보기/.test(words(node)))[0].props.onClick();
  assert.deepEqual(scrolled, ['mentor-shelf-browse']);
  assert.deepEqual(focused, ['mentor-shelf-browse']);
  const domainList = nodes(tree, node => node.type === 'ul' && node.props['aria-label'] === '세일즈 분야 카드 목록')[0];
  const hill = nodes(domainList, node => node.type === 'button' && /Napoleon Hill/.test(words(node)))[0];
  hill.props.onClick();
  tree = app.render();
  const detail = nodes(tree, node => node.props?.role === 'region' && node.props?.className === 'mentor-shelf__person-detail')[0];
  nodes(detail, node => node.type === app.Button && /목록으로/.test(words(node)))[0].props.onClick();
  assert.deepEqual(focused, ['mentor-shelf-browse', `mentor-shelf-choice-domain-${hill.props['data-card-id']}`]);
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

const readerNodes = (app, tree) => nodes(tree, node => node.type === app.GuidanceSourceReader);
const buttonNamed = (app, tree, pattern) => nodes(tree, node => node.type === app.Button && pattern.test(words(node)))[0];

test('browse detail opens the full original below the card, focused on the card section, without asking anything', () => {
  const asked = [];
  const navigations = [];
  const app = mount({ onGuidanceAsk: card => asked.push(card), onNavigate: path => navigations.push(path) });
  let tree = app.render();
  assert.equal(readerNodes(app, tree).length, 0, 'the original stays closed until asked for');
  const domainList = nodes(tree, node => node.type === 'ul' && node.props['aria-label'] === '세일즈 분야 카드 목록')[0];
  nodes(domainList, node => node.type === 'button' && /MEDDIC/.test(words(node)))[0].props.onClick();
  tree = app.render();
  const detail = nodes(tree, node => node.props?.role === 'region' && node.props?.className === 'mentor-shelf__person-detail')[0];
  const open = buttonNamed(app, detail, /원문 전체 읽기/);
  assert.ok(open, 'the card detail offers the full original as a secondary action');
  assert.equal(open.props.variant, 'outline');
  assert.equal(open.props['aria-expanded'], false);
  open.props.onClick();
  tree = app.render();
  const openDetail = nodes(tree, node => node.props?.role === 'region' && node.props?.className === 'mentor-shelf__person-detail')[0];
  const [reader] = readerNodes(app, openDetail);
  assert.ok(reader, 'the reader renders inline inside the selected card');
  assert.equal(reader.props.card.id, 'sales-meddic');
  assert.equal(reader.props.card.source.section, 'Qualification — MEDDIC 프레임워크');
  assert.equal(reader.props.id, 'mentor-shelf-source-reader');
  assert.equal(typeof reader.props.onClose, 'function');
  const close = buttonNamed(app, openDetail, /원문 닫기/);
  assert.equal(close.props['aria-expanded'], true);
  assert.equal(close.props['aria-controls'], 'mentor-shelf-source-reader');
  assert.deepEqual([asked.length, navigations.length], [0, 0], 'reading the original never asks a mentor or navigates');
  nodes(tree, node => node.type === 'button' && /GAP Selling/.test(words(node)))[0].props.onClick();
  tree = app.render();
  assert.equal(readerNodes(app, tree).length, 0, 'choosing another card closes the previous original');
});

test('person browsing opens the same original for the selected person card', () => {
  const app = mount();
  let tree = app.render();
  nodes(tree, node => node.type === app.SegmentedControl && node.props.label === '멘토 탐색 방식')[0].props.onChange('person');
  tree = app.render();
  nodes(tree, node => node.type === 'button' && /Keenan/.test(words(node)))[0].props.onClick();
  tree = app.render();
  const detail = () => nodes(tree, node => node.props?.role === 'region' && node.props?.className === 'mentor-shelf__person-detail')[0];
  buttonNamed(app, detail(), /원문 전체 읽기/).props.onClick();
  tree = app.render();
  const [reader] = readerNodes(app, detail());
  assert.equal(reader.props.card.personId, 'keenan');
  assert.equal(reader.props.headingLevel, 5, 'original headings sit below the card h4, never h1/h2');
});

test('the weekly Legend card opens its long card and micro-card originals across the full row', () => {
  const navigations = [];
  const app = mount({ onNavigate: path => navigations.push(path) });
  let tree = app.render();
  const legendArticle = nodes(tree, node => node.props?.['aria-label'] === '이번 주 Legend 카드')[0];
  const open = buttonNamed(app, legendArticle, /원문 전체 읽기/);
  assert.ok(open);
  open.props.onClick();
  tree = app.render();
  const legendPerson = nodes(tree, node => node.type === 'h4').map(node => words(node))[1];
  const legend = LEGEND_CARDS.find(card => card.person === legendPerson);
  const wrapper = nodes(tree, node => node.props?.className === 'mentor-shelf__legend-reader')[0];
  assert.ok(wrapper, 'the Legend original spans the row below both cards');
  const [reader] = readerNodes(app, wrapper);
  assert.equal(reader.props.card.id, legend.id, 'resolved by card id, never by source.path');
  assert.equal(reader.props.headingLevel, 4);
  assert.match(reader.props.label, /이번 주 Legend/);
  assert.equal(navigations.length, 0);
  buttonNamed(app, tree, /다른 Legend 보기/).props.onClick();
  tree = app.render();
  assert.equal(readerNodes(app, tree).length, 0, 'the next Legend starts closed');
});

test('person browsing lists people with originals but no reviewed card and reads them directly', () => {
  const asked = [];
  const app = mount({ onGuidanceAsk: card => asked.push(card) });
  let tree = app.render();
  nodes(tree, node => node.type === app.SegmentedControl && node.props.label === '멘토 탐색 방식')[0].props.onChange('person');
  tree = app.render();
  nodes(tree, node => node.type === app.SegmentedControl && node.props.label === '탐색 분야')[0].props.onChange('content');
  tree = app.render();
  const withCards = new Set(listGuidancePeople().map(person => person.id));
  const expected = SOURCE_PEOPLE.filter(person => person.collection === 'content' && !withCards.has(person.personId));
  assert.ok(expected.length >= 6, 'the content original names people the cards never covered');
  const sourceList = nodes(tree, node => node.type === 'ul' && node.props['aria-label'] === '콘텐츠 원문만 있는 인물 목록')[0];
  assert.ok(sourceList);
  const choices = nodes(sourceList, node => node.type === 'button');
  assert.deepEqual(choices.map(node => words(nodes(node, item => item.type === 'strong')[0])),
    expected.map(person => person.name).sort((a, b) => a.localeCompare(b, 'en')));
  assert.ok(choices.every(node => /원문만 · 검수 카드 없음/.test(words(node))));
  assert.match(words(tree), new RegExp(`원문만\\s+${expected.length}\\s*명`));
  const cardList = nodes(tree, node => node.type === 'ul' && node.props['aria-label'] === '콘텐츠 멘토 목록')[0];
  assert.deepEqual(nodes(cardList, node => node.type === 'button').map(node => words(nodes(node, item => item.type === 'strong')[0])),
    listGuidancePeople({ domain: 'content' }).map(person => person.name), 'reviewed people keep their order ahead of originals');

  const hormozi = choices.find(node => /Alex Hormozi/.test(words(node)));
  hormozi.props.onClick();
  tree = app.render();
  const region = nodes(tree, node => node.props?.role === 'region' && node.props?.id === 'mentor-shelf-person-detail')[0];
  assert.match(region.props.className, /mentor-shelf__person-detail--source/);
  assert.match(words(region), /Alex Hormozi/);
  assert.match(words(region), /원문만 · 검수 카드 없음/);
  const [reader] = readerNodes(app, region);
  assert.equal(reader.props.personId, 'alex-hormozi');
  assert.equal(reader.props.card, undefined, 'no card is invented for a person without one');
  assert.equal(reader.props.autoFocus, false, 'selecting from the list keeps focus in the list');
  assert.equal(nodes(region, node => node.type === app.Button && /질문 쓰기/.test(words(node))).length, 0);
  assert.equal(nodes(tree, node => node.props?.className === 'mentor-shelf__person-detail').length, 0, 'no reviewed card detail beside it');
  assert.equal(asked.length, 0);
});

test('the shelf keeps the full original library out of its own bundle', () => {
  assert.match(source, /from '@com-moon\/guru-guidance\/source-people'/);
  assert.doesNotMatch(source, /@com-moon\/guru-guidance\/source-library/);
  assert.doesNotMatch(source, /source-library\.generated/);
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
