import assert from 'node:assert/strict';
import { test } from 'node:test';
const module = await import('./discovery.js').catch(() => ({}));
const id = '33333333-3333-4333-8333-333333333333';
const input = { id, requestId:id, expectedRevision:0, title:'새 가능성',orgScope:'personal',discoveryMode:'capture',status:'captured',evidence:'',hypothesis:'',experiment:'',findings:'',decisionReason:'',resumeCondition:'',reviewDate:null,links:[] };
test('complete minimal discovery snapshots validate without inventing evidence', () => {
 assert.equal(typeof module.validateDiscoveryInput,'function');
 assert.deepEqual(module.validateDiscoveryInput(input),{ok:true,value:input});
});
test('discovery stages require evidence of a real connection, closure reason or revisit plan', () => {
 for(const patch of [{title:'  '},{title:'x'.repeat(301)},{evidence:'x'.repeat(4001)},{status:'connected'},{status:'connected',links:[{type:'task',id}]},{status:'paused'},{status:'closed'},{reviewDate:'2026-02-30'},{expectedRevision:-1},{links:[{type:'unknown',id}]}]) assert.equal(module.validateDiscoveryInput({...input,...patch}).ok,false,JSON.stringify(patch));
 for(const patch of [{status:'connected',links:[{type:'project',id}]},{status:'paused',resumeCondition:'고객 답변 도착'},{status:'paused',reviewDate:'2026-09-20'},{status:'closed',decisionReason:'수요 없음'}]) assert.equal(module.validateDiscoveryInput({...input,...patch}).ok,true);
});
test('partial snapshots, duplicate targets and null-id edits are rejected', () => {
 const partial={...input};delete partial.findings;
 for(const value of [partial,null,[],{...input,id:null,expectedRevision:1},{...input,links:[{type:'lead',id},{type:'lead',id}]}]) assert.equal(module.validateDiscoveryInput(value).ok,false);
});
