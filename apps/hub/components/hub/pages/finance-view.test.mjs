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
  assert.deepEqual(FINANCE_VIEWS.map(v=>v.key), ["flow","personal","subscriptions","claims"]);
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

test('active contracts estimate a calendar month after the last positive payment without editing the contract',async()=>{
 const {financeSubscriptionDates}=await import('./finance-view.js');
 const record={group:'provider',serviceStatus:'active',nextDate:null,cycle:null};
 const entry={group:'provider',type:'expense',date:'2099-01-31',grossAmount:10,netAmount:10};
 const result=financeSubscriptionDates(record,[entry]);
 assert.equal(result.nextScheduleDate,'2099-02-28');assert.equal(result.scheduleKind,'estimate');assert.equal(result.estimatedCycle,'monthly');
 assert.equal(record.nextDate,null);assert.equal(record.cycle,null);
 assert.equal(financeSubscriptionDates(record,[{...entry,date:'2096-01-31'}]).nextScheduleDate,'2096-02-29');
 assert.equal(financeSubscriptionDates(record,[{...entry,date:'2099-12-31'}]).nextScheduleDate,'2100-01-31');
 const refunded=financeSubscriptionDates(record,[entry,{...entry,date:'2099-02-01',netAmount:0}]);
 assert.equal(refunded.lastPaymentDate,'2099-02-01');assert.equal(refunded.nextScheduleDate,'2099-02-28');
});
test('explicit plans and known longer cycles take priority over the monthly assumption',async()=>{
 const {financeSubscriptionDates}=await import('./finance-view.js');
 const record={group:'provider',serviceStatus:'active'};
 const entries=[{group:'provider',type:'expense',date:'2099-01-31',grossAmount:10,netAmount:10}];
 const planned=financeSubscriptionDates({...record,nextDate:'2099-03-10'},entries);
 assert.equal(planned.nextScheduleDate,'2099-03-10');assert.equal(planned.scheduleKind,'planned');
 assert.equal(financeSubscriptionDates({...record,cycle:'quarterly'},entries).nextScheduleDate,'2099-04-30');
 assert.equal(financeSubscriptionDates({...record,cycle:'annual'},entries).nextScheduleDate,'2100-01-31');
 assert.equal(financeSubscriptionDates({...record,statedCycle:'1년 이용'},entries).nextScheduleDate,'2100-01-31');
});
test('the initial multi-month term is preserved while a later payment gets a monthly estimate',async()=>{
 const {financeSubscriptionDates}=await import('./finance-view.js');
 const record={group:'provider',serviceStatus:'active',statedCycle:'3개월치 — 이후 주기 확인 필요'};
 const first={group:'provider',type:'expense',date:'2099-01-31',grossAmount:10,netAmount:10};
 const initial=financeSubscriptionDates(record,[first]);
 assert.equal(initial.nextScheduleDate,'2099-04-30');assert.equal(initial.scheduleKind,'review');
 const later=financeSubscriptionDates(record,[first,{...first,date:'2099-04-30'}]);
 assert.equal(later.nextScheduleDate,'2099-05-30');assert.equal(later.scheduleKind,'estimate');
});
test('monthly estimates need active status and positive nonduplicate expense evidence',async()=>{
 const {financeSubscriptionDates}=await import('./finance-view.js');
 const record={group:'provider',serviceStatus:'active'};
 const entry={group:'provider',type:'expense',date:'2099-01-01',grossAmount:10,netAmount:10};
 for(const serviceStatus of ['unknown','paused','cancelled',undefined]) assert.equal(financeSubscriptionDates({...record,serviceStatus},[entry]).nextScheduleDate,null);
 for(const rows of [[],[{...entry,netAmount:0}],[{...entry,duplicateOf:'another'}],[{...entry,type:'movement'}]]) assert.equal(financeSubscriptionDates(record,rows).nextScheduleDate,null);
});

