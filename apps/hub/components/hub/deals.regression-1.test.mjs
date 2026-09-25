import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { brandInWorkspace } from './workspace-map.js';
import { DEAL_STAGES, LOST_STAGE, dealStageLabel, isDealStalled } from '../../lib/deal-stages.js';
import { DEAL_VIEW_OPTIONS, DEFAULT_DEAL_VIEW, resolveDealView, timelineContext, formatCloseLabel, sameCloseDay } from '../../lib/deal-timeline.js';
import { monthKeyOf, normalizeTargetAmount, targetForMonth } from '../../lib/revenue-target.js';
import { planBaselineFor } from '../../lib/deal-payments.js';
import { buildMoneyModel } from '../../lib/deal-money.js';

// Regression: ISSUE-001 — column moves unmount the drag source before dragend.
// Found by /qa on 2026-09-21. Browser evidence: /tmp/moonlight-deals-qa/drag-result.png.
// Run the real Deals render and event handlers with isolated hooks and external services.
const source = readFileSync(new URL('./pages/revenue.jsx', import.meta.url), 'utf8');
const scopeStart = source.indexOf('function isClassInGuruRecord(');
assert.ok(scopeStart >= 0, 'ClassIn Guru scope guard must exist');
const scopeSource = source.slice(scopeStart, source.indexOf('// 사이드바 스코프는', scopeStart));
const isClassInGuruRecord = new Function('brandInWorkspace', `${scopeSource}; return isClassInGuruRecord;`)(brandInWorkspace);
const component = source.slice(source.indexOf('export function Deals('), source.indexOf('// Shared grid template for Cases'));
const javascript = ts.transpileModule(component.replace('export function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

// 2026-09-26: 거래 탭의 기본 보기는 "돈"(매출·현금흐름)이다. 아래 칸반 회귀들은
// 기존 보드를 그대로 겨냥하도록 `?view=stage`로 마운트한다.
function mount({ state = 'live', records = [], workspace, search = 'view=stage', save, selectedId = null } = {}) {
  const slots = [], timers = [], pending = new Map(), selections = [], replaced = [];
  let index = 0, tree, reloads = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(Boolean) } }),
    useState: initial => {
      const key = index++;
      if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }];
    },
    useRef: initial => { const key = index++; return slots[key] ??= { current: initial }; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {},
  };
  const dependencies = {
    React, setTimeout: fn => { timers.push(fn); }, clearTimeout: () => {},
    useToast: () => ({ success() {}, error() {}, info() {} }),
    useRevenueLedger: () => ({ ledger: { deals: records, stages: DEAL_STAGES }, syncState: state, reload: () => { reloads++; } }),
    useSearchParams: () => new URLSearchParams(search), useRouter: () => ({ replace: url => { replaced.push(url); } }), usePathname: () => '/dashboard/revenue/deals',
    useScopeFilter: () => React.useState('all'), getWorkspace: scope => scope ? { label: scope } : null,
    isClassInGuruRecord,
    filterDealsByWorkspace: ds => ds, useUndoableAction: () => ({ schedule: (key, fn) => pending.set(key, fn), cancel: key => pending.delete(key) }),
    useCrmSelection: items => { selections.push(items); return { selectedId, setSelectedId() {} }; }, useCrmKeyboard() {},
    STAGE_FILL: [], STAGE_LINE: [], LOST_STAGE, dealStageLabel, isDealStalled, SCOPE_OPTIONS: [], fmt: String,
    triggerCelebration() {}, saveRevenueRecord: save || (async () => ({ ok: true, status: 'saved' })),
    DEAL_VIEW_OPTIONS, DEFAULT_DEAL_VIEW, resolveDealView, timelineContext, formatCloseLabel, sameCloseDay,
    monthKeyOf, normalizeTargetAmount, targetForMonth,
    planBaselineFor, buildMoneyModel,
  };
  for (const name of ['Button', 'Kbd', 'TruthBadge', 'Checkbox', 'CheckboxRow', 'LifecycleBadge', 'SegmentedControl', 'ScrollShadowX', 'Card', 'EmptyState', 'LedgerReadError', 'Skeleton', 'IconButton', 'Badge', 'Iconed', 'EditDrawer', 'DealOutreachDrafter', 'DealTaskPanel', 'DealNextMeetingPanel', 'DealLinkedProjectsPanel', 'GoalLinks', 'FloatingMentorWidget', 'DealsMoney', 'MoneyHeader']) dependencies[name] = name;
  const Deals = new Function(...Object.keys(dependencies), `${javascript}; return Deals;`)(...Object.values(dependencies));
  function render() { index = 0; tree = Deals({ workspace }); return tree; }
  function findAll(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => findAll(predicate, child))];
  }
  render();
  return { render, findAll, pending, replaced, flush: () => { timers.splice(0).forEach(fn => fn()); }, reloads: () => reloads, lastSelection: () => selections[selections.length - 1] };
}

