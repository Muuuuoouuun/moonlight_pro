import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function declaration(file, name) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, name);
  return ts.transpileModule(node.getText(ast).replace(/^export /, ''), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const disclosureCode = declaration('./daily-brief.jsx', 'MoreDetail');
const dispatchCode = declaration('./daily-brief.jsx', 'DailyDispatchCard');
const homeCode = declaration('./home-morning-brief.jsx', 'HomeMorningBrief');
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null ? '' : String(node);
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(child => find(child, predicate)) : node && typeof node === 'object'
  ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)] : [];
function hooks() {
  const slots = []; let index = 0, effects = [], changed = false;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) { const key = index++; if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], value => { const next = typeof value === 'function' ? value(slots[key]) : value; changed ||= !Object.is(slots[key], next); slots[key] = next; }]; },
    useRef(initial) { return slots[index++] ??= { current: initial }; },
    useEffect(effect, deps) { const key = index++, prior = slots[key];
      if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) effects.push(() => { prior?.cleanup?.(); slots[key] = { deps, cleanup: effect() }; }); },
  };
  return { React, render(callback) { let tree; for (let pass = 0; pass < 8; pass++) { index = 0; changed = false; effects = []; tree = callback(); effects.forEach(effect => effect()); if (!changed) return tree; } throw Error('effects did not settle'); } };
}
function mountedDisclosure(query = '') {
  const runtime = hooks(), frames = [], scrolled = [], focused = [];
  let params = new URLSearchParams(query), tree;
  const deps = { React: runtime.React, Iconed: 'Iconed', useSearchParams: () => params,
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }, cancelAnimationFrame: id => { frames[id - 1] = null; },
    document: { getElementById: id => ({ scrollIntoView: options => scrolled.push({ id, options }), focus: options => focused.push({ id, options }) }) } };
  const MoreDetail = new Function(...Object.keys(deps), `${disclosureCode}; return MoreDetail;`)(...Object.values(deps));
  const render = () => tree = runtime.render(() => MoreDetail({ title: '더보기', summary: '기존 보조 정보', revealPanel: 'briefing', children: '기존 AI 카드' }));
  render();
  return { render, scrolled, focused, tree: () => tree, route(value) { params = new URLSearchParams(value); render(); },
    toggle() { find(tree, node => node.type === 'button')[0].props.onClick(); render(); },
    flush() { for (const frame of frames.splice(0)) frame?.(); },
    expanded: () => find(tree, node => node.type === 'button')[0].props['aria-expanded'] };
}

test('Home AI briefing button opens its explicit panel while the ordinary Today link stays unchanged', () => {
  const navigation = [], runtime = hooks();
  const deps = { React: runtime.React, Button: 'Button', Skeleton: 'Skeleton', TruthBadge: 'TruthBadge', buildHomeMorningBrief: () => ({ state: 'live', progress: '확인된 할 일' }) };
  const HomeMorningBrief = new Function(...Object.keys(deps), `${homeCode}; return HomeMorningBrief;`)(...Object.values(deps));
  const tree = runtime.render(() => HomeMorningBrief({ onNavigate: target => navigation.push(target) }));
  find(tree, node => node.type === 'Button' && text(node) === '오늘 열기')[0].props.onClick();
  // The optional AI entry now lives in Home's supporting disclosure. Execute
  // its actual callback so moving the entry cannot silently break the link.
  const source = readFileSync(new URL('./home.jsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('home.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let callback;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'Button'
      && node.children.some(child => ts.isJsxText(child) && child.text.trim() === '30초 AI 브리핑 열기')) {
      callback = node.openingElement.attributes.properties.find(attr => attr.name?.text === 'onClick')?.initializer?.expression;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(callback, 'Home keeps the explicit AI entry');
  const openBriefing = new Function('navigateFromHome', `return ${callback.getText(ast)};`)(target => navigation.push(target));
  openBriefing();
  assert.deepEqual(navigation, ['dashboard/daily-brief', 'dashboard/daily-brief?panel=briefing']);
  const disclosure = mountedDisclosure(new URL(navigation[1], 'http://local.test').search);
  assert.equal(disclosure.expanded(), true); disclosure.flush();
  assert.equal(disclosure.scrolled.at(-1).id, 'daily-brief-briefing');
  assert.deepEqual(disclosure.focused.at(-1), { id: 'daily-brief-briefing', options: { preventScroll: true } });
});

test('plain or unrelated Today visits keep the existing disclosure closed and unmounted', () => {
  for (const query of ['', 'panel=unknown']) {
    const disclosure = mountedDisclosure(query); disclosure.flush();
    assert.equal(disclosure.expanded(), false); assert.equal(text(disclosure.tree()).includes('기존 AI 카드'), false);
    assert.deepEqual(disclosure.scrolled, []); assert.deepEqual(disclosure.focused, []);
  }
});

test('a query-only briefing request opens once and still allows manual collapse and reopening', () => {
  const disclosure = mountedDisclosure(); disclosure.route('panel=briefing');
  assert.equal(disclosure.expanded(), true); disclosure.toggle();
  assert.equal(disclosure.expanded(), false); disclosure.render(); assert.equal(disclosure.expanded(), false);
  disclosure.toggle(); assert.equal(disclosure.expanded(), true);
});

test('revealing the real AI card never calls a model until Generate is clicked', async () => {
  const runtime = hooks(), requests = [];
  const live = { state: 'live' };
  const deps = { React: runtime.React, Card: 'Card', Iconed: 'Iconed', Badge: 'Badge', TruthBadge: 'TruthBadge', Button: 'Button',
    buildDailyDispatchContext: () => ({ isEvening: false, urgentKa: live, focusCustomers: live, todayAgenda: live, tasks: live }),
    requestPersonaChat: async request => { requests.push(request); return { state: 'preview', note: '격리된 검수' }; } };
  const DailyDispatchCard = new Function(...Object.keys(deps), `${dispatchCode}; return DailyDispatchCard;`)(...Object.values(deps));
  const tree = runtime.render(() => DailyDispatchCard({ sourceState: 'live' }));
  assert.equal(tree.props.id, 'daily-brief-briefing'); assert.equal(tree.props.tabIndex, -1); assert.deepEqual(requests, []);
  await find(tree, node => node.type === 'Button' && text(node) === '30초 브리핑 받기')[0].props.onClick();
  assert.equal(requests.length, 1); assert.equal(requests[0].mode, 'daily-dispatch');
});