test('gauge labels: company purpose wins, contract groups read as subscription, unknown stays unclassified',async()=>{
 const {financeLabelOf,financeSpendEntries}=await import('./finance-view.js');
 const groups=new Set(['gpt']);
 assert.equal(financeLabelOf({group:'gpt',review:{purpose:'company'}},groups),'company');
 assert.equal(financeLabelOf({group:'gpt',review:{purpose:'unclassified'}},groups),'subscription');
 assert.equal(financeLabelOf({review:{purpose:'business'}},groups),'personal');
 assert.equal(financeLabelOf({review:{}},groups),'unclassified');
 const rows=[{type:'expense',netAmount:5},{type:'movement',netAmount:0},{type:'expense',duplicateOf:'x',netAmount:5},{type:'expense',netAmount:null}];
 assert.equal(financeSpendEntries(rows).length,1);
});
test('observed days mark the month the coverage ends inside as partial',async()=>{
 const {financeObservedDays}=await import('./finance-view.js');
 assert.deepEqual(financeObservedDays('2099-10','2099-10-17'),{observed:17,days:31,partial:true});
 assert.deepEqual(financeObservedDays('2099-09','2099-10-17'),{observed:30,days:30,partial:false});
 assert.equal(financeObservedDays('2099-11','2099-10-17').observed,0);
});
test('range gauge ends at the series max with average and previous-month ticks, and never invents a current month',async()=>{
 const {financeRangeGauge}=await import('./finance-view.js');
 const series=[['2099-05',100],['2099-06',200],['2099-07',400],['2099-08',null],['2099-09',300],['2099-10',150]].map(([month,value])=>({month,value}));
 const gauge=financeRangeGauge(series,'2099-10');
 assert.equal(gauge.max,400);assert.equal(gauge.maxMonth,'2099-07');
 assert.equal(gauge.avg,250);assert.equal(gauge.prev.month,'2099-09');
 assert.equal(gauge.fill,0.375);assert.equal(gauge.prevAt,0.75);
 assert.equal(gauge.columns.length,5);assert.equal(gauge.columns.at(-1).current,true);
 assert.equal(financeRangeGauge(series,'2099-12'),null);
});
test('daily stacks split by label and the running total paces against the previous month',async()=>{
 const {financeDailyStacks,financeCumulative}=await import('./finance-view.js');
 const spend=[{date:'2099-10-01',netAmount:30,l:'personal'},{date:'2099-10-01',netAmount:10,l:'company'},{date:'2099-10-03',netAmount:20,l:'unclassified'}];
 const daily=financeDailyStacks(spend,'2099-10',e=>e.l,3);
 assert.equal(daily.days.length,31);assert.equal(daily.max,40);
 assert.deepEqual([daily.days[0].parts.personal,daily.days[0].parts.company,daily.days[0].total],[30,10,40]);
 assert.equal(daily.days[3].observed,false);
 const cum=financeCumulative(spend,'2099-10','2099-10-01',300);
 assert.equal(cum.value,40);assert.equal(cum.paceValue,10);
 assert.equal(financeCumulative(spend,'2099-10','2099-10-03',null).paceValue,null);
});
test('label progress counts amount and cells, and top places keep one segment per payment',async()=>{
 const {financeLabelProgress,financeTopMerchants}=await import('./finance-view.js');
 const spend=[{netAmount:60,l:'personal'},{netAmount:40,l:'unclassified'}];
 const progress=financeLabelProgress(spend,e=>e.l);
 assert.equal(progress.done,1);assert.equal(progress.amountShare,0.6);assert.deepEqual(progress.cells,['personal','unclassified']);
 const top=financeTopMerchants([{merchant:'A',netAmount:5},{merchant:'B',netAmount:20},{merchant:'A',netAmount:5},{merchant:'C',netAmount:-3}]);
 assert.deepEqual(top.map(row=>[row.name,row.payments.length,row.width]),[['B',1,1],['A',2,0.5]]);
});
test('fixed cost counts only active monthly KRW contracts with a confirmed amount',async()=>{
 const {financeFixedCosts}=await import('./finance-view.js');
 const fixed=financeFixedCosts([
  {id:'a',name:'A',serviceStatus:'active',cycle:'monthly',currency:'KRW',amount:100,purpose:'company'},
  {id:'b',name:'B',serviceStatus:'active',cycle:'annual',currency:'KRW',amount:500},
  {id:'c',name:'C',serviceStatus:'paused',cycle:'monthly',currency:'KRW',amount:50},
  {id:'d',name:'D',serviceStatus:'active',cycle:'monthly',currency:'KRW',amount:null},
 ]);
 assert.equal(fixed.total,100);assert.equal(fixed.count,1);assert.equal(fixed.segments[0].claim,true);
});
test('billing cycle gauge needs an active contract with both dates and marks payments within three weeks',async()=>{
 const {financeCycleGauge}=await import('./finance-view.js');
 const gauge=financeCycleGauge({serviceStatus:'active',lastPaymentDate:'2099-10-15',nextScheduleDate:'2099-11-15',scheduleKind:'estimate'},'2099-10-18');
 assert.deepEqual([gauge.span,gauge.left,gauge.soon],[31,28,false]);
 assert.equal(financeCycleGauge({serviceStatus:'active',lastPaymentDate:'2099-10-08',nextScheduleDate:'2099-11-08',scheduleKind:'estimate'},'2099-10-18').soon,true);
 assert.equal(financeCycleGauge({serviceStatus:'paused',lastPaymentDate:'2099-10-09',nextScheduleDate:'2099-11-09'},'2099-10-18'),null);
 assert.equal(financeCycleGauge({serviceStatus:'active',lastPaymentDate:'2099-10-09',nextScheduleDate:null},'2099-10-18'),null);
});
