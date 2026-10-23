import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, createId, workspace } from '../../../../scripts/audits/revenue-create-rest.mjs';

import { persistRevenueRecord, buildLeadWrite, buildDealWrite, buildAccountWrite, buildCaseWrite, mergeRecordMeta } from './revenue-write.js';
const persistRevenueCreate = command => persistRevenueRecord({ ...command, op: 'create' });
const cases = [['leads',buildLeadWrite],['deals',buildDealWrite],['customer_accounts',buildAccountWrite],['operation_cases',buildCaseWrite]];
for (const [table, build] of cases) {
  const command = { table, payload: { createId, name: 'Synthetic original', title: 'Synthetic original', type: 'company' }, build };
  test(`Revenue create ${table}: lost acknowledgement stays unknown; explicit same-command retry acknowledges one row`, async t => {
    const io = fixture(t, table, { loseFirst: true });
    const first = await persistRevenueCreate(command);
    assert.equal(first.status,'unknown'); assert.equal(io.rows.size,1); assert.equal(io.calls.length,1,'no automatic write/read retry');
    const retry = await persistRevenueCreate(command);
    assert.equal(retry.status,'saved'); assert.equal(retry.replayed,true); assert.equal(retry.id,createId); assert.equal(io.rows.size,1);
    assert.deepEqual(io.calls.map(c=>c.method),['POST','POST','GET']);
    console.log(JSON.stringify({ table, scenario:'lost-ack/retry', statuses:[first.status,retry.status], rows:io.rows.size, writes:2, reconciliationReads:1 }));
  });
  test(`Revenue create ${table}: concurrent repeats acknowledge once, changed content conflicts`, async t => {
    const io = fixture(t, table);
    const results = await Promise.all([persistRevenueCreate(command),persistRevenueCreate(command),persistRevenueCreate({...command,payload:{...command.payload,name:'Synthetic changed',title:'Synthetic changed'}})]);
    assert.deepEqual(results.map(r=>r.status),['saved','saved','conflict']); assert.equal(io.rows.size,1);
    const row = io.rows.get(createId); assert.equal(row.name || row.title,'Synthetic original');
    assert.equal(io.calls.filter(c=>c.method==='POST').length,3);
  });
  test(`Revenue create ${table}: malformed acknowledgement stays unknown and replay proves original`, async t => {
    const io = fixture(t, table, { malformedFirst: true });
    assert.equal((await persistRevenueCreate(command)).status,'unknown');
    assert.equal((await persistRevenueCreate(command)).status,'saved'); assert.equal(io.rows.size,1);
  });
  for (const [label, body, reason] of [
    ['empty body', '', 'invalid-rows'],
    ['empty representation', '[]', 'no-matching-row'],
    ['invalid row representation', '[null]', 'invalid-rows'],
  ]) test(`Revenue create ${table}: committed ${label} needs explicit same-command reconciliation`, async t => {
    const io = fixture(t, table);
    const restFetch = globalThis.fetch;
    let first = true;
    globalThis.fetch = async (url, options) => {
      const response = await restFetch(url, options);
      if (first && options.method === 'POST') {
        first = false;
        return new Response(body, { status: 201 });
      }
      return response;
    };
    const result = await persistRevenueCreate(command);
    assert.equal(result.status, 'unknown');
    assert.equal(result.reason, reason);
    assert.equal(result.record, undefined, 'an invalid acknowledgement cannot prove persistence');
    assert.equal(io.rows.size, 1, 'the original write committed despite the invalid acknowledgement');
    assert.deepEqual(io.calls.map(call => call.method), ['POST'], 'no automatic retry or reconciliation');
    const original = structuredClone(io.rows.get(createId));
    const replay = await persistRevenueCreate(command);
    assert.equal(replay.status, 'saved');
    assert.equal(replay.replayed, true);
    assert.equal(replay.id, createId);
    assert.deepEqual(io.calls.map(call => call.method), ['POST', 'POST', 'GET']);
    assert.equal(io.rows.size, 1);
    assert.deepEqual(io.rows.get(createId), original);
  });
  test(`Revenue create ${table}: mutable row edits do not erase original receipt or turn a new payload into a replay`, async t => {
    const io = fixture(t, table); await persistRevenueCreate(command);
    const row = io.rows.get(createId); row.meta=mergeRecordMeta({table,existingMeta:row.meta,metaPatch:{note:'later edit'}});
    row.name ? row.name='Later saved name' : row.title='Later saved name';
    assert.equal((await persistRevenueCreate(command)).status,'saved');
    assert.equal((await persistRevenueCreate({...command,payload:{...command.payload,name:'Later saved name',title:'Later saved name'}})).status,'conflict');
    assert.equal(io.rows.size,1); assert.equal(io.rows.get(createId).meta.note,'later edit');
  });
}
test('Revenue create canonical JSON property order is not a different command', async t=>{
  const io=fixture(t,'leads'); const build=buildLeadWrite;
  await persistRevenueCreate({table:'leads',payload:{createId,name:'Synthetic original',type:'company'},build});
  assert.equal((await persistRevenueCreate({table:'leads',payload:{type:'company',name:'Synthetic original',createId},build})).status,'saved');
  assert.equal(io.rows.size,1);
});
test('Revenue create unrelated ID collision without the original receipt never succeeds', async t=>{
  const io=fixture(t,'leads',{initialRows:[{id:createId,workspace_id:workspace,name:'Synthetic original',meta:{}}]});
  const result=await persistRevenueCreate({table:'leads',payload:{createId,name:'Synthetic original'},build:buildLeadWrite});
  assert.equal(result.status,'conflict'); assert.equal(io.rows.size,1); assert.deepEqual(io.rows.get(createId).meta,{});
});
test('Revenue create cross-workspace collision returns no foreign row and does not claim success', async t=>{
  const io=fixture(t,'leads',{initialRows:[{id:createId,workspace_id:'other-workspace',name:'Private synthetic name',meta:{}}]});
  const result=await persistRevenueCreate({table:'leads',payload:{createId,name:'Synthetic original'},build:buildLeadWrite});
  assert.equal(result.status,'unknown'); assert.equal(result.record,undefined); assert.equal(io.rows.size,1);
});
test('Revenue create unreadable duplicate receipt remains unknown', async t=>{
  const io=fixture(t,'leads',{blockRead:true});
  const command={table:'leads',payload:{createId,name:'Synthetic original'},build:buildLeadWrite};
  assert.equal((await persistRevenueCreate(command)).status,'saved');
  assert.equal((await persistRevenueCreate(command)).status,'unknown'); assert.equal(io.rows.size,1);
});
for(const id of [undefined,'local-lead-123','', '00000000-0000-4000-8000-000000000002,other']) test(`Revenue create invalid command id ${JSON.stringify(id)} cannot issue a write`,async t=>{
  const io=fixture(t,'leads');
  assert.equal((await persistRevenueCreate({table:'leads',payload:{createId:id,name:'Synthetic original'},build:buildLeadWrite})).status,'error');
  assert.equal(io.calls.length,0);
});

