import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectFinance, validateFinanceImport, validateFinanceChanges } from './finance-ledger.js';

const expense = (patch={}) => ({sourceKey:'a',source:'card',type:'expense',date:'2030-01-01',merchant:'거래',currency:'KRW',grossAmount:100,refundAmount:0,netAmount:100,movementAmount:0,duplicateOf:null,group:null,claimCandidate:false,review:{purpose:'unclassified',claimStatus:'unknown',approvedAmount:null,recoveredAmount:null},...patch});
test('expense and wallet movements are separate; linked observations are counted once',()=>{
 const a=expense(); const b=expense({sourceKey:'b',source:'pay',duplicateOf:'a'});
 const c=expense({sourceKey:'c',type:'movement',grossAmount:0,netAmount:0,movementAmount:200,walletKind:'topup'});
 const r=projectFinance([a,b,c],[],[]);
 assert.equal(r.totals.net,100); assert.equal(r.totals.duplicate,100); assert.equal(r.wallet[0].topup,200);
 assert.equal(r.entries.length,3); assert.equal(r.monthly[0].net,100);
});
test('partial refunds and negative card adjustments affect consumption once',()=>{
 const r=projectFinance([expense({grossAmount:100,refundAmount:40,netAmount:60}),expense({sourceKey:'b',grossAmount:0,refundAmount:20,netAmount:-20})],[],[]);
 assert.equal(r.totals.net,40);assert.equal(r.totals.refund,60);
});
test('unknown approval and recovery are not zero or an approved receivable',()=>{
 const r=projectFinance([expense({claimCandidate:true})],[],[]);
 assert.equal(r.totals.approved,null); assert.equal(r.totals.recovered,null); assert.equal(r.totals.claimCandidates,1);
});
test('import rejects impossible allocations, unsupported currency, dangling duplicates and duplicate keys',()=>{
 const bundle=(entries)=>({version:1,importKey:'validation',from:'2030-01-01',through:'2030-01-31',coverage:{},entries,subscriptions:[]});
 assert.equal(validateFinanceImport(bundle([expense()])).ok,true);
 for(const row of [expense({netAmount:99}),expense({currency:'USD'}),expense({duplicateOf:'missing'}),expense({date:'2030-02-31'})]) assert.equal(validateFinanceImport(bundle([row])).ok,false);
 assert.equal(validateFinanceImport(bundle([expense(),expense()])).ok,false);
});
test('subscription grouping preserves unmeasured usage and returns a shared Claude observation group',()=>{
 const subs=[{id:'pro',name:'플랜 1',group:'claude',amount:null,usageNote:null},{id:'max',name:'플랜 2',group:'claude',amount:null,usageNote:null}];
 const r=projectFinance([expense({group:'claude'})],subs,[]);
 assert.equal(r.groups[0].net,100);assert.equal(r.subscriptions[0].amount,null);assert.equal(r.subscriptions[1].amount,null);
});
test('multiple imports show the full observation period and unknown recovery counts',()=>{
 const entries=Array.from({length:2},(_,i)=>({type:'expense',date:'2026-07-01',grossAmount:1,refundAmount:0,netAmount:1,claimCandidate:true,review:{approvedAmount:i?null:0,recoveredAmount:null}}));
 const r=projectFinance(entries,[],[{from:'2026-07-01',through:'2026-07-31',createdAt:'2026-08-01',coverage:{bankAccountCollected:false}},{from:'2026-08-01',through:'2026-08-31',createdAt:'2026-09-01',coverage:{bankAccountCollected:true}}]);
 assert.equal(r.coverage.from,'2026-07-01');assert.equal(r.coverage.through,'2026-08-31');assert.equal(r.coverage.bankAccountCollected,false);assert.equal(r.totals.approved,0);assert.equal(r.totals.approvalUnknownCount,1);assert.equal(r.totals.recoveryUnknownCount,2);
});
test('subscription service state is explicit and resume dates require a stopped service',()=>{
 for(const serviceStatus of ['unknown','active','paused','cancelled']) assert.equal(validateFinanceChanges('subscription',{serviceStatus,resumeDate:null}).ok,true);
 for(const changes of [{serviceStatus:'guessed'},{serviceStatus:null},{serviceStatus:'paused',resumeDate:'2099-02-31'},{serviceStatus:'active',resumeDate:'2099-03-01'},{resumeDate:'2099-03-01'}]) assert.equal(validateFinanceChanges('subscription',changes).ok,false);
 assert.equal(validateFinanceChanges('subscription',{serviceStatus:'paused',resumeDate:'2099-03-01'}).ok,true);
 assert.equal(validateFinanceChanges('entry',{serviceStatus:'active'}).ok,false);
});
test('contract-only registration has no invented payment and requires an explicit coverage marker',()=>{
 const p={version:1,importKey:'contract:only',from:'2099-01-01',through:'2099-01-01',coverage:{contractsOnly:true},entries:[],subscriptions:[{sourceKey:'contract:1',name:'고정비'}]};
 assert.equal(validateFinanceImport(p).ok,true);
 assert.equal(validateFinanceImport({...p,coverage:{}}).ok,false);
 assert.equal(validateFinanceImport({...p,subscriptions:[]}).ok,false);
 assert.equal(validateFinanceImport({...p,entries:[expense()],from:'2030-01-01',through:'2030-01-01'}).ok,false);
 assert.equal(validateFinanceImport({...p,subscriptions:[{...p.subscriptions[0],serviceStatus:'active'}]}).ok,false);
});
test('contract-only registration does not extend payment collection coverage',()=>{
 const imports=[{from:'2099-01-01',through:'2099-01-31',createdAt:'2099-02-01',coverage:{bankAccountCollected:false,cardCollected:true}},{from:'2099-02-20',through:'2099-02-20',createdAt:'2099-02-20',coverage:{contractsOnly:true}}];
 const result=projectFinance([],[],imports);
 assert.equal(result.coverage.through,'2099-01-31');assert.equal(result.coverage.cardCollected,true);assert.equal(result.imports.length,2);
 assert.equal(projectFinance([],[],[imports[1]]).coverage,null);
});