function deal() { return { id: 'stage-regression', stage: DEAL_STAGES[0].key, value: 0 }; }
const cardOf = app => app.findAll(n => n.props['data-deal-card'])[0];
const drawerOf = app => app.findAll(n => n.type === 'EditDrawer')[0];

test('drag contact → potential releases opacity and permits detail click without source dragend', () => {
  const app = mount({ records: [deal()] });
  for (const target of [1, 0, 1, 0]) {
    cardOf(app).props.onDragStart(); app.render();
    assert.equal(cardOf(app).props.style.opacity, 0.4);
    app.findAll(n => n.props.onDrop)[target].props.onDrop({ preventDefault() {} });
    app.flush(); app.render();
    assert.equal(cardOf(app).props.style.opacity, 1);
    cardOf(app).props.onClick(); app.render();
    assert.equal(drawerOf(app).props.record.stage, DEAL_STAGES[target].key);
    drawerOf(app).props.onClose(); app.render();
  }
  assert.equal(app.pending.size, 1, 'rapid moves retain only the latest deferred write');
});

test('same-column drop and cancelled drag both leave cards clickable', () => {
  const app = mount({ records: [deal()] });
  cardOf(app).props.onDragStart(); app.render();
  app.findAll(n => n.props.onDrop)[0].props.onDrop({ preventDefault() {} });
  app.flush(); app.render();
  assert.equal(cardOf(app).props.style.opacity, 1);
  assert.equal(app.pending.size, 0);
  cardOf(app).props.onDragStart(); app.render();
  cardOf(app).props.onDragEnd(); app.flush(); app.render();
  cardOf(app).props.onClick(); app.render();
  assert.equal(drawerOf(app).props.record.id, deal().id);
});

// Regression: ISSUE-002 — dismissing a new deal left a phantom card in the live board.
test('discard new deal removes its local row and preserves existing deals', () => {
  const app = mount({ records: [deal()] });
  app.findAll(n => n.type === 'Button' && n.props.icon === 'plus')[0].props.onClick(); app.render();
  assert.equal(app.findAll(n => n.props['data-deal-card']).length, 2);
  drawerOf(app).props.onClose(); app.render();
  assert.equal(app.findAll(n => n.props['data-deal-card']).length, 1);
  assert.equal(cardOf(app).props['data-deal-card'], deal().id);
  assert.equal(drawerOf(app).props.record, null);
});

// Regression: ISSUE-003 — unscoped read errors displayed a blank board without retry.
test('read failure exposes retry and blocks creation across all workspace scopes', () => {
  for (const workspace of [undefined, 'classin', 'brand']) {
    const app = mount({ state: 'error', workspace });
    const error = app.findAll(n => n.type === 'LedgerReadError');
    assert.equal(error.length, 1);
    error[0].props.onRetry(); assert.equal(app.reloads(), 1);
    assert.equal(app.findAll(n => n.type === 'ScrollShadowX').length, 0);
    const create = app.findAll(n => n.type === 'Button' && n.props.icon === 'plus')[0];
    assert.equal(create.props.disabled, true);
    create.props.onClick(); app.render();
    assert.equal(drawerOf(app).props.record, null);
  }
});

test('loading uses Skeleton and partial data retains the board with retry', () => {
  const loading = mount({ state: 'loading' });
  assert.equal(loading.findAll(n => n.type === 'Skeleton').length, 1);
  assert.equal(loading.findAll(n => n.type === 'EmptyState').length, 0);
  const partial = mount({ state: 'partial', records: [deal()] });
  assert.equal(partial.findAll(n => n.type === 'ScrollShadowX').length, 1);
  assert.equal(partial.findAll(n => n.type === 'Skeleton').length, 0);
  partial.findAll(n => n.type === 'Button' && n.props.children.includes('딜 기록 다시 확인'))[0].props.onClick();
  assert.equal(partial.reloads(), 1);
});

