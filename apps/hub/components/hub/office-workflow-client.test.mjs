import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createOfficeWorkflowSessions,officeWorkflowKey,readOfficeWorkflow,writeOfficeWorkflow,validWorkflowReceipt,mergeOfficeWorkflowReceipt} from './office-workflow-client.js';
const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const input={intent:'weekly_report',scope:'personal',originRef:{periodStart:'2026-09-14',periodEnd:'2026-09-20',timezone:'Asia/Seoul'}};
const answer={status:'generated',requestId:id,result:{requestId:id,scope:'personal',summary:'요약',artifact:{body:'본문'}},persistence:{persisted:true}};
test('HTTP 200 error envelope is a failed read, never an empty list',async()=>{
  const data=await readOfficeWorkflow('requests',{fetcher:async()=>({ok:true,json:async()=>({status:'error',requests:[]})})});
  assert.equal(data.status,'error');
});
test('write network interruption stays unknown and does not retry',async()=>{
  let calls=0;
  const result=await writeOfficeWorkflow('requests',{}, {requestId:id,scope:'personal',fetcher:async()=>{calls++;throw Error('network');}});
  assert.equal(result.status,'unknown');assert.equal(result.requestId,id);assert.equal(calls,1);
  const failed=await writeOfficeWorkflow(`requests/${id}/apply`,{}, {requestId:id,scope:'personal',fetcher:async()=>({ok:false,status:502,json:async()=>({status:'error'})})});
  assert.equal(failed.status,'unknown');
});
test('cross-request and cross-scope generated responses cannot enter the current result',async()=>{
  assert.equal(validWorkflowReceipt(answer,{requestId:other,scope:'personal'}),false);
  assert.equal(validWorkflowReceipt(answer,{requestId:id,scope:'classin'}),false);
  const result=await writeOfficeWorkflow('requests',{}, {requestId:other,scope:'personal',fetcher:async()=>({ok:true,json:async()=>answer})});
  assert.equal(result.status,'unknown');assert.equal(result.result,undefined);
});
test('preview and verified task application remain distinct from generated content',async()=>{
  const result=await writeOfficeWorkflow('requests',{}, {requestId:id,scope:'personal',fetcher:async()=>({ok:true,json:async()=>({status:'preview',persistence:{persisted:false}})})});
  assert.equal(result.status,'preview');assert.equal(result.requestId,id);
  assert.equal(validWorkflowReceipt({status:'saved',requestId:id},{requestId:id,scope:'personal'}),false);
  assert.equal(validWorkflowReceipt({status:'saved',requestId:id,persistence:{persisted:true},application:{state:'saved',commandId:id,entityId:id}},{requestId:id,scope:'personal'}),true);
  assert.equal(validWorkflowReceipt({...answer,result:null},{requestId:id,scope:'personal'}),false);
  assert.equal(validWorkflowReceipt({...answer,persistence:{persisted:null}},{requestId:id,scope:'personal'}),false);
});
test('late result attaches to its origin and preserves text typed while generation runs',()=>{
  const store=createOfficeWorkflowSessions();
  const a=officeWorkflowKey(input), b=officeWorkflowKey({...input,scope:'classin'});
  store.update(a,{draft:'보낸 요청',sentDraft:'보낸 요청',request:{requestId:id},pending:true});
  store.update(b,{draft:'다른 범위의 입력'});
  store.update(a,{draft:'생성 중 적은 후속 요청'});
  assert.equal(store.accept(a,id,answer),true);
  assert.equal(store.get(a).draft,'생성 중 적은 후속 요청');assert.equal(store.get(b).receipt,null);
  assert.equal(store.get(b).draft,'다른 범위의 입력');assert.equal(store.hasDrafts(),true);
  store.update(a,{request:{requestId:other}});
  assert.equal(store.accept(a,id,answer),false);
});
test('read/recovery failure retains the reviewed body and signed token until confirmed saved',()=>{
  const unsaved={...answer,status:'unsaved',recoveryToken:'signed-token',persistence:{persisted:null}};
  for(const status of ['error','unknown','running','preview','expired']) {
    const merged=mergeOfficeWorkflowReceipt(unsaved,{status,requestId:id,result:null});
    assert.equal(merged.status,'unsaved');assert.equal(merged.result.artifact.body,'본문');assert.equal(merged.recoveryToken,'signed-token');
    assert.equal(merged.capabilities.applyTask,false);
  }
  assert.deepEqual(mergeOfficeWorkflowReceipt(unsaved,answer),answer);
  const otherReceipt={status:'error',requestId:other,result:null};
  assert.deepEqual(mergeOfficeWorkflowReceipt(unsaved,otherReceipt),otherReceipt);
});
test('unsaved generated body warns before leaving even when the optional draft is empty',()=>{
  const store=createOfficeWorkflowSessions(),key=officeWorkflowKey(input);
  store.update(key,{receipt:{...answer,status:'unsaved',recoveryToken:'signed-token',persistence:{persisted:null}}});
  assert.equal(store.hasDrafts(),true);
  store.update(key,{receipt:answer});
  assert.equal(store.hasDrafts(),false);
});
test('late success clears only the sent draft and excerpt, preserving independently edited input',()=>{
  const store=createOfficeWorkflowSessions(),key=officeWorkflowKey(input);
  store.update(key,{request:{requestId:id},draft:'보낸 요청',sentDraft:'보낸 요청',sourceExcerpt:'새로 선택한 부분',sentExcerpt:'보낸 부분'});
  store.accept(key,id,answer);
  assert.equal(store.get(key).draft,'');assert.equal(store.get(key).sourceExcerpt,'새로 선택한 부분');
});
test('history selection restores only that result excerpt and invalidates a different task form',()=>{
  const store=createOfficeWorkflowSessions(),key=officeWorkflowKey(input);
  store.update(key,{receipt:answer,sourceExcerpt:'A 결과에서 고른 부분',taskFields:{id}});
  store.selectReceipt(key,{...answer,requestId:other,result:{...answer.result,requestId:other}});
  assert.equal(store.get(key).sourceExcerpt,'');assert.equal(store.get(key).taskFields,null);
  store.update(key,{sourceExcerpt:'B 결과에서 고른 부분'});
  store.selectReceipt(key,answer);
  assert.equal(store.get(key).sourceExcerpt,'A 결과에서 고른 부분');
  assert.equal(store.get(key).sourceExcerpts[other],'B 결과에서 고른 부분');
});
