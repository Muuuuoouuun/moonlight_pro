import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { brandInWorkspace } from '../workspace-map.js';
import { REACTION_LABEL } from '../../../lib/sales-os/followup-scoring.js';

// 2026-09-25: 첫 화면 긴급 KA·집중 고객의 ✦ Guru는 개인·회사를 가리지 않고 열렸고, 레코드
// id 없이 고객 이름을 위젯에 넘겨 Guru가 이름 일부로 다른 고객의 거래를 붙일 수 있었다.
// 실제 FocusSlots 본문을 격리된 훅으로 그린다(deals.regression-1과 같은 방식).
const source = readFileSync(new URL('./daily-brief.jsx', import.meta.url), 'utf8');
const start = source.indexOf('// §2 확정 슬롯');
const end = source.indexOf('// 60초 시계를 페이지 루트에서 분리', start);
assert.ok(start >= 0 && end > start, 'FocusSlots section must stay findable');
const sectionJs = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount(dailyFocus) {
  const slots = [];
  let index = 0;
  let tree;
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children: children.flat(Infinity).filter((child) => child != null && child !== false && child !== '') },
    }),
    useState: (initial) => {
      const key = index++;
      if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], (value) => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }];
    },
  };
  const deps = { React, brandInWorkspace, FOCUS_REACTION_LABEL: REACTION_LABEL };
  for (const name of ['Card', 'Iconed', 'Badge', 'IconButton', 'Button', 'SyncBadge', 'TruthBadge', 'CertaintyBadge', 'CalendarOutcome', 'FloatingMentorWidget']) {
    deps[name] = name;
  }
  const FocusSlots = new Function(...Object.keys(deps), `${sectionJs}; return FocusSlots;`)(...Object.values(deps));
  const render = () => { index = 0; tree = FocusSlots({ dailyFocus, onNavigate() {}, onRecord() {} }); return tree; };
  const findAll = (predicate, node = tree) => {
    if (Array.isArray(node)) return node.flatMap((child) => findAll(predicate, child));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...findAll(predicate, node.props?.children || [])];
  };
  const text = (node) => {
    if (Array.isArray(node)) return node.map(text).join('');
    if (node == null || typeof node !== 'object') return node == null ? '' : String(node);
    return text(node.props?.children || []);
  };
  render();
  return { render, findAll, text };
}

const guruButtons = (app, node) => app.findAll((n) => n.type === 'IconButton' && n.props.label === 'Guru 세일즈 코칭', node);
const widget = (app) => app.findAll((n) => n.type === 'FloatingMentorWidget')[0];
const focusRow = (app, id) => app.findAll((n) => n.props?.className === 'hub-row daily-brief__customer-row' && n.props.key === id)[0];
const kaRow = (app) => app.findAll((n) => n.props?.className === 'hub-row daily-brief__customer-row' && n.props.key === undefined)[0];

const customer = (id, tags) => ({
  id,
  name: `공통 이름 학원 ${id}`,
  company: '공통 이름 학원',
  nextAction: '견적 확인',
  reason: '다음 행동 기한 도래',
  dueLabel: '오늘까지',
  lastTouch: '1일 전',
  href: `dashboard/revenue/customers?customer=lead%3A${id}`,
  ...tags,
});

const focusOf = (items, ka = null) => ({
  urgentKa: { state: 'live', item: ka },
  focusCustomers: { state: 'live', items },
  todayAgenda: { state: 'preview', items: [] },
});

test('focus customers offer ✦ Guru only when the record itself is confirmed ClassIn', () => {
  const items = [
    customer('classin', { type: 'company', workspace: 'classin', brand: null }),
    customer('legacy-company', { type: 'company', workspace: null, brand: null }),
    customer('classin-brand', { type: 'company', workspace: null, brand: 'classmoon' }),
    customer('personal', { type: 'personal', workspace: 'brand', brand: 'sinabro' }),
    customer('personal-in-classin', { type: 'personal', workspace: 'classin', brand: null }),
    customer('company-personal-brand', { type: 'company', workspace: null, brand: 'sinabro' }),
    customer('company-brand-workspace', { type: 'company', workspace: 'brand', brand: null }),
    customer('untagged', {}),
  ];
  const app = mount(focusOf(items));
  const more = app.findAll((n) => n.type === 'Button' && /더 보기/.test(app.text(n)))[0];
  more.props.onClick();
  app.render();

  const offered = items.map((item) => item.id).filter((id) => guruButtons(app, focusRow(app, id)).length > 0);
  assert.deepEqual(offered, ['classin', 'legacy-company', 'classin-brand']);
  // 기록 남기기는 소속과 무관하게 그대로다 — Guru만 닫는다.
  for (const item of items) {
    assert.equal(app.findAll((n) => n.type === 'IconButton' && n.props.label === '연락 기록 남기기', focusRow(app, item.id)).length, 1, item.id);
  }
  assert.equal(widget(app).props.isOpen, false);
});

test('✦ Guru hands the widget the exact lead id, never a display name that other customers share', () => {
  const app = mount(focusOf([customer('lead-7', { type: 'company', workspace: 'classin', brand: null })]));
  guruButtons(app, focusRow(app, 'lead-7'))[0].props.onClick({ stopPropagation() {} });
  app.render();

  const mentor = widget(app);
  assert.equal(mentor.props.isOpen, true);
  assert.equal(mentor.props.agent, 'guru');
  assert.equal(mentor.props.contextData.id, 'lead-7');
  assert.equal(mentor.props.contextData.kind, 'lead');
  // 리드에는 정확한 거래 id가 없다 — 위젯이 '거래 기록 연결 안 됨'을 말하고 거래를 추정하지 않는다.
  assert.equal(mentor.props.contextData.dealId, null);
  assert.equal(mentor.props.contextData.name, '공통 이름 학원 lead-7');
});

test('the urgent KA ✦ uses the exact deal id and closes for personal or id-less records', () => {
  const kaDeal = {
    kind: 'deal', id: 'deal-ka', name: 'KA 연간계약', company: 'KA학원', nextAction: '정체 딜 재가동',
    reason: '12일째 활동 없음', href: 'dashboard/revenue/deals?deal=deal-ka', type: 'company', workspace: 'classin', brand: null,
  };
  const app = mount(focusOf([], kaDeal));
  guruButtons(app, kaRow(app))[0].props.onClick({ stopPropagation() {} });
  app.render();
  const mentor = widget(app);
  assert.equal(mentor.props.isOpen, true);
  assert.equal(mentor.props.contextData.id, 'deal-ka');
  assert.equal(mentor.props.contextData.kind, 'deal');
  assert.equal(mentor.props.contextData.dealId, 'deal-ka');

  for (const ka of [
    { ...kaDeal, kind: 'lead', id: 'ka-personal', type: 'personal', workspace: 'brand' },
    { ...kaDeal, id: undefined },
    { ...kaDeal, type: undefined, workspace: undefined },
  ]) {
    const closed = mount(focusOf([], ka));
    assert.equal(guruButtons(closed, kaRow(closed)).length, 0, JSON.stringify(ka));
    assert.equal(widget(closed).props.isOpen, false);
  }
});