// Regression: the Lost column rendered from boardStages, but the j/k selection list still
// flattened DEAL_STAGES only — Lost cards could not be selected or opened with `e`.
test('Lost 토글을 켜면 Lost 카드도 키보드 선택 목록에 들어가고 종료 lifecycle로 표시된다', () => {
  const lost = { id: 'lost-deal', stage: 'lost', value: 0 };
  const app = mount({ records: [deal(), lost] });
  assert.ok(!app.lastSelection().some(d => d.id === lost.id), 'Lost 토글 전에는 선택 목록 밖');
  const toggle = app.findAll(n => n.type === 'CheckboxRow' && String(n.props.text).startsWith(LOST_STAGE.label))[0];
  assert.equal(toggle.props.text, `${LOST_STAGE.label} 1건 보기`);
  toggle.props.onChange(true); app.render();
  assert.ok(app.lastSelection().some(d => d.id === lost.id), 'Lost 컬럼 카드는 j/k 선택 대상');
  const badge = app.findAll(n => n.type === 'LifecycleBadge')[0];
  assert.equal(badge.props.state, 'cancelled');
});

test('숨긴 Lost 딜은 Lost 토글 건수에 세지 않는다 — 켜도 빈 컬럼이 붙지 않게', () => {
  const app = mount({ records: [deal(), { id: 'lost-hidden', stage: 'lost', value: 0, hidden: true }] });
  const lostToggle = app.findAll(n => n.type === 'CheckboxRow' && String(n.props.text).startsWith(LOST_STAGE.label));
  assert.equal(lostToggle.length, 0);
});

// ── 2026-09-26 거래 탭: 돈 · 단계 두 보기(목업 10) ─────────────────────────────
const todayIso = () => new Date().toISOString();
const text = node => (node && typeof node === 'object' ? (node.props?.children || []).map(text).join('') : String(node ?? ''));
const moneyOf = app => app.findAll(n => n.type === 'DealsMoney')[0];
const headerOf = app => app.findAll(n => n.type === 'MoneyHeader')[0];

test('기본 보기는 돈 — 칸반 대신 머리 카드와 들어올 돈을 그리고, 머리는 확정치(들어온 돈)만 숫자로 말한다', () => {
  const app = mount({ search: '', records: [
    { id: 'won', stage: 'closing', value: 1800000, closeAt: todayIso() },
    { id: 'quote', stage: 'quote', value: 2400000, closeAt: todayIso() },
  ] });
  assert.equal(app.findAll(n => n.type === 'ScrollShadowX').length, 0);
  assert.equal(app.findAll(n => n.type === 'CheckboxRow').length, 0);
  const money = moneyOf(app);
  assert.ok(money, '돈 보기 호스트');
  const header = headerOf(app);
  assert.equal(header.props.unknown, false);
  assert.equal(header.props.model, money.props.model, '머리와 목록은 같은 모델을 읽는다');
  assert.equal(header.props.model.header.paid, 0, '아직 입금 기록이 없으면 들어온 돈은 0');
  assert.equal(header.props.model.header.monthEndSure, 1800000);
  assert.equal(header.props.model.header.withMaybe, 4200000);
  assert.equal(app.findAll(n => n.type === 'h2').length, 0, '돈 보기의 제목(h2)은 머리 카드가 그린다');
  const actions = header.props.actions;
  assert.ok(findIn(actions, n => n.type === 'SegmentedControl' && n.props.label === '보기'));
  assert.equal(findIn(actions, n => n.type === 'Button' && n.props.icon === 'plus').props.variant, 'primary');
});

function findIn(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const c of node) { const f = findIn(c, predicate); if (f) return f; } return null; }
  if (predicate(node)) return node;
  return findIn(node.props?.children || [], predicate);
}

test('단계 보기는 제목(h2) 하나와 칸반 — 머리 카드·돈 목록은 그리지 않는다', () => {
  const app = mount({ search: 'view=stage', records: [deal()] });
  assert.equal(app.findAll(n => n.type === 'h2').length, 1);
  assert.equal(app.findAll(n => n.type === 'MoneyHeader' || n.type === 'DealsMoney').length, 0);
  assert.equal(app.findAll(n => n.type === 'ScrollShadowX').length, 1);
});

