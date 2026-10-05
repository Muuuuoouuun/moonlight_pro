import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINANCE_VIEWS, financeMoney, financeReadState, financeFilters, financeEntries, financePeriodTotals, financeObservedGroups, financeChanges, financeSaveResult } from './finance-view.js';

test('unknown amounts remain unknown while a confirmed zero is visible', () => {
  assert.equal(financeMoney(null), '미확인');
  assert.equal(financeMoney(undefined), '미확인');
  assert.equal(financeMoney(0), '0원');
});
test('HTTP 200 errors and unsupported read envelopes never become empty live ledgers', () => {
  assert.equal(financeReadState({status:'error',entries:[]}).status, 'error');
  assert.equal(financeReadState({status:'preview'}).status, 'preview');
  assert.equal(financeReadState({status:'private_preview'}).status, 'preview');
  assert.equal(financeReadState({status:'live',source:'error'}).status, 'error');
  assert.equal(financeReadState(null).status, 'error');
});
test('query filters default safely and month filters never invent zero totals', () => {
  assert.deepEqual(financeFilters(new URLSearchParams('view=unknown&month=nope')), {view:'flow',month:'',q:''});
  assert.equal(financePeriodTotals({monthly:[]}, '2099-02').net, null);
  assert.equal(financeEntries([{date:'2099-01-03',merchant:'A'},{date:'2099-02-01',merchant:'B'}], {month:'2099-01',q:'a'}).length,1);
});
test('Claude group observations are counted once for two separate contracts', () => {
  const group = {group:'claude',net:30,count:2,monthly:[{month:'2099-01',net:10,count:1}]};
  assert.equal(financeObservedGroups([group], [{group:'claude'},{group:'claude'}], '').length,1);
  assert.equal(financeObservedGroups([group], [{group:'claude'},{group:'claude'}], '2099-01')[0].net,10);
});
test('review numeric blank persists null and invalid amounts fail before transport', () => {
  assert.equal(financeChanges('entry',{approvedAmount:'',recoveredAmount:'0'}).changes.approvedAmount,null);
  assert.equal(financeChanges('entry',{approvedAmount:'',recoveredAmount:'0'}).changes.recoveredAmount,0);
  assert.equal(financeChanges('entry',{approvedAmount:'-1'}).ok,false);
  assert.equal(financeChanges('subscription',{amount:'1.5'}).ok,false);
});
test('only confirmed saved responses close a review and conflicts retain the draft', () => {
  assert.equal(financeSaveResult(true,{status:'saved',record:{id:'x'}}).ok,true);
  for (const status of ['preview','accepted','error','failed','conflict']) assert.equal(financeSaveResult(true,{status}).ok,false);
  assert.equal(financeSaveResult(false,{status:'saved'}).ok,false);
});

test("inner view choices use the canonical SegmentedControl key contract", () => {
  assert.deepEqual(FINANCE_VIEWS.map(v=>v.key), ["flow","subscriptions","claims"]);
});
test('company review includes newly classified expenses and keeps wallet movements separate',async()=>{
 const {financeClaimEntries}=await import('./finance-view.js');
 const rows=Array.from({length:4},(_,i)=>({id:String(i),type:i===2?'movement':'expense',claimCandidate:i===0,duplicateOf:i===3?'0':null,review:{purpose:i?'company':'unclassified'}}));
 assert.deepEqual(financeClaimEntries(rows).map(row=>row.id),['0','1']);
});

test('finance header sort cycles ascending, descending and original order',async()=>{
 const {financeNextSort}=await import('./finance-view.js');
 let sort={key:'',dir:''};
 sort=financeNextSort(sort,'net');assert.deepEqual(sort,{key:'net',dir:'asc'});
 sort=financeNextSort(sort,'net');assert.deepEqual(sort,{key:'net',dir:'desc'});
 sort=financeNextSort(sort,'net');assert.deepEqual(sort,{key:'',dir:''});
 assert.deepEqual(financeNextSort({key:'net',dir:'desc'},'date'),{key:'date',dir:'asc'});
});
test('finance numeric sorting preserves zero, puts unknown last in both directions and keeps ties stable',async()=>{
 const {financeSortRows}=await import('./finance-view.js');
 const rows=[null,9,100,0,9].map((value,index)=>({id:index,netAmount:value}));
 assert.deepEqual(financeSortRows(rows,{key:'net',dir:'asc'}).map(r=>r.id),[3,1,4,2,0]);
 assert.deepEqual(financeSortRows(rows,{key:'net',dir:'desc'}).map(r=>r.id),[2,1,4,3,0]);
 assert.deepEqual(rows.map(r=>r.id),[0,1,2,3,4]);
 assert.deepEqual(financeSortRows(rows,{key:'',dir:''}),rows);
});
test('finance contract dates and recovery remainder sort from their actual values',async()=>{
 const {financeSortRows}=await import('./finance-view.js');
 const dates=[null,'2099-02-01','2099-01-01'].map((nextDate,id)=>({id,nextDate}));
 assert.deepEqual(financeSortRows(dates,{key:'nextDate',dir:'asc'}).map(r=>r.id),[2,1,0]);
 const claims=[{id:0,review:{approvedAmount:0,recoveredAmount:null}},{id:1,review:{approvedAmount:5,recoveredAmount:6}},{id:2,review:{approvedAmount:5,recoveredAmount:2}}];
 assert.deepEqual(financeSortRows(claims,{key:'remaining',dir:'asc'}).map(r=>r.id),[1,2,0]);
});