test('Revenue create late first request overtaken by retry still produces one row', async t=>{
  const io=fixture(t,'leads',{holdFirst:true});const command={table:'leads',payload:{createId,name:'Original'},build:buildLeadWrite};
  const first=persistRevenueCreate(command);await new Promise(setImmediate);
  assert.equal((await persistRevenueCreate(command)).status,'saved');io.releaseFirst();
  assert.equal((await first).status,'saved');assert.equal(io.rows.size,1);
});
test('Revenue create different-payload race winner never acknowledges the losing content',async t=>{
  const io=fixture(t,'leads',{holdFirst:true});const command={table:'leads',payload:{createId,name:'Original'},build:buildLeadWrite};
  const first=persistRevenueCreate(command);await new Promise(setImmediate);
  assert.equal((await persistRevenueCreate({...command,payload:{createId,name:'Changed'}})).status,'saved');io.releaseFirst();
  assert.equal((await first).status,'conflict');assert.equal(io.rows.size,1);assert.equal(io.rows.get(createId).name,'Changed');
});
test('Revenue create HTTP 5xx is unknown, not a definitive failure or automatic write retry',async t=>{
  const io=fixture(t,'leads',{rejectFirst:503});assert.equal((await persistRevenueCreate({table:'leads',payload:{createId,name:'Original'},build:buildLeadWrite})).status,'unknown');assert.equal(io.calls.length,1);
});
for (const status of [400, 403]) test(`Revenue create HTTP ${status} remains a definitive rejection`, async t => {
  const io = fixture(t, 'leads', { rejectFirst: status });
  const result = await persistRevenueCreate({ table: 'leads', payload: { createId, name: 'Original' }, build: buildLeadWrite });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, `http-${status}`);
  assert.equal(io.rows.size, 0);
  assert.deepEqual(io.calls.map(call => call.method), ['POST']);
});
test('bounded receipt contract: hard deletion removes replay history (not a durable tombstone)',async t=>{
  const io=fixture(t,'leads');const command={table:'leads',payload:{createId,name:'Original'},build:buildLeadWrite};
  await persistRevenueCreate(command);io.rows.delete(createId);assert.equal((await persistRevenueCreate(command)).status,'saved');assert.equal(io.rows.size,1);
});