test('보기 전환은 돈 · 단계 둘 — ?view=로 남기고 돈으로 돌아오면 쿼리를 지운다', () => {
  const app = mount({ search: 'view=stage&scope=company' });
  const toggle = app.findAll(n => n.type === 'SegmentedControl' && n.props.label === '보기')[0];
  assert.deepEqual(toggle.props.options.map(o => o.label), ['돈', '단계']);
  assert.equal(toggle.props.value, 'stage');
  toggle.props.onChange('money');
  assert.deepEqual(app.replaced, ['/dashboard/revenue/deals?scope=company']);
  const fromMoney = mount({ search: 'scope=company' });
  findIn(headerOf(fromMoney).props.actions, n => n.type === 'SegmentedControl').props.onChange('stage');
  assert.deepEqual(fromMoney.replaced, ['/dashboard/revenue/deals?scope=company&view=stage']);
});

test('옛 보기 링크(언제 · 결제 · 지역)는 돈 보기로 떨어진다 — 지역 히트맵을 거래 탭에 끼워 그리지 않는다', () => {
  for (const legacy of ['time', 'payments', 'region']) {
    const app = mount({ search: `view=${legacy}`, records: [deal()] });
    assert.ok(moneyOf(app), legacy);
    assert.equal(app.findAll(n => n.type === 'ScrollShadowX').length, 0, legacy);
  }
  assert.doesNotMatch(component, /DealsRegionView|RevenueHeatmap/);
});

test('읽는 중·읽기 실패·미연결에는 머리에 ₩0을 사실처럼 쓰지 않는다(unknown), 읽기 실패는 다시 시도', () => {
  for (const state of ['loading', 'error', 'preview']) {
    const app = mount({ search: '', state, records: [] });
    assert.equal(headerOf(app).props.unknown, true, state);
  }
  assert.equal(mount({ search: '', state: 'loading' }).findAll(n => n.type === 'Skeleton').length, 1);
  assert.equal(mount({ search: '', state: 'error' }).findAll(n => n.type === 'LedgerReadError').length, 1);
  assert.equal(mount({ search: '', state: 'error' }).findAll(n => n.type === 'DealsMoney').length, 0);
});

test('classin 워크스페이스도 같은 돈 · 단계 보기', () => {
  const app = mount({ search: '', workspace: 'classin', records: [deal()] });
  assert.ok(moneyOf(app));
  const stage = mount({ search: 'view=stage', workspace: 'classin', records: [deal()] });
  assert.equal(stage.findAll(n => n.type === 'ScrollShadowX').length, 1);
});

test('독의 예상일 변경: 낙관 반영 → 되돌리기 창 뒤 저장, 실패하면 원래 날짜로', async () => {
  const saved = [];
  let result = { ok: false, status: 'failed' };
  const app = mount({ search: '', records: [{ id: 'd1', stage: 'quote', value: 10, closeAt: '' }], save: async (kind, op, body) => { saved.push([kind, op, body]); return result; } });
  moneyOf(app).props.onMoveDate('d1', '2026-10-15T03:00:00.000Z', '예상일 → 10/15 목');
  app.render();
  assert.equal(moneyOf(app).props.deals[0].closeAt, '2026-10-15T03:00:00.000Z');
  assert.equal(saved.length, 0, '창이 닫히기 전에는 쓰지 않는다');
  assert.equal(app.pending.size, 1);
  [...app.pending.values()][0]();
  await new Promise(resolve => setImmediate(resolve));
  app.render();
  assert.deepEqual(saved[0], ['deal', 'update', { id: 'd1', closeAt: '2026-10-15T03:00:00.000Z' }]);
  assert.equal(moneyOf(app).props.deals[0].closeAt, '', '실패하면 원래 날짜(미정)로 롤백');
  result = { ok: true, status: 'saved' };
});