test('monthly subscription payments use payment dates, exclude wallet and duplicates, and share one provider row',async()=>{
 const {financeSubscriptionPayments}=await import('./finance-view.js');
 const contracts=['A','B'].map(name=>({name,group:'provider'}));
 const entries=Array.from({length:4},(_,id)=>({id,group:'provider',date:id===3?'2099-02-03':'2099-01-10',type:id===1?'movement':'expense',duplicateOf:id===2?'0':null,grossAmount:10,netAmount:id===3?0:10}));
 const table=financeSubscriptionPayments(entries,contracts,['2099-01','2099-02','2099-03']);
 assert.equal(table.rows.length,1);
 assert.deepEqual(table.rows[0].names,['A','B']);
 assert.deepEqual(table.rows[0].cells.map(c=>c.net),[10,0,null]);
 assert.deepEqual(table.rows[0].cells[0].dates,['2099-01-10']);
 assert.deepEqual(table.rows[0].cells[1].dates,['2099-02-03']);
 assert.deepEqual(table.totals.map(c=>c.net),[10,0,null]);
});
test('monthly subscription table keeps unobserved contracts and respects the selected payment month',async()=>{
 const {financeSubscriptionPayments}=await import('./finance-view.js');
 const table=financeSubscriptionPayments([],[{name:'A',group:'a'}],['2099-01','2099-02'],'2099-02');
 assert.deepEqual(table.months,['2099-02']);
 assert.equal(table.rows[0].cells[0].net,null);
 assert.deepEqual(table.rows[0].cells[0].dates,[]);
 assert.equal(table.totals[0].net,null);assert.equal(table.totals[0].missingGroups,1);
});
test('subscription dates distinguish a stated multi-month review date from a confirmed future bill',async()=>{
 const {financeSubscriptionDates}=await import('./finance-view.js');
 const entries=[{group:'provider',type:'expense',date:'2099-01-31',grossAmount:20,netAmount:20}];
 const record={group:'provider',statedCycle:'3개월치 — 이후 주기 확인 필요',nextDate:null};
 const projected=financeSubscriptionDates(record,entries);
 assert.equal(projected.lastPaymentDate,'2099-01-31');
 assert.equal(projected.nextScheduleDate,'2099-04-30');
 assert.equal(projected.scheduleKind,'review');
 assert.equal(record.nextDate,null);
 assert.equal(financeSubscriptionDates({...record,nextDate:'2099-05-01'},entries).scheduleKind,'planned');
 assert.equal(financeSubscriptionDates({...record,nextDate:'2099-05-01'},entries).nextScheduleDate,'2099-05-01');
});
test('review dates require positive payment evidence and never infer a cycle from repeated charges',async()=>{
 const {financeSubscriptionDates}=await import('./finance-view.js');
 const entry={group:'provider',type:'expense',date:'2099-01-01',grossAmount:10,netAmount:0};
 assert.equal(financeSubscriptionDates({group:'provider',statedCycle:'3개월치'},[entry]).nextScheduleDate,null);
 assert.equal(financeSubscriptionDates({group:'provider',statedCycle:'미확인'},[{...entry,netAmount:10}]).nextScheduleDate,null);
 assert.equal(financeSubscriptionDates({group:'provider',statedCycle:'3개월치'},[{...entry,type:'movement',netAmount:10}]).nextScheduleDate,null);
});
test('stopped contracts retain payment history but show only an explicit resume plan',async()=>{
 const {financeSubscriptionDates,financeChanges}=await import('./finance-view.js');
 const entry={group:'provider',type:'expense',date:'2099-01-01',grossAmount:20,netAmount:20};
 const record={group:'provider',statedCycle:'3개월치',nextDate:'2099-04-01',serviceStatus:'paused',resumeDate:null};
 assert.equal(financeSubscriptionDates(record,[entry]).lastPaymentDate,'2099-01-01');
 assert.equal(financeSubscriptionDates(record,[entry]).nextScheduleDate,null);
 const resumed=financeSubscriptionDates({...record,resumeDate:'2099-05-01'},[entry]);
 assert.equal(resumed.scheduleKind,'resume');assert.equal(resumed.nextScheduleDate,'2099-05-01');
 assert.equal(financeSubscriptionDates({...record,serviceStatus:'cancelled'},[entry]).nextScheduleDate,null);
 assert.equal(financeSubscriptionDates({...record,serviceStatus:'unknown'},[entry]).scheduleKind,'planned');
 assert.deepEqual(financeChanges('subscription',{serviceStatus:'paused',resumeDate:'2099-05-01'}).changes,{serviceStatus:'paused',resumeDate:'2099-05-01'});
});
