import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createRevenueLedgerCache } from '../revenue-shared-cache.js';
import { formatCloseLabel, sameCloseDay } from '../../../lib/deal-timeline.js';
import { planBaselineFor } from '../../../lib/deal-payments.js';
import { mergeRevenueDrafts } from './revenue-create-client.js';

const source = readFileSync(new URL('./revenue.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('revenue.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const handlers = new Map();
let syncDeals;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer)) {
    handlers.set(node.name.getText(ast), node.initializer.getText(ast));
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect'
    && node.arguments[0]?.getText(ast).includes('setDeals(previous => mergeRevenueDrafts(ledger.deals')) syncDeals = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const tick = () => new Promise(setImmediate);
const row = { id: 'synthetic-deal', name: 'Synthetic deal', stage: 'consult', value: 100, closeAt: '2026-10-27', payments: [], recurring: null };
const envelope = record => ({ source: 'supabase', status: 'live', leads: [], deals: record ? [record] : [] });

function callback(name, cache, result = { ok: true, status: 'saved' }, initial = row) {
  let rows = [initial], drafts = {};
  const pending = new Map();
  const deps = {
    deals: rows, editDealId: initial.id, editingDeal: { ...initial, name: 'Saved edit' }, dealDrafts: { [initial.id]: { name: 'Saved edit' } },
    setDeals: update => { rows = update(rows); }, setDealDrafts: update => { drafts = update(drafts); }, setEditDealId() {},
    pendingStageRef: { current: new Map() }, pendingCloseRef: { current: new Map() },
    pendingPaymentsRef: { current: new Map() }, pendingRecurringRef: { current: new Map() },
    scheduleUndoable: (key, run) => pending.set(key, run), cancelUndoable: key => pending.delete(key),
    setBoardNotice() {}, toast: { info() {}, success() {}, error() {} }, triggerCelebration() {},
    dealStageLabel: key => key, DEAL_STAGES: [], showDealConflict: () => false,
    formatCloseLabel, sameCloseDay, planBaselineFor,
    hasPendingRevenueCreate: () => false, notifyRevenueSaveFailure() {},
    saveRevenueRecord: async () => result, reloadLedger: cache.invalidate,
  };
  assert.ok(handlers.has(name), `exercise the actual ${name} callback`);
  const run = new Function(...Object.keys(deps), `return (${handlers.get(name)});`)(...Object.values(deps));
  return { run, flush: () => { pending.forEach(run => run()); pending.clear(); } };
}

const changes = [
  ['persistDeal', []],
  ['toggleDealHidden', [row.id, true]],
  ['move', [row.id, 'quote']],
  ['moveCloseDate', [row.id, '2026-11-01', 'Changed date']],
  ['updateDealPayments', [row.id, [{ id: 'synthetic-payment', amount: 100 }], 'Changed payment']],
  ['updateDealRecurring', [row.id, { amount: 100, day: 1 }, 'Changed recurring']],
  ['deleteDeal', []],
];

test('a delayed save acknowledgement preserves another edited deal through the actual loading-sync effect', async () => {
  assert.ok(syncDeals, 'exercise the effect that applies shared snapshots to the mounted board');
  const other = { ...row, id: 'other-deal', name: 'Other deal' };
  let rows = [row, other];
  const drafts = { [other.id]: { name: 'Unsaved input in the second drawer' } };
  const reads = [];
  const cache = createRevenueLedgerCache({ fetcher: () => new Promise(resolve => reads.push(record => resolve({
    ok: true, json: async () => ({ ...envelope(record), deals: [record, other] }),
  }))) });
  const first = cache.refresh(); await tick(); reads[0](row); await first;
  const unsubscribe = cache.subscribe(() => {
    const { ledger, syncState } = cache.getSnapshot();
    const apply = new Function('ledger', 'syncState', 'setDeals', 'mergeRevenueDrafts', `return (${syncDeals});`)(
      ledger, syncState, change => { rows = change(rows); }, mergeRevenueDrafts,
    );
    apply();
  });
  const action = callback('move', cache);
  action.run(row.id, 'quote'); action.flush(); await tick();
  const editing = () => { const base = rows.find(item => item.id === other.id); return base && { ...base, ...drafts[other.id] }; };
  assert.equal(cache.getSnapshot().syncState, 'loading');
  assert.equal(editing()?.name, drafts[other.id].name, 'loading must not unmount the unrelated drawer');
  const current = cache.refresh(); reads[1]({ ...row, stage: 'quote' }); await current;
  assert.equal(editing()?.name, drafts[other.id].name);
  unsubscribe();
});

for (const [name, args] of changes) {
  test(`${name}: confirmed write cancels an older shared GET before it can replace the saved value`, async () => {
    const reads = [];
    const cache = createRevenueLedgerCache({ fetcher: (_url, options) => new Promise(resolve => reads.push({
      signal: options.signal, finish: record => resolve({ ok: true, json: async () => envelope(record) }),
    })) });
    const initial = cache.refresh(); await tick(); reads[0].finish(row); await initial;
    const stale = cache.refresh(); await tick();
    const action = callback(name, cache);
    await action.run(...args); action.flush(); await tick();
    assert.equal(reads[1].signal.aborted, true, 'a read started before the write cannot publish afterward');
    assert.equal(reads.length, 3, 'the write starts a new shared read');
    const current = cache.refresh();
    const saved = name === 'deleteDeal' ? null : { ...row, name: 'Server-confirmed new value' };
    reads[2].finish(saved); await current;
    reads[1].finish(row); await stale; await tick();
    assert.deepEqual(cache.getSnapshot().ledger.deals, saved ? [saved] : []);
    assert.equal(cache.getSnapshot().syncState, 'live');
  });

  test(`${name}: failed write preserves the shared snapshot without a success refresh`, async () => {
    let reads = 0;
    const cache = createRevenueLedgerCache({ fetcher: async () => { reads++; return { ok: true, json: async () => envelope(row) }; } });
    await cache.refresh();
    const before = cache.getSnapshot();
    const action = callback(name, cache, { ok: false, status: 'error' });
    await action.run(...args); action.flush(); await tick();
    assert.equal(reads, 1);
    assert.equal(cache.getSnapshot(), before);
  });
}
