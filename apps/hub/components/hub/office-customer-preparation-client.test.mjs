import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_CUSTOMER_PREPARATION_VERSION, createOfficeCustomerApproval, officeCustomerApprovalPayload } from '@com-moon/agent-contracts/office-workflow';
import { createOfficeWorkflowSessions, officeWorkflowKey, officeWorkflowGenerationRequest, validWorkflowReceipt } from './office-workflow-client.js';
import { officeCustomerInputKey, officeCustomerGenerationBlock, officeCustomerApprovalCurrent, officeCustomerStage, officeCustomerCallSummary, officeCustomerContextUpdate, CUSTOMER_PREPARATION_MESSAGE } from './office-customer-preparation-client.js';

const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const input={intent:'customer_reply',scope:'classin',originRef:{entityType:'lead',entityId:id}};
const result=()=>({status:'generated',requestId:id,resultRevision:1,scope:'classin',ownerId:'flareon',mode:'draft',participants:[],summary:'준비',artifact:{kind:'text',body:'사용 목적을 알려 주세요.'},evidence:[],uncertainties:[],sourceCheck:'none',nextStep:{kind:'create_task',label:'목적 확인',fields:{title:'목적 확인'}},context:{status:'ready',contextHash:'a'.repeat(64),asOf:'2026-10-02T00:00:00Z',missing:[]},customerPreparation:{version:OFFICE_CUSTOMER_PREPARATION_VERSION,purpose:'목적 확인',materials:[],questions:['사용 목적은 무엇인가요?']},execution:{modelCalls:2,providerRetries:0,costStatus:'unknown'}});
const state=()=>{const store=createOfficeWorkflowSessions(),key=officeWorkflowKey(input);store.update(key,{context:{status:'ready',contextHash:'a'.repeat(64)},receipt:{status:'generated',requestId:id,persistence:{persisted:true},result:result()}});return {store,key,value:()=>store.get(key)};};

