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
