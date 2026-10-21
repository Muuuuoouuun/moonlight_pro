// Opt-in, pre-implementation acceptance gates. Not part of the root npm test glob.
// Failed on baseline 935a22fe; the bounded row-local implementation must now pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { saveRevenueCreate } from '../../apps/hub/components/hub/pages/revenue-create-client.js';
import { REVENUE_CREATE_KINDS, CREATE_UNKNOWN_MESSAGE } from '../../apps/hub/lib/sales-os/revenue-create-command.js';
import { fixture, createId } from './revenue-create-rest.mjs';
import { persistRevenueRecord, buildLeadWrite, buildDealWrite, buildAccountWrite, buildCaseWrite } from '../../apps/hub/lib/sales-os/revenue-write.js';
const cases = [['leads',buildLeadWrite],['deals',buildDealWrite],['customer_accounts',buildAccountWrite],['operation_cases',buildCaseWrite]];
for (const [table, build] of cases) {
  test(`ACCEPTANCE ${table}: committed create + lost acknowledgement + explicit retry is one row`, async t => {
    const io = fixture(t, table, { loseFirst: true });
    const command = { table, op: 'create', id: 'local-draft', payload: { createId, name: 'Synthetic original', title: 'Synthetic original', type: 'company' }, build };
    const first = await persistRevenueRecord(command), retry = await persistRevenueRecord(command);
    assert.equal(first.status, 'unknown'); assert.equal(retry.status, 'saved'); assert.equal(io.rows.size, 1);
    assert.equal(io.calls.filter(c => c.method === 'POST').length, 2, 'no automatic write retries');
    console.log(JSON.stringify({ table, scenario: 'lost-ack/retry', statuses: [first.status,retry.status], rows: io.rows.size, writes: io.calls.filter(call => call.method === 'POST').length, reconciliationReads: io.calls.filter(call => call.method === 'GET').length }));
  });
  test(`ACCEPTANCE ${table}: concurrent same-command creates and changed-payload retry must be distinguished`, async t => {
    const io = fixture(t, table);
    const base = { table, op: 'create', id: 'local-draft', payload: { createId, name: 'Synthetic original', title: 'Synthetic original' }, build };
    const results = await Promise.all([persistRevenueRecord(base),persistRevenueRecord(base),persistRevenueRecord({ ...base, payload: { ...base.payload, name: 'Synthetic changed', title: 'Synthetic changed' } })]);
    assert.deepEqual(results.map(r => r.status), ['saved','saved','conflict']); assert.equal(io.rows.size, 1);
    console.log(JSON.stringify({ table, scenario: 'concurrent/reused-id/different-payload', rows: io.rows.size, statuses: results.map(r=>r.status) }));
  });
}
test('ACCEPTANCE malformed successful create acknowledgement must remain unknown without a real id', async t => {
  const io = fixture(t, 'leads', { malformedFirst: true });
  const result = await persistRevenueRecord({ table: 'leads', op: 'create', payload: { createId, name: 'Synthetic original', title: 'Synthetic original' }, build: buildLeadWrite });
  assert.equal(result.status, 'unknown'); assert.notEqual(result.id, createId); assert.equal(io.rows.size, 1);
});
test('ACCEPTANCE real shared UI save helper must classify lost create response as unknown', async t => {
  const source = readFileSync(new URL('../../apps/hub/components/hub/pages/revenue-core.jsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function saveRevenueRecord'), source.indexOf('\nexport function LeadEnrichmentPanel')).replace('export ', '');
  let calls = 0;
  const save = new Function('fetch','saveRevenueCreate','REVENUE_CREATE_KINDS','CREATE_UNKNOWN_MESSAGE', `${body}; return saveRevenueRecord;`)(async () => { calls++; throw new TypeError('synthetic response lost AFTER commit'); }, saveRevenueCreate, REVENUE_CREATE_KINDS, CREATE_UNKNOWN_MESSAGE);
  const result = await save('lead','create',{ createId, id:'local-draft',name:'Synthetic original' });
  assert.equal(result.ok,false); assert.equal(result.status,'unknown'); assert.equal(calls,1);
});
