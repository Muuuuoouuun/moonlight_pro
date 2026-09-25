import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { DEAL_STAGES, LOST_STAGE, dealStageLabel, isDealStalled } from '../../lib/deal-stages.js';
import { DEAL_VIEW_OPTIONS, resolveDealView, buildDealTimeline, formatCloseLabel, sameCloseDay } from '../../lib/deal-timeline.js';
import { monthKeyOf, normalizeTargetAmount, targetForMonth, targetProgress } from '../../lib/revenue-target.js';

// Regression: ISSUE-001 — column moves unmount the drag source before dragend.
// Found by /qa on 2026-09-21. Browser evidence: /tmp/moonlight-deals-qa/drag-result.png.
// Run the real Deals render and event handlers with isolated hooks and external services.
const source = readFileSync(new URL('./pages/revenue.jsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('export function Deals('), source.indexOf('// Shared grid template for Cases'));
const javascript = ts.transpileModule(component.replace('export function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

// 2026-09-24: 거래 탭의 기본 보기가 "언제"(예상일 칸)로 바뀌었다. 아래 칸반 회귀들은
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
    filterDealsByWorkspace: ds => ds, useUndoableAction: () => ({ schedule: (key, fn) => pending.set(key, fn), cancel: key => pending.delete(key) }),
    useCrmSelection: items => { selections.push(items); return { selectedId, setSelectedId() {} }; }, useCrmKeyboard() {},
    STAGE_FILL: [], STAGE_LINE: [], LOST_STAGE, dealStageLabel, isDealStalled, SCOPE_OPTIONS: [], fmt: String,
    triggerCelebration() {}, saveRevenueRecord: save || (async () => ({ ok: true, status: 'saved' })),
    DEAL_VIEW_OPTIONS, resolveDealView, buildDealTimeline, formatCloseLabel, sameCloseDay,
    monthKeyOf, normalizeTargetAmount, targetForMonth, targetProgress,
  };
  for (const name of ['Button', 'Kbd', 'SyncBadge', 'Checkbox', 'CheckboxRow', 'LifecycleBadge', 'SegmentedControl', 'ScrollShadowX', 'Card', 'EmptyState', 'LedgerReadError', 'Skeleton', 'IconButton', 'Badge', 'Iconed', 'EditDrawer', 'DealOutreachDrafter', 'DealTaskPanel', 'DealNextMeetingPanel', 'DealLinkedProjectsPanel', 'GoalLinks', 'FloatingMentorWidget', 'DealsTimeline', 'DealsRegionView', 'RevenueTargetControl']) dependencies[name] = name;
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

// ── 2026-09-24 거래 탭 재설계: 기본 보기 "언제"(목업 3) ─────────────────────────────
const todayIso = () => new Date().toISOString();
const text = node => (node && typeof node === 'object' ? (node.props?.children || []).map(text).join('') : String(node ?? ''));

test('기본 보기는 언제 — 칸반 대신 시간 칸을 그리고 제목은 이번 달 들어온 돈(확정치)만 말한다', () => {
  const app = mount({ search: '', records: [
    { id: 'won', stage: 'closing', value: 1800000, closeAt: todayIso() },
    { id: 'quote', stage: 'quote', value: 2400000, closeAt: todayIso() },
    { id: 'contact', stage: 'contact', value: 1200000, closeAt: todayIso() },
  ] });
  assert.equal(app.findAll(n => n.type === 'ScrollShadowX').length, 0);
  assert.equal(app.findAll(n => n.type === 'CheckboxRow').length, 0);
  const timeline = app.findAll(n => n.type === 'DealsTimeline');
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].props.timeline.count, 3);
  const title = app.findAll(n => n.type === 'h2')[0];
  // 결제 기록이 없으면 입금됨은 0 — 사실 그대로. 예상(확정·가능성·확인 필요 합)은 부제로.
  assert.equal(text(title), '이번 달 들어온 돈 0', '아직 입금 기록이 없으면 확정치(들어온 돈)는 0');
  assert.match(text(app.findAll(n => n.type === 'p' && n.props.className === 'fx-page-sub')[0]), /들어올 예정 5400000/);
  assert.equal(app.findAll(n => n.type === 'h2').length, 1, '페이지 제목은 하나');
});

test('보기 전환은 ?view=로 남기고 기본 보기로 돌아오면 쿼리를 지운다', () => {
  const app = mount({ search: 'view=stage&scope=company' });
  const toggle = app.findAll(n => n.type === 'SegmentedControl' && n.props.label === '보기')[0];
  assert.deepEqual(toggle.props.options.map(o => o.label), ['언제', '단계', '지역']);
  assert.equal(toggle.props.value, 'stage');
  toggle.props.onChange('region');
  toggle.props.onChange('time');
  assert.deepEqual(app.replaced, ['/dashboard/revenue/deals?view=region&scope=company', '/dashboard/revenue/deals?scope=company']);
});

test('지역 보기는 히트맵에 읽기 상태를 맡긴다 — 거래 쪽 스켈레톤·오류를 겹쳐 그리지 않는다', () => {
  for (const state of ['loading', 'error', 'live']) {
    const app = mount({ search: 'view=region', state });
    assert.equal(app.findAll(n => n.type === 'DealsRegionView').length, 1);
    assert.equal(app.findAll(n => n.type === 'Skeleton' || n.type === 'LedgerReadError').length, 0, state);
  }
});

test('칸 이동 = 예상일 변경: 낙관 반영 → 되돌리기 창 뒤 저장, 실패하면 원래 날짜로', async () => {
  const saved = [];
  let result = { ok: false, status: 'failed' };
  const app = mount({ search: '', records: [{ id: 'd1', stage: 'quote', value: 10, closeAt: '' }], save: async (kind, op, body) => { saved.push([kind, op, body]); return result; } });
  const timelineOf = () => app.findAll(n => n.type === 'DealsTimeline')[0];
  timelineOf().props.onMoveDate('d1', '2026-10-15T03:00:00.000Z', '예상일 → 10/15 목');
  app.render();
  assert.equal(timelineOf().props.timeline.ordered[0].deal.closeAt, '2026-10-15T03:00:00.000Z');
  assert.equal(saved.length, 0, '창이 닫히기 전에는 쓰지 않는다');
  assert.equal(app.pending.size, 1);
  [...app.pending.values()][0]();
  await new Promise(resolve => setImmediate(resolve));
  app.render();
  assert.deepEqual(saved[0], ['deal', 'update', { id: 'd1', closeAt: '2026-10-15T03:00:00.000Z' }]);
  assert.equal(timelineOf().props.timeline.ordered[0].deal.closeAt, '', '실패하면 원래 날짜(미정)로 롤백');
  result = { ok: true, status: 'saved' };
});

test('독이 열리면 머리의 생성 버튼은 secondary로 내려 한 화면 한 primary를 지킨다', () => {
  const records = [{ id: 'd1', stage: 'quote', value: 10, closeAt: todayIso() }];
  const closed = mount({ search: '', records });
  assert.equal(closed.findAll(n => n.type === 'Button' && n.props.icon === 'plus')[0].props.variant, 'primary');
  const open = mount({ search: '', records, selectedId: 'd1' });
  assert.equal(open.findAll(n => n.type === 'Button' && n.props.icon === 'plus')[0].props.variant, 'secondary');
  assert.equal(open.findAll(n => n.type === 'DealsTimeline')[0].props.selectedId, 'd1');
});

test('칸반의 반론 점검은 10px 인라인 버튼이 아니라 Button 프리미티브다', () => {
  assert.doesNotMatch(component, /fontSize: 10,/);
  assert.match(component, /<Button variant="outline" size="xs" icon="sparkle" onClick=\{\(e\) => \{ e\.stopPropagation\(\); setGuruDeal\(d\); \}\}>/);
});
