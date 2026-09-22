import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetricReader, metricPeriodWindow } from './source-adapters.js';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const otherWorkspace = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-09-21T00:00:00Z');
const period = { scope: 'personal', periodStart: '2026-09-14', periodEnd: '2026-09-20', timezone: 'Asia/Seoul' };
function reader(data, options = {}) {
  const calls = [];
  const readRows = async (table, request) => {
    calls.push({ table, ...request });
    if (data[table] === null) return null;
    return (data[table] || []).filter(row => request.filters.every(([key, condition]) => {
      const [operator, ...rest] = condition.split('.'); const value = rest.join('.');
      if (operator === 'eq') return String(row[key]) === value;
      if (operator === 'gte') return row[key] >= value;
      if (operator === 'lt') return row[key] < value;
      if (operator === 'gt') return row[key] > value;
      if (operator === 'in') return value.slice(1,-1).split(',').includes(String(row[key]));
      return true;
    })).sort((a,b) => a.id.localeCompare(b.id)).slice(0, request.limit);
  };
  return { ...createMetricReader({ workspaceId, readRows, now, ...options }), calls };
}
const row = (id, extra={}) => ({id, workspace_id: workspaceId, ...extra});

test('inclusive local dates create a half-open UTC range with DST support', () => {
  assert.deepEqual(metricPeriodWindow(period), { start: '2026-09-13T15:00:00.000Z', end: '2026-09-20T15:00:00.000Z' });
  assert.deepEqual(metricPeriodWindow({periodStart:'2026-03-08',periodEnd:'2026-03-08',timezone:'America/New_York'}), {start:'2026-03-08T05:00:00.000Z',end:'2026-03-09T04:00:00.000Z'});
  assert.equal(metricPeriodWindow({...period,periodEnd:'2026-02-31'}), null);
  assert.equal(metricPeriodWindow({...period,timezone:'bad/timezone'}), null);
});
test('completed metric uses completed_at, workspace and inherited brand scope, never edited_at', async () => {
  const r = reader({tasks:[
    row('a',{status:'done',completed_at:'2026-09-18T00:00:00Z',project_id:'p'}),
    row('b',{status:'done',completed_at:'2026-09-18T00:00:00Z'}),
    row('c',{status:'done',completed_at:'2026-08-18T00:00:00Z',updated_at:'2026-09-18T00:00:00Z'}),
    row('d',{status:'done',completed_at:'2026-09-18T00:00:00Z',workspace_id:otherWorkspace}),
  ],projects:[row('p',{brand_id:'brand'})],brands:[row('brand',{slug:'classmoon'})]});
  assert.equal((await r.measure({...period,sourceKey:'tasks_completed'})).value,1);
  assert.equal((await r.measure({...period,scope:'company',sourceKey:'tasks_completed'})).value,1);
  assert.ok(r.calls.every(c => c.filters.some(([k,v])=>k==='workspace_id'&&v===`eq.${workspaceId}`)));
});
test('missing linked scope is partial, not silently personal or zero', async () => {
  const r = reader({tasks:[row('a',{status:'done',completed_at:'2026-09-18T00:00:00Z',project_id:'missing'})]});
  const m = await r.measure({...period,sourceKey:'tasks_completed'});
  assert.equal(m.value,null); assert.equal(m.coverage,'partial');
});
test('CRM ownership follows durable account_kind, lane and company fallback with explicit personal override',async()=>{
  const r=reader({});
  for(const table of ['leads','deals','customer_accounts']){
    assert.equal(await r.resolveEntityScope(table,row('one',{meta:{account_kind:'company'}})),'company');
    assert.equal(await r.resolveEntityScope(table,row('two',{meta:{account_kind:'business'}})),'company');
    assert.equal(await r.resolveEntityScope(table,row('three',{meta:{lane:'classin_sales'}})),'company');
    assert.equal(await r.resolveEntityScope(table,row('four',{company_id:'company'})),'company');
    assert.equal(await r.resolveEntityScope(table,row('five',{company_id:'company',meta:{account_kind:'individual'}})),'personal');
    assert.equal(await r.resolveEntityScope(table,row('six',{company_id:'company',meta:{workspace:'brand',account_kind:'company'}})),'personal');
  }
});
test('CRM contacts count actual interactions and exclude notes, AI and legacy duplicate sink', async () => {
  const r = reader({crm_activities:[
    row('a',{kind:'call',occurred_at:'2026-09-18T00:00:00Z',lead_id:'lead'}),
    row('b',{kind:'note',occurred_at:'2026-09-18T00:00:00Z',lead_id:'lead'}),
    row('c',{kind:'ai',occurred_at:'2026-09-18T00:00:00Z',lead_id:'lead'}),
  ],leads:[row('lead',{meta:{type:'company'}})],outreach_outcomes:[row('legacy')]});
  assert.equal((await r.measure({...period,scope:'company',sourceKey:'contacts_recorded'})).value,1);
  assert.equal((await r.measure({...period,sourceKey:'contacts_recorded'})).value,0);
  assert.ok(!r.calls.some(c=>c.table==='outreach_outcomes'));
});
test('successful published events use actual time and stable post identity for deduplication', async () => {
  const r = reader({publish_logs:[
    row('a',{status:'published',published_at:'2026-09-18T00:00:00Z',channel:'threads',external_id:'one',variant_id:'v'}),
    row('b',{status:'published',published_at:'2026-09-18T00:00:00Z',channel:'threads',external_id:'one',variant_id:'v'}),
    row('c',{status:'queued',created_at:'2026-09-18T00:00:00Z',variant_id:'v'}),
    row('d',{status:'failed',published_at:'2026-09-18T00:00:00Z',variant_id:'v'}),
  ],content_variants:[row('v',{content_item_id:'i'})],content_items:[row('i',{meta:{org_scope:'personal'}})]});
  const m=await r.measure({...period,sourceKey:'content_published'});
  assert.equal(m.value,1); assert.equal(m.coverage,'complete'); assert.ok(m.evidence.length);
});
test('unidentified published log does not assert an exact count', async () => {
  const r=reader({publish_logs:[row('a',{status:'published',published_at:'2026-09-18T00:00:00Z'})]});
  const m=await r.measure({...period,sourceKey:'content_published'});
  assert.equal(m.coverage,'partial');assert.equal(m.value,null);
});
test('source failure and zero rows have distinct values and coverage', async () => {
  const bad = await reader({tasks:null}).measure({...period,sourceKey:'tasks_completed'});
  const empty = await reader({tasks:[]}).measure({...period,sourceKey:'tasks_completed'});
  assert.equal(bad.value,null);assert.equal(bad.coverage,'unmeasured');
  assert.equal(empty.value,0);assert.equal(empty.coverage,'complete');
});
test('pagination visits all rows, and a bounded truncation is never an exact result', async () => {
  const data={tasks:Array.from({length:7},(_,i)=>row(String(i),{status:'done',completed_at:'2026-09-18T00:00:00Z'}))};
  assert.equal((await reader(data,{pageSize:2}).measure({...period,sourceKey:'tasks_completed'})).value,7);
  const truncated=await reader(data,{pageSize:2,maxPages:2}).measure({...period,sourceKey:'tasks_completed'});
  assert.equal(truncated.value,null);assert.equal(truncated.coverage,'partial');
});
test('invalid scopes and future windows cannot claim complete measurement', async () => {
  const r=reader({});
  assert.equal((await r.measure({...period,scope:'all',sourceKey:'tasks_completed'})).coverage,'unmeasured');
  assert.equal((await r.measure({...period,periodStart:'2027-01-01',periodEnd:'2027-01-31',sourceKey:'tasks_completed'})).value,null);
});
test('daily reviews use declared local review date and remain personal', async () => {
  const r=reader({journal_entries:[row('r',{entry_kind:'daily_review',review_date:'2026-09-20',review_timezone:'Asia/Seoul',created_at:'2026-09-20T16:00:00Z'}),row('future',{entry_kind:'daily_review',review_date:'2026-09-30',review_timezone:'Asia/Seoul'})]});
  assert.equal((await r.measure({...period,sourceKey:'reviews_completed'})).value,1);
  assert.equal((await r.measure({...period,periodEnd:'2026-09-30',sourceKey:'reviews_completed'})).value,1);
  assert.equal((await r.measure({...period,scope:'company',sourceKey:'reviews_completed'})).value,0);
});
test('many source rows resolve ownership in batches instead of one HTTP lookup per record', async () => {
  const r=reader({
    tasks:Array.from({length:50},(_,i)=>row(`t${String(i).padStart(2,'0')}`,{status:'done',completed_at:'2026-09-18T00:00:00Z',project_id:`p${i}`})),
    projects:Array.from({length:50},(_,i)=>row(`p${i}`,{brand_id:'brand'})),
    brands:[row('brand',{slug:'classmoon'})],
  });
  assert.equal((await r.measure({...period,scope:'company',sourceKey:'tasks_completed'})).value,50);
  assert.ok(r.calls.length<=6,`Expected bounded batch reads, got ${r.calls.length}`);
});
test('a server-imposed shorter page does not hide remaining records', async()=>{
  let requests=0;
  const rows=Array.from({length:5},(_,i)=>row(String(i),{status:'done',completed_at:'2026-09-18T00:00:00Z'}));
  const r=createMetricReader({workspaceId,now,pageSize:500,readRows:async(_table,options)=>{
    requests++;const cursor=options.filters.find(([key,value])=>key==='id'&&value.startsWith('gt.'))?.[1].slice(3);
    return rows.filter(row=>cursor==null||row.id>cursor).slice(0,2);
  }});
  assert.equal((await r.measure({...period,sourceKey:'tasks_completed'})).value,5);assert.equal(requests,4);
});
