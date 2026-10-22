// Execute the payment handler and response adapter with synthetic in-memory transport.
// No browser, account, real endpoint, environment file, or private path is used.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./revenue.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  const updateDealPayments = (id, nextPayments, label) => {');
const end = source.indexOf('\n  };', start) + '\n  };'.length;
assert.ok(start > 0 && end > start, 'Locate the actual payment handler');
const proposed = source.slice(start, end);

function fixture(code, initialId = 'synthetic-deal') {
  const state = { rows: [{ id: initialId, payments: [{ id: 'synthetic-payment', amount: 10 }] }], notices: [], sends: [], pending: new Map() };
  const context = {
    deals: state.rows,
    pendingPaymentsRef: { current: new Map() },
    setDeals: fn => { state.rows = fn(state.rows); context.deals = state.rows; },
    scheduleUndoable: (key, fn) => state.pending.set(key, fn),
    cancelUndoable: key => state.pending.delete(key),
    toast: Object.fromEntries(['info', 'success', 'error'].map(kind => [kind, (text, options) => state.notices.push({ kind, text, options })])),
    showDealConflict: () => false,
    saveRevenueRecord: (...args) => {
      state.sends.push(args);
      return new Promise(resolve => { state.resolve = resolve; });
    },
  };
  vm.createContext(context);
  vm.runInContext(`${code}\nglobalThis.invoke = updateDealPayments;`, context);
  return {
    state,
    change: () => context.invoke(initialId, [{ id: 'synthetic-payment', amount: 20 }], '입금을 확인했습니다'),
    flush: () => { const jobs = [...state.pending.values()]; state.pending.clear(); jobs.forEach(fn => fn()); },
    settle: async result => { state.resolve(result); await Promise.resolve(); },
  };
}

test('payment feedback announces pending through both delay and an unresolved request', async () => {
  const f = fixture(proposed); f.change();
  assert.equal(f.state.sends.length, 0);
  assert.deepEqual(f.state.notices.map(n => n.kind), ['info']);
  f.flush();
  assert.equal(f.state.sends.length, 1);
  assert.deepEqual(f.state.notices.map(n => n.kind), ['info']);
  await f.settle({ ok: true, status: 'saved' });
  assert.deepEqual(f.state.notices.map(n => n.kind), ['info', 'success']);
  assert.equal(f.state.notices[1].text, '입금을 확인했습니다');
  assert.equal(f.state.rows[0].payments[0].amount, 20);
});

test('payment feedback preserves Undo before dispatch without emitting success', () => {
  const f = fixture(proposed); f.change();
  f.state.notices[0].options.action.onClick(); f.flush();
  assert.equal(f.state.sends.length, 0);
  assert.equal(f.state.rows[0].payments[0].amount, 10);
  assert.ok(f.state.notices.every(n => n.kind !== 'success'));
});

for (const status of ['preview', 'error']) {
  test(`payment feedback keeps ${status} as failure, without a success notice`, async () => {
    const f = fixture(proposed); f.change(); f.flush();
    await f.settle({ ok: false, status });
    assert.equal(f.state.rows[0].payments[0].amount, 10);
    assert.deepEqual(f.state.notices.map(n => n.kind), ['info', 'error']);
  });
}

test('payment feedback retains unsaved local-row behavior without a network write', () => {
  const f = fixture(proposed, 'local-synthetic'); f.change(); f.flush();
  assert.equal(f.state.sends.length, 0);
  assert.equal(f.state.notices.length, 0);
  assert.equal(f.state.rows[0].payments[0].amount, 20);
});

const core = readFileSync(new URL('./revenue-core.jsx', import.meta.url), 'utf8');
const helperStart = core.indexOf('export async function saveRevenueRecord(');
const helperEnd = core.indexOf('\nexport function LeadEnrichmentPanel', helperStart);
assert.ok(helperStart > 0 && helperEnd > helperStart);
const helper = core.slice(helperStart, helperEnd).replace('export async function', 'async function');

const envelopes = [
  ['saved', { status: 200, ok: true, body: { status: 'saved', id: 'synthetic-deal' } }, true],
  ['preview', { status: 202, ok: true, body: { status: 'preview' } }, false],
  ['partial', { status: 200, ok: true, body: { status: 'partial' } }, false],
  ['error', { status: 500, ok: false, body: { status: 'error' } }, false],
  ['conflict', { status: 409, ok: false, body: { status: 'conflict' } }, false],
  ['invalid-json', { status: 200, ok: true, invalidJSON: true }, false],
  ['transport-loss', { transportLoss: true }, false],
];
for (const [name, envelope, succeeds] of envelopes) {
  test(`payment acknowledgement envelope: ${name}`, async () => {
    const requestCalls = [];
    const context = {
      fetch: async (url, options) => {
        requestCalls.push({ url, body: JSON.parse(options.body) });
        if (envelope.transportLoss) throw new Error('synthetic transport loss');
        return {
          ok: envelope.ok, status: envelope.status,
          json: async () => {
            if (envelope.invalidJSON) throw new SyntaxError('synthetic invalid json');
            return envelope.body;
          },
        };
      },
    };
    vm.createContext(context);
    vm.runInContext(`${helper}\nglobalThis.send = saveRevenueRecord;`, context);
    const result = await context.send('deal', 'update', { id: 'synthetic-deal', payments: [] });
    assert.equal(requestCalls.length, 1);
    assert.equal(requestCalls[0].url, '/api/hub/revenue/deal');
    assert.equal(requestCalls[0].body.op, 'update');
    assert.equal(result.ok, succeeds);
    const f = fixture(proposed); f.change(); f.flush();
    await f.settle(result);
    assert.equal(f.state.notices.some(n => n.kind === 'success'), succeeds);
    assert.equal(f.state.rows[0].payments[0].amount, succeeds ? 20 : 10);
    if (envelope.transportLoss) {
      // Remaining limitation: this small patch does not repair UPDATE uncertainty.
      assert.equal(result.status, 'error');
    }
  });
}