test('same-customer duplicate clicks and empty revisions stop while genuine edits remain possible',()=>{
  const s=state(),first=officeCustomerInputKey(input,s.value(),'flareon');
  assert.match(officeCustomerGenerationBlock(s.value(),first),/수정할 내용/);
  s.store.update(s.key,{draft:'자료 범위를 확인해 주세요.'});
  const changed=officeCustomerInputKey(input,s.value(),'flareon');assert.equal(officeCustomerGenerationBlock(s.value(),changed),'');
  s.store.update(s.key,{lastCustomerInputKey:changed});assert.match(officeCustomerGenerationBlock(s.value(),changed),/같은 입력/);
  assert.notEqual(officeCustomerInputKey({...input,scope:'personal'},s.value(),'flareon'),changed);
  assert.notEqual(officeCustomerInputKey(input,s.value(),'umbreon'),changed);
});
test('unknown or unsaved outcomes block fresh generation and keep the original request for inspection',()=>{
  const s=state();s.store.update(s.key,{draft:'보존할 입력',request:{requestId:id}});
  for(const status of ['running','unknown','unsaved']){
    s.store.update(s.key,{receipt:{...s.value().receipt,status}});assert.match(officeCustomerGenerationBlock(s.value(),'key'),/기존 요청/);assert.equal(s.value().request.requestId,id);assert.equal(s.value().draft,'보존할 입력');
  }
  s.store.update(s.key,{receipt:{status:'error',requestId:id},pending:false});assert.equal(officeCustomerGenerationBlock(s.value(),'key'),'');
});
test('current approval is invalidated by edits, owner change, cancellation, unknown task save or changed output',async()=>{
  const s=state(),r=s.value().receipt.result,approval=await createOfficeCustomerApproval(r,{sourcesReviewed:true,questionsReviewed:true});
  s.store.update(s.key,{customerApproval:approval,customerApprovalKey:officeCustomerApprovalPayload(r)});assert.equal(officeCustomerApprovalCurrent(s.value()),true);
  for(const patch of [{draft:'수정 요청'},{ownerId:'umbreon'},{cancelledRequestId:id},{rejectedRequestId:id},{pending:true},{applicationUnknown:true},{context:{status:'ready',contextHash:'c'.repeat(64)}},{context:{status:'error'}}])assert.equal(officeCustomerApprovalCurrent({...s.value(),...patch}),false);
  assert.equal(officeCustomerApprovalCurrent({...s.value(),receipt:{...s.value().receipt,result:{...r,artifact:{kind:'text',body:'바뀐 결과'}}}}),false);
  assert.equal(officeCustomerApprovalCurrent({...s.value(),receipt:{...s.value().receipt,persistence:{persisted:null}}}),false);
});
test('unchanged source refresh retains review but changed/error source clears the old review and approval',()=>{
  const s=state();s.store.update(s.key,{reviewedSources:true,reviewedQuestions:true,customerApproval:{requestId:id},customerApprovalKey:'old'});
  assert.deepEqual(officeCustomerContextUpdate(s.value(),s.value().context),{context:s.value().context});
  for(const context of [{status:'ready',contextHash:'c'.repeat(64)},{status:'error'}]){
    const change=officeCustomerContextUpdate(s.value(),context);assert.equal(change.customerApproval,null);assert.equal(change.reviewedSources,false);assert.equal(change.reviewedQuestions,false);
  }
});
test('cancelling an in-flight revision targets the new request and late success cannot restore approval',()=>{
  const s=state();s.store.update(s.key,{request:{requestId:other},pending:true,cancelledRequestId:other});
  assert.equal(officeCustomerStage(s.value()).state,'cancelled');
  s.store.accept(s.key,other,{status:'generated',requestId:other,persistence:{persisted:true},result:{...result(),requestId:other}});
  assert.equal(s.value().cancelledRequestId,other);assert.equal(officeCustomerStage(s.value()).state,'cancelled');assert.equal(officeCustomerApprovalCurrent(s.value()),false);
});
test('switching historical results clears local review and approval without clearing typed edits',()=>{
  const s=state();s.store.update(s.key,{draft:'남겨 둔 내용',reviewedSources:true,reviewedQuestions:true,customerApproval:{requestId:id},customerApprovalKey:'old'});
  s.store.selectReceipt(s.key,{status:'generated',requestId:other,persistence:{persisted:true},result:{...result(),requestId:other}});
  assert.equal(s.value().customerApproval,null);assert.equal(s.value().reviewedSources,false);assert.equal(s.value().draft,'남겨 둔 내용');
});
test('task registration, actual entity confirmation and completed customer contact stay distinct',()=>{
  const s=state();
  assert.match(officeCustomerStage({...s.value(),pending:true,operation:'apply'}).label,/할 일 저장 요청 확인 중/);
  for(const entityConfirmed of [false,true]){
    s.store.update(s.key,{receipt:{...s.value().receipt,application:{state:'saved',commandId:id,entityId:other,entityConfirmed}}});
    const stage=officeCustomerStage(s.value());assert.equal(stage.state,entityConfirmed?'queued':'waiting');assert.doesNotMatch(stage.label,/연락 완료|업무 완료/);assert.notEqual(stage.state,'done');
  }
  s.store.update(s.key,{applicationUnknown:true,receipt:{...s.value().receipt,application:null}});assert.match(officeCustomerStage(s.value()).label,/같은 할 일 명령/);
});
test('the exact preparation version reaches generation and bad received contract/context cannot clear input',()=>{
  const s=state();s.store.update(s.key,{receipt:null,draft:''});
  const request=officeWorkflowGenerationRequest({...input,customerPreparationVersion:OFFICE_CUSTOMER_PREPARATION_VERSION},s.value(),{requestId:id,ownerId:'flareon',defaultMessage:CUSTOMER_PREPARATION_MESSAGE});
  assert.equal(request.customerPreparationVersion,OFFICE_CUSTOMER_PREPARATION_VERSION);assert.equal(request.mode,'draft');assert.deepEqual(request.participants,[]);
  const receipt={status:'generated',requestId:id,persistence:{persisted:true},result:result()};assert.equal(validWorkflowReceipt(receipt,{requestId:id,scope:'classin',request}),true);
  for(const changed of [{customerPreparation:undefined},{context:{status:'ready',contextHash:'b'.repeat(64)}}])assert.equal(validWorkflowReceipt({...receipt,result:{...result(),...changed}},{requestId:id,scope:'classin',request}),false);
});
test('measured counts and unknown billing are explicit; an uncertain outcome never invents two actual calls',()=>{
  assert.match(officeCustomerCallSummary({result:result()}),/모델 요청 시도 2회.*금액 미확인/);
  assert.match(officeCustomerCallSummary(null),/2회 예정/);
  assert.match(officeCustomerCallSummary({status:'unknown'}),/실제 호출 수·금액 미확인/);
  assert.doesNotMatch(officeCustomerCallSummary({status:'unknown'}),/0원|0회|무료/);
});