test('매달 정기 저장: 낙관 반영 → 되돌리기 창 뒤 meta.recurring 쓰기, 실패하면 원래 계획으로', async () => {
  const saved = [];
  const plan = { amount: 600000, day: 3, startMonth: '2026-10', endMonth: null };
  const app = mount({ search: '', records: [{ id: 'd1', stage: 'closing', value: 600000 }], save: async (kind, op, body) => { saved.push(body); return { ok: false, status: 'preview' }; } });
  moneyOf(app).props.onUpdateRecurring('d1', plan, '정기');
  app.render();
  assert.deepEqual(moneyOf(app).props.deals[0].recurring, plan);
  assert.equal(saved.length, 0);
  [...app.pending.values()][0]();
  await new Promise(resolve => setImmediate(resolve));
  app.render();
  assert.deepEqual(saved[0], { id: 'd1', recurring: plan });
  assert.equal(moneyOf(app).props.deals[0].recurring, null, 'preview는 저장되지 않았다 — 되돌린다');
});

test('독이 열리면 머리의 생성 버튼은 secondary로 내려 한 화면 한 primary를 지킨다', () => {
  const records = [{ id: 'd1', stage: 'quote', value: 10, closeAt: todayIso() }];
  const createOf = app => findIn(headerOf(app).props.actions, n => n.type === 'Button' && n.props.icon === 'plus');
  const closed = mount({ search: '', records });
  assert.equal(createOf(closed).props.variant, 'primary');
  const open = mount({ search: '', records, selectedId: 'd1' });
  assert.equal(createOf(open).props.variant, 'secondary');
  assert.equal(moneyOf(open).props.selectedId, 'd1');
  assert.deepEqual(open.lastSelection(), [{ id: 'd1' }], 'j/k는 들어올 돈 목록의 거래 순서');
});

test('칸반의 반론 점검은 10px 인라인 버튼이 아니라 Button 프리미티브다', () => {
  assert.doesNotMatch(component, /fontSize: 10,/);
  assert.match(component, /isClassInGuruRecord\(d\) && \([\s\S]*?<Button variant="outline" size="xs" icon="sparkle" onClick=\{\(e\) => \{ e\.stopPropagation\(\); openGuruForDeal\(d\); \}\}>/);
});

test('Guru opens only for a verified ClassIn deal; personal and conflicting deals retain a separate contact draft', () => {
  const base = { id: 'guru-scope', stage: 'contact', value: 100000, age: 20, name: '확인 거래' };
  const rejected = [
    { ...base, type: 'personal', workspace: 'brand', brand: 'sinabro' },
    { ...base, type: 'personal', workspace: 'classin' },
    { ...base, type: 'company', brand: 'sinabro' },
    { ...base, type: 'company', workspace: 'personal' },
  ];
  for (const record of rejected) {
    const app = mount({ records: [record] });
    assert.equal(app.findAll(n => n.type === 'IconButton' && n.props.tooltip === 'Guru에게 진단 요청').length, 0, JSON.stringify(record));
    assert.equal(app.findAll(n => n.type === 'Button' && n.props.children.includes('반론 점검')).length, 0, JSON.stringify(record));
    cardOf(app).props.onClick(); app.render();
    assert.equal(app.findAll(n => n.type === 'Button' && n.props.children.includes('1:1 코칭 열기')).length, 0, JSON.stringify(record));
    assert.equal(app.findAll(n => n.type === 'DealOutreachDrafter').length, 1, 'contact draft remains available');
    assert.equal(app.findAll(n => n.type === 'span' && n.props.children.includes('Guru 세일즈 코칭 & 다음 수')).length, 0);
    assert.equal(app.findAll(n => n.type === 'FloatingMentorWidget')[0].props.isOpen, false);
  }
  for (const record of [
    { ...base, type: 'company', workspace: 'classin' },
    { ...base, type: 'company', brand: 'classmoon' },
    { ...base, type: 'company' },
  ]) {
    const app = mount({ records: [record] });
    const trigger = app.findAll(n => n.type === 'IconButton' && n.props.tooltip === 'Guru에게 진단 요청')[0];
    assert.ok(trigger, JSON.stringify(record));
    trigger.props.onClick({ stopPropagation() {} }); app.render();
    assert.equal(app.findAll(n => n.type === 'FloatingMentorWidget')[0].props.isOpen, true);
  }
});

test('account detail does not open a deal review using an ambiguous account name', () => {
  const detailSource = source.slice(source.indexOf('function DetailPanel('), source.indexOf('export function Accounts('));
  const detailJs = ts.transpileModule(detailSource, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(Boolean) } }),
    useState: initial => [initial, () => {}],
  };
  const deps = { React, fmt: String };
  for (const name of ['Avatar', 'Badge', 'Iconed', 'IconButton', 'Button', 'HealthDot', 'QuickActions', 'Tabs', 'GoalLinks', 'LogComposer']) deps[name] = name;
  const DetailPanel = new Function(...Object.keys(deps), `${detailJs}; return DetailPanel;`)(...Object.values(deps));
  const findAll = (node, predicate) => {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => findAll(child, predicate))];
  };
  const detail = { activity: [], contacts: [], deals: [], notes: [] };
  const props = { detail, onLog() {}, onDeleteActivity() {}, onPinNote() {}, onAddNote() {}, onNavigate() {} };
  const accounts = [
    { name: '개인', type: 'personal', workspace: 'brand', brand: 'sinabro' },
    { name: '충돌', type: 'company', brand: 'sinabro' },
    { name: '미상', type: 'company' },
    { name: '회사', type: 'company', workspace: 'classin' },
  ];
  for (const account of accounts) {
    const tree = DetailPanel({ ...props, account });
    const ask = findAll(tree, n => n.type === 'Button' && n.props.children.includes('Ask Guru'));
    assert.equal(ask.length, 0, account.name);
  }
});

