import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { DEAL_STAGES, LOST_STAGE, dealStageLabel, isDealStalled } from '../../lib/deal-stages.js';

// Regression: ISSUE-001 — column moves unmount the drag source before dragend.
// Found by /qa on 2026-09-21. Browser evidence: /tmp/moonlight-deals-qa/drag-result.png.
// Run the real Deals render and event handlers with isolated hooks and external services.
const source = readFileSync(new URL('./pages/revenue.jsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('export function Deals('), source.indexOf('// Shared grid template for Cases'));
const javascript = ts.transpileModule(component.replace('export function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount({ state = 'live', records = [], workspace } = {}) {
  const slots = [], timers = [], pending = new Map(), selections = [];
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
    useSearchParams: () => new URLSearchParams(), useRouter: () => ({}), usePathname: () => '/dashboard/revenue/deals',
    useScopeFilter: () => React.useState('all'), getWorkspace: scope => scope ? { label: scope } : null,
    filterDealsByWorkspace: ds => ds, useUndoableAction: () => ({ schedule: (key, fn) => pending.set(key, fn), cancel: key => pending.delete(key) }),
    useCrmSelection: items => { selections.push(items); return { selectedId: null }; }, useCrmKeyboard() {},
    STAGE_FILL: [], STAGE_LINE: [], LOST_STAGE, dealStageLabel, isDealStalled, SCOPE_OPTIONS: [], fmt: String,
    triggerCelebration() {}, saveRevenueRecord: async () => ({ ok: true, status: 'saved' }),
  };
  for (const name of ['Button', 'Kbd', 'SyncBadge', 'Checkbox', 'CheckboxRow', 'LifecycleBadge', 'SegmentedControl', 'ScrollShadowX', 'Card', 'EmptyState', 'LedgerReadError', 'Skeleton', 'IconButton', 'Badge', 'Iconed', 'EditDrawer', 'DealOutreachDrafter', 'DealTaskPanel', 'DealNextMeetingPanel', 'DealLinkedProjectsPanel', 'GoalLinks', 'FloatingMentorWidget']) dependencies[name] = name;
  const Deals = new Function(...Object.keys(dependencies), `${javascript}; return Deals;`)(...Object.values(dependencies));
  function render() { index = 0; tree = Deals({ workspace }); return tree; }
  function findAll(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => findAll(predicate, child))];
  }
  render();
  return { render, findAll, pending, flush: () => { timers.splice(0).forEach(fn => fn()); }, reloads: () => reloads, lastSelection: () => selections[selections.length - 1] };
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
  partial.findAll(n => n.type === 'Button' && n.props.children.includes('딜 원장 다시 확인'))[0].props.onClick();
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
