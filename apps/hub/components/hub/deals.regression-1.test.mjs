import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { DEAL_STAGES } from '../../lib/deal-stages.js';

// Regression: ISSUE-001 — column moves unmount the drag source before dragend.
// Found by /qa on 2026-09-21. Browser evidence: /tmp/moonlight-deals-qa/drag-result.png.
// Run the real Deals render and event handlers with isolated hooks and external services.
const source = readFileSync(new URL('./pages/revenue.jsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('export function Deals('), source.indexOf('// Shared grid template for Cases'));
const javascript = ts.transpileModule(component.replace('export function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount({ state = 'live', records = [], workspace } = {}) {
  const slots = [], timers = [], pending = new Map();
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
    useCrmSelection: () => ({ selectedId: null }), useCrmKeyboard() {},
    STAGE_FILL: [], STAGE_LINE: [], STALLED_DAYS: 14, SCOPE_OPTIONS: [], fmt: String,
    triggerCelebration() {}, saveRevenueRecord: async () => ({ ok: true, status: 'saved' }),
  };
  for (const name of ['Button', 'Kbd', 'SyncBadge', 'Checkbox', 'SegmentedControl', 'ScrollShadowX', 'Card', 'EmptyState', 'LedgerReadError', 'Skeleton', 'IconButton', 'Badge', 'Iconed', 'EditDrawer', 'DealOutreachDrafter', 'DealTaskPanel', 'DealNextMeetingPanel', 'DealLinkedProjectsPanel', 'GoalLinks', 'FloatingMentorWidget']) dependencies[name] = name;
  const Deals = new Function(...Object.keys(dependencies), `${javascript}; return Deals;`)(...Object.values(dependencies));
  function render() { index = 0; tree = Deals({ workspace }); return tree; }
  function findAll(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => findAll(predicate, child))];
  }
  render();
  return { render, findAll, pending, flush: () => { timers.splice(0).forEach(fn => fn()); }, reloads: () => reloads };
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
