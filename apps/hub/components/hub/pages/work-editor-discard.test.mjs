import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as rhythmUi from '../../../lib/rhythm-ui.js';
import * as rhythmToday from '../../../lib/rhythm-today.js';
import { resolveCalendarCapabilities } from '../../../lib/calendar-capabilities.js';
import { mapTasksToCalendar } from '../../../lib/calendar-task-view.js';
import { calendarEventCardGeometry, calendarEventWhenLabel, calendarGridRange, mapGoogleEventsToGrid } from '../../../lib/calendar-event-view.js';

// Execute the production pages and EditDrawer handlers. Only data hooks and
// component boundaries are substituted; no server or provider request runs.
function compile(file, names) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const declarations = ast.statements.filter(node =>
    ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.includes(item.name.getText(ast))));
  return ts.transpileModule(declarations.map(node => node.getText(ast).replace(/^export /, '')).join('\n'), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const pages = compile('./work.jsx', ['withoutRecordEdit', 'decisionDayLabel', 'buildDecisionDraft', 'buildRhythmDraft', 'Decisions', 'Rhythm']);
const drawerCode = compile('../hub-primitives.jsx', ['FIELD_PANEL_KEY', 'groupFieldRows', 'EditDrawer']);
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null ? '' : String(node);
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(child => find(child, predicate)) : node && typeof node === 'object'
  ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate), ...find(node.props?.footer, predicate)] : [];

function hooks() {
  const slots = [], effects = [];
  let cursor = 0;
  const React = {
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(value => value !== false && value != null) } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback: callback => callback,
    useMemo: callback => callback(),
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  return { React, render(callback) { cursor = 0; const tree = callback(); effects.splice(0).forEach(effect => effect()); return tree; } };
}

function mount(kind, { saveOk = true, refreshOk = true } = {}) {
  const pageHooks = hooks(), drawerHooks = hooks();
  const initial = kind === 'Decisions'
    ? { id: 'decision-existing', title: '원래 결정', rationale: '원래 근거', reason: '원래 근거', decidedAt: '2026-10-27', status: 'Committed', projectId: '', followups: [], by: 'Me' }
    : { id: 'ritual-existing', name: '원래 루틴', ritualKey: 'local-routine', projectId: '', checkType: 'morning', category: 'health', targetPerWeek: 7, weeks: [0, 0, 0, 0, 0, 0, 0] };
  const collection = kind === 'Decisions' ? 'decisions' : 'rituals';
  const field = kind === 'Decisions' ? 'title' : 'name';
  const ledger = { decisions: [], rituals: [], decisionsState: { state: 'live' }, rhythmState: 'live', rhythmPartial: false, rhythmTruncatedSources: [], projects: [], blockedProjects: [] };
  ledger[collection] = [initial];
  let id = 0, latestWritten, requestCount = 0, params = new URLSearchParams();
  const noop = () => {};
  const browser = { addEventListener: noop, removeEventListener: noop };
  const deps = {
    ...rhythmUi, ...rhythmToday, React: pageHooks.React, DECISION_JOURNAL: false, FX_CERTAINTY_CHROME: {},
    useSearchParams: () => params, useRouter: () => ({ replace: noop }), usePathname: () => `/dashboard/work/${kind.toLowerCase()}`,
    useWorkLedger: () => ledger, topNavigationForRoute: () => ({ anchor: { label: '프로젝트' }, tabs: [] }),
    decisionSourceOptions: () => [{ key: 'all' }], decisionMatches: () => true,
    createClientId: () => `new-local-${++id}`, todayKey: () => '2026-10-27', window: browser,
    fetch: async (_url, options) => {
      requestCount++;
      latestWritten = JSON.parse(options.body);
      return { ok: saveOk, json: async () => ({ status: saveOk ? 'saved' : 'error' }) };
    },
    saveDecisionWithFollowup: async (_fetch, decision) => {
      requestCount++; latestWritten = decision;
      return { ok: saveOk, status: saveOk ? 'saved' : 'error', progress: { decision: saveOk } };
    },
  };
  ledger.retry = async () => {
    if (refreshOk) ledger[collection] = ledger[collection].map(row => ({ ...row, [field]: latestWritten?.[field] || row[field] }));
    else { ledger.decisionsState = { state: 'partial' }; ledger.rhythmState = 'partial'; ledger.rhythmPartial = true; }
    return refreshOk;
  };
  for (const name of ['Badge', 'Card', 'IconButton', 'Button', 'EmptyState', 'EditDrawer', 'Kbd', 'SegmentedControl', 'CertaintyBadge', 'SyncBadge', 'Drawer', 'Skeleton', 'TruthBadge', 'TextField', 'Iconed', 'DecisionMeta', 'DecisionFollowups', 'FloatingMentorWidget', 'RhythmToday', 'RhythmHistory']) deps[name] = name;
  const Page = new Function(...Object.keys(deps), `${pages}; return ${kind};`)(...Object.values(deps));
  const drawerDeps = { React: drawerHooks.React, Drawer: 'Drawer', Button: 'Button', Tabs: 'Tabs', ChipToggle: 'ChipToggle', Iconed: 'Iconed', window: browser, isTopEscLayer: () => true, requestAnimationFrame: () => 1, cancelAnimationFrame: noop };
  let tree, drawerTree, openId = null, activeDrawerHooks = drawerHooks;
  const render = () => {
    tree = pageHooks.render(() => Page({ onNavigate: noop }));
    const props = find(tree, node => node.type === 'EditDrawer')[0]?.props;
    if (props?.record.id !== openId) { activeDrawerHooks = hooks(); openId = props?.record.id || null; }
    if (props) {
      // Each mounted editor owns its own production hook state.
      const Editor = new Function(...Object.keys(drawerDeps), `${drawerCode}; return EditDrawer;`)(...Object.values({ ...drawerDeps, React: activeDrawerHooks.React }));
      drawerTree = activeDrawerHooks.render(() => Editor(props));
    } else drawerTree = null;
    return tree;
  };
  const button = label => find(drawerTree, node => node.type === 'Button' && text(node) === label)[0];
  const editor = () => find(tree, node => node.type === 'EditDrawer')[0];
  const open = () => {
    if (kind === 'Decisions') find(tree, node => node.props?.className === 'fx-tl-card')[0].props.onClick();
    else find(tree, node => node.type === 'RhythmToday')[0].props.onEdit(initial);
    render();
  };
  const create = () => { find(tree, node => node.type === 'Button' && text(node).includes(kind === 'Decisions' ? 'Record decision' : '새 루틴'))[0].props.onClick(); render(); };
  const edit = value => { editor().props.onChange(field, value); render(); };
  const discard = () => { drawerTree.props.onClose(); render(); assert.ok(button('버리고 닫기')); button('버리고 닫기').props.onClick(); render(); };
  const save = async () => { const action = button(kind === 'Decisions' && editor().props.record.isNew ? '결정 남기기' : '변경사항 저장'); await action.props.onClick(); render(); render(); };
  render();
  return { open, create, edit, discard, save, render, editor, ledger, initial, field, collection, requestCount: () => requestCount,
    value: () => editor()?.props.record[field], setQuery(query) { params = new URLSearchParams(query); render(); render(); },
    refreshWith(value) { ledger[collection] = [{ ...initial, [field]: value }]; ledger.decisionsState = { state: 'live' }; ledger.rhythmState = 'live'; ledger.rhythmPartial = false; render(); render(); } };
}

