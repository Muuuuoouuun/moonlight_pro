import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const ID = '66666666-6666-4666-8666-666666666666';
const PROJECT = '11111111-1111-4111-8111-111111111111';
let state;
globalThis.__checkOutcomeIO = {
  workspace: WORKSPACE,
  read: async (_table, options) => {
    state.reads.push(options);
    if (state.error) return { rows: null, error: state.error };
    return { rows: [...state.rows.values()].filter(row => options.filters.every(([field, value]) => value === `eq.${row[field]}`)), error: null };
  },
  insert: async (_table, record) => {
    state.inserts++;
    if (state.rows.has(record.id)) return { persisted: false, reason: 'duplicate' };
    state.rows.set(record.id, { ...record, created_at: '2026-10-07T01:00:00Z', undone_at: null });
    return { persisted: true, record: structuredClone(state.rows.get(record.id)) };
  },
  update: async (_table, filters, patch) => {
    state.updates++;
    const row = [...state.rows.values()].find(row => filters.every(([field, value]) => value === 'is.null' ? row[field] == null : value.startsWith('in.') ? ['snoozed', 'scheduled'].includes(row[field]) : value === `eq.${row[field]}`));
    if (!row) return { persisted: false, reason: 'no-matching-row' };
    Object.assign(row, patch); return { persisted: true, record: structuredClone(row) };
  },
};
registerHooks({ resolve(specifier, context, nextResolve) {
  const stubs = {
    '@/lib/server-read': `export const eqFilter=x=>'eq.'+x; export const inFilter=x=>'in.('+x.join(',')+')'; export const fetchSupabaseRowsDetailed=(...a)=>globalThis.__checkOutcomeIO.read(...a);`,
    '@/lib/server-write': `export const resolveSupabaseConfig=()=>true; export const resolveDefaultWorkspaceId=()=>globalThis.__checkOutcomeIO.workspace; export const insertSupabaseRecord=(...a)=>globalThis.__checkOutcomeIO.insert(...a); export const updateSupabaseRecord=(...a)=>globalThis.__checkOutcomeIO.update(...a);`,
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { recordSignalOutcome, undoSignalOutcome } = await import('./signal-outcomes.js');
const base = () => ({ requestId: ID, signalKey: `work-blocked:${PROJECT}`, subject: { type: 'project', id: PROJECT }, title: '합성 기록', outcome: 'scheduled', scheduledStart: '2026-10-07T02:00:00Z', scheduledEnd: '2026-10-07T02:30:00Z' });
const reset = () => { state = { rows: new Map(), reads: [], inserts: 0, updates: 0, error: null }; };
const options = { now: Date.parse('2026-10-07T01:00:00Z') };

test('actual receipt repository confirms one row on same-ID retry after an acknowledgement loss', async () => {
  reset(); const saved = await recordSignalOutcome(base(), options);
  assert.equal(saved.status, 'saved'); assert.equal(saved.receipt.requestId, ID); assert.equal(saved.receipt.workspaceId, WORKSPACE);
  const again = await recordSignalOutcome(base(), options);
  assert.equal(again.status, 'duplicate'); assert.equal(state.inserts, 1); assert.equal(state.rows.size, 1);
  assert.ok(state.reads.every(read => read.filters.some(([k, v]) => k === 'workspace_id' && v === `eq.${WORKSPACE}`)));
});

test('actual repository rejects every changed duplicate payload without modifying the existing receipt', async () => {
  reset(); await recordSignalOutcome(base(), options);
  for (const patch of [{ title: '다른 제목' }, { subject: { type: 'project', id: ID } }, { scheduledStart: '2026-10-07T02:10:00Z' }, { scheduledEnd: '2026-10-07T02:40:00Z' }, { calendarEventId: 'different' }, { note: '다름' }, { recordRef: { table: 'projects', id: ID } }]) {
    assert.equal((await recordSignalOutcome({ ...base(), ...patch }, options)).status, 'conflict');
  }
  assert.equal(state.inserts, 1); assert.equal(state.rows.get(ID).title, '합성 기록');
});

test('unavailable reads stop insertion; an unapplied table is truthful preview', async () => {
  reset(); state.error = { status: 503, detail: 'synthetic unavailable' };
  assert.equal((await recordSignalOutcome(base(), options)).status, 'failed'); assert.equal(state.inserts, 0);
  state.error = { status: 404, detail: 'PGRST205' };
  assert.equal((await recordSignalOutcome(base(), options)).status, 'preview'); assert.equal(state.inserts, 0);
});

test('undo ACK loss can be retried idempotently so the linked CRM resume is not stranded', async () => {
  reset(); await recordSignalOutcome(base(), options);
  const first = await undoSignalOutcome({ id: ID }, options), again = await undoSignalOutcome({ id: ID }, options);
  assert.equal(first.status, 'saved'); assert.equal(again.status, 'duplicate');
  assert.equal(again.receipt.undoneAt, first.receipt.undoneAt); assert.equal(state.updates, 1);
});

test('a snooze committed before midnight is still reconcilable after its date boundary', async () => {
  reset(); const body = { requestId: ID, signalKey: `work-blocked:${PROJECT}`, subject: { type: 'project', id: PROJECT }, title: '합성 기록', outcome: 'snoozed', snoozedUntil: '2026-10-08' };
  assert.equal((await recordSignalOutcome(body, options)).status, 'saved');
  const tomorrow = { now: Date.parse('2026-10-08T01:00:00Z') };
  assert.equal((await recordSignalOutcome(body, tomorrow)).status, 'duplicate');
  assert.equal((await recordSignalOutcome({ ...body, requestId: PROJECT }, tomorrow)).status, 'invalid-input');
  assert.equal(state.inserts, 1);
});