test('예상일을 처음 옮기면 옮기기 전 계획을 plan_baseline으로 한 번만 싣는다 — 창 안 연속 이동도 원래 값', async () => {
  const saved = [];
  const original = '2026-09-15T03:00:00.000Z';
  const app = mount({ search: '', records: [{ id: 'd1', stage: 'quote', value: 1800000, closeAt: original }], save: async (kind, op, body) => { saved.push(body); return { ok: true, status: 'saved' }; } });
  const host = () => moneyOf(app);
  host().props.onMoveDate('d1', '2026-10-02T03:00:00.000Z', 'a');
  app.render();
  host().props.onMoveDate('d1', '2026-10-15T03:00:00.000Z', 'b');
  app.render();
  assert.equal(app.pending.size, 1);
  [...app.pending.values()][0]();
  await new Promise(resolve => setImmediate(resolve));
  app.render();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].closeAt, '2026-10-15T03:00:00.000Z');
  assert.equal(saved[0].planBaseline.amount, 1800000);
  assert.equal(saved[0].planBaseline.closeAt, original, '중간값(10/2)이 아니라 창이 열리기 전 날짜');
  assert.equal(host().props.deals[0].planBaseline.closeAt, original, '화면도 곧바로 기준선을 안다');
  // 두 번째 이동부터는 싣지 않는다
  app.pending.clear();
  host().props.onMoveDate('d1', '2026-11-02T03:00:00.000Z', 'c');
  [...app.pending.values()][0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.length, 2);
  assert.equal('planBaseline' in saved[1], false);
});

test('편집 드로어로 금액을 바꾸면 바꾸기 전 계획을 한 번 싣고, 이미 있으면 새로 만들지 않는다', async () => {
  const saved = [];
  const save = async (kind, op, body) => { saved.push(body); return { ok: true, status: 'saved' }; };
  const original = { id: 'd1', stage: DEAL_STAGES[0].key, value: 1000000, closeAt: '2026-09-15T03:00:00.000Z' };
  const app = mount({ records: [original], save });
  cardOf(app).props.onClick(); app.render();
  drawerOf(app).props.onChange('value', '1200000'); app.render();
  await drawerOf(app).props.onSave();
  assert.equal(saved[0].value, '1200000');
  assert.equal(saved[0].planBaseline.amount, 1000000);
  assert.equal(saved[0].planBaseline.closeAt, '2026-09-15T03:00:00.000Z');

  const kept = { amount: 900000, closeAt: '2026-09-10T03:00:00.000Z' };
  const second = mount({ records: [{ ...original, planBaseline: kept }], save });
  cardOf(second).props.onClick(); second.render();
  drawerOf(second).props.onChange('value', '1500000'); second.render();
  await drawerOf(second).props.onSave();
  assert.deepEqual(saved[1].planBaseline, kept, '기존 기준선을 그대로 — 새 값을 만들지 않는다');
});