for (const kind of ['Decisions', 'Rhythm']) {
  test(`${kind}: discard restores the stored row on the list and on reopening`, () => {
    const app = mount(kind); app.open(); app.edit('버릴 입력'); app.discard();
    assert.equal(app.editor(), undefined);
    app.open(); assert.equal(app.value(), app.initial[app.field]);
    assert.equal(app.requestCount(), 0, 'discard has no persistence request');
  });
  test(`${kind}: discard removes a new local draft`, () => {
    const app = mount(kind); app.create(); const id = app.editor().props.record.id;
    app.edit('버릴 새 입력'); app.discard();
    app.create(); assert.notEqual(app.editor().props.record.id, id);
    assert.equal(app.value(), ''); assert.equal(app.requestCount(), 0);
  });
  test(`${kind}: failed save keeps the editor and input until explicit discard`, async () => {
    const app = mount(kind, { saveOk: false }); app.open(); app.edit('저장 실패 입력'); await app.save();
    assert.equal(app.value(), '저장 실패 입력'); assert.equal(app.requestCount(), 1);
    app.discard(); app.open(); assert.equal(app.value(), app.initial[app.field]);
  });
  test(`${kind}: acknowledged save survives close and retires its overlay after reread`, async () => {
    const app = mount(kind); app.open(); app.edit('저장된 변경'); await app.save();
    assert.equal(app.editor(), undefined); app.open(); assert.equal(app.value(), '저장된 변경');
    // Closing a clean reopened editor is not a discard prompt.
    app.editor().props.onClose(); app.render();
    app.refreshWith('다른 창의 최신 저장'); app.open(); assert.equal(app.value(), '다른 창의 최신 저장');
  });
  test(`${kind}: a newer read preserves active input, and discard reveals that newer record`, () => {
    const app = mount(kind); app.open(); app.edit('작성 중 입력'); app.refreshWith('갱신된 원격 기록');
    assert.equal(app.value(), '작성 중 입력'); app.discard(); app.open();
    assert.equal(app.value(), '갱신된 원격 기록');
  });
  test(`${kind}: cached partial reread retains an acknowledged save until a later complete read`, async () => {
    const app = mount(kind, { refreshOk: false }); app.open(); app.edit('확인된 저장'); await app.save();
    assert.equal(app.editor(), undefined); app.open(); assert.equal(app.value(), '확인된 저장');
    app.editor().props.onClose(); app.render(); app.open(); assert.equal(app.value(), '확인된 저장', 'clean close retains confirmed input while its reread is unavailable');
    app.edit('이번에만 버릴 입력'); app.discard(); app.open(); assert.equal(app.value(), '확인된 저장', 'discard restores the last acknowledged input');
    app.editor().props.onClose(); app.render(); app.refreshWith('다음 읽기'); app.open();
    assert.equal(app.value(), '다음 읽기');
  });
  test(`${kind}: a second new query opens another editor in the same mounted page`, () => {
    const app = mount(kind), query = `new=${kind === 'Decisions' ? 'decision' : 'rhythm'}`;
    app.setQuery(query); const firstId = app.editor().props.record.id;
    app.edit('첫 초안'); app.discard(); app.setQuery(''); app.setQuery(query);
    assert.ok(app.editor()); assert.notEqual(app.editor().props.record.id, firstId);
  });
}

const calendarCode = compile('./work.jsx', ['startOfWeek', 'sameDate', 'addDays', 'formatWeekRange', 'buildCalendarWeek', 'formatHour', 'Calendar']);
function mountCalendar(send) {
  const runtime = hooks(), callbacks = [];
  let reads = 0, requests = 0, tree;
  const calendar = { status: 'live', source: 'oauth', readOnly: false, events: [], refetch: () => { reads++; } };
  const deps = {
    React: { ...runtime.React, useEffect() {}, useCallback(callback) { callbacks.push(callback); return callback; } },
    DAY_MS: 86400000, EN_MONTH: new Intl.DateTimeFormat('en-US', { month: 'long' }),
    useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace() {} }), usePathname: () => '/dashboard/work/calendar',
    useCalendarCompactView: () => false, resolveCalendarView: () => 'week', useCalendarEvents: () => calendar,
    useCalendarTasks: () => ({ status: 'live', tasks: [] }), resolveCalendarCapabilities, mapTasksToCalendar,
    calendarEventCardGeometry, calendarEventWhenLabel, calendarGridRange, mapGoogleEventsToGrid,
    fetch: async (...args) => { requests++; return send(...args); },
  };
  for (const name of ['CalendarAgenda', 'CalendarOutcome', 'Card', 'Drawer', 'Button', 'IconButton', 'SegmentedControl', 'SyncBadge', 'TruthBadge', 'Iconed']) deps[name] = name;
  const Calendar = new Function(...Object.keys(deps), `${calendarCode}; return Calendar;`)(...Object.values(deps));
  const render = () => { callbacks.length = 0; tree = runtime.render(() => Calendar({ onNavigate() {} })); };
  render();
  return { render, create: () => callbacks[0]({ date: new Date(2026, 9, 27), startHour: 13, endHour: 14, title: '로컬 입력 일정' }),
    requests: () => requests, reads: () => reads, text: () => text(tree),
    recovery: () => find(tree, node => node.type === 'Button' && text(node) === '일정 다시 불러오기')[0] };
}

test('Calendar: synchronous lock ignores a second create from the same render until the first resolves', async () => {
  let finish;
  const app = mountCalendar(() => new Promise(resolve => { finish = resolve; }));
  const first = app.create(), second = app.create();
  assert.equal(app.requests(), 1); await second;
  finish({ ok: true, status: 200, json: async () => ({ status: 'saved' }) }); await first;
  assert.equal(app.reads(), 1);
  const third = app.create(); assert.equal(app.requests(), 2, 'settlement releases the lock');
  finish({ ok: true, status: 200, json: async () => ({ status: 'saved' }) }); await third;
});

test('Calendar: network, 5xx and unreadable acknowledgements preserve an explicit read recovery path', async () => {
  const unknowns = [
    async () => { throw Error('synthetic transport loss'); },
    async () => ({ ok: false, status: 502, json: async () => ({ status: 'error' }) }),
    async () => ({ ok: true, status: 200, json: async () => { throw Error('synthetic parse loss'); } }),
    async () => ({ ok: false, status: 503, json: async () => ({ status: 'saved' }) }),
    async () => ({ ok: true, status: 200, json: async () => ({}) }),
  ];
  for (const send of unknowns) {
    const app = mountCalendar(send); await app.create(); app.render();
    assert.match(app.text(), /저장 여부를 확인하지 못했습니다/); assert.match(app.text(), /일정이 없을 때만 다시 시도/);
    const recovery = app.recovery(); assert.ok(recovery); assert.equal(recovery.props.disabled, false);
    recovery.props.onClick(); assert.equal(app.reads(), 1); assert.equal(app.requests(), 1, 'recovery reads instead of creating again');
  }
});

test('Calendar: permission and validation refusals remain definite input errors', async () => {
  for (const status of [400, 401, 403, 422]) {
    const app = mountCalendar(async () => ({ ok: false, status, json: async () => ({ status: 'error' }) }));
    await app.create(); app.render();
    assert.match(app.text(), status === 401 || status === 403 ? /로그인과 캘린더 편집 권한/ : /일정 입력을 확인/);
    assert.doesNotMatch(app.text(), /저장 여부를 확인하지 못했습니다/);
  }
});
