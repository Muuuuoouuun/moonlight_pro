import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_CUSTOMER_PREPARATION_VERSION as version, parseOfficeWorkflowRequest, parseOfficeWorkflowContext } from '@com-moon/agent-contracts/office-workflow';
import { generateOfficeWorkflow } from './workflow-service.ts';
import { runOfficeWorkflow } from './workflow-core.ts';
import { groundOfficeCustomerPreparation } from './customer-preparation-policy.ts';

const id='11111111-1111-4111-8111-111111111111';
const request=parseOfficeWorkflowRequest({requestId:id,intent:'customer_reply',scope:'classin',originRef:{entityType:'lead',entityId:id},expectedContextHash:'a'.repeat(64),message:'확인한 원문으로 답장을 준비해 주세요.',customerPreparationVersion:version});
const context=parseOfficeWorkflowContext({status:'ready',scope:'classin',originRef:request.originRef,originKey:'customer:lead:selected',facts:{customer:{name:'테스트 고객',nextAction:'사용 목적 확인'},activities:[{body:'수업 자료의 범위를 문의함'}]},sourceRefs:[{id:'leads:selected',type:'leads',entityId:id}],missing:[],asOf:'2026-10-02T00:00:00Z',contextHash:request.expectedContextHash,capabilities:{generate:true,applyTask:true}},request);
const body=()=>({summary:'사용 목적부터 확인',artifact:{kind:'text',body:'자료의 범위를 확인하려고 합니다. 어떤 수업에서 사용하실 예정인가요?'},evidence:[{sourceRefId:'leads:selected',explanation:'선택한 고객의 기록'}],uncertainties:[],dissent:[],nextStep:{kind:'create_task',label:'사용 목적 확인',fields:{title:'자료 범위 확인'}},customerPreparation:{purpose:'고객의 사용 목적 확인',materials:[{title:'수업 소개 자료',reason:'실제 존재와 범위를 확인하고 준비'}],questions:['대상과 수업 목적을 확인해 주세요.']}});
const reply=(input,value=body())=>({ok:true,model:'test-provider',text:JSON.stringify({...value,...(input.responseJsonSchema.properties.sourceIndexes?{sourceIndexes:[0],corrections:[]}: {})})});

test('one owner makes a reviewed reply/material/questions/task bundle in exactly two calls without tools or retries',async()=>{
  const calls=[];
  const result=await generateOfficeWorkflow(request,context,async input=>{calls.push(input);assert.equal(input.tools,undefined);assert.equal(input.retries,0);assert.ok(input.responseJsonSchema.required.includes('customerPreparation'));return reply(input);});
  assert.equal(result.status,'generated');assert.equal(calls.length,2);assert.equal(calls[0].signal,calls[1].signal);assert.equal(calls[1].model,'test-provider');
  assert.match(calls[0].systemInstruction,/자료 조회 경로가 없으므로/);assert.match(calls[1].systemInstruction,/최종 편집 검수/);
  assert.deepEqual(result.execution,{modelCalls:2,providerRetries:0,costStatus:'unknown'});assert.equal(result.generation.usage,null);
  assert.equal(result.customerPreparation.materials[0].availability,'unverified');assert.equal(result.sourceCheck,'traced');
  assert.equal(result.application,undefined);assert.equal(result.customerApproval,undefined);
});
test('missing context makes zero calls, draft failures one, review failures two and secrets never enter receipts',async()=>{
  const unavailable=await generateOfficeWorkflow(request,{...context,status:'preview',capabilities:{generate:false,applyTask:false}},async()=>assert.fail('no provider'));
  assert.equal(unavailable.execution.modelCalls,0);
  const first=await generateOfficeWorkflow(request,context,async()=>({ok:false,reason:'private-provider-detail'}));
  assert.equal(first.execution.modelCalls,1);assert.equal(first.status,'error');
  let count=0;const second=await generateOfficeWorkflow(request,context,async input=>++count===1?reply(input):{ok:false,reason:'private-provider-detail'});
  assert.equal(second.execution.modelCalls,2);assert.equal(second.failure.phase,'review');assert.equal(second.artifact,undefined);
  assert.doesNotMatch(JSON.stringify([first,second]),/private-provider-detail/);
});
test('a cancelled execution stops before the second model call and never returns an unreviewed draft',async()=>{
  const controller=new AbortController();let calls=0;
  const result=await runOfficeWorkflow(request,context,{signal:controller.signal,generate:async input=>{calls++;controller.abort();return reply(input);}});
  assert.equal(calls,1);assert.equal(result.status,'error');assert.equal(result.execution.modelCalls,1);assert.equal(result.artifact,undefined);
});
test('model-supplied asset certification or approval fails the contract before any review call',async()=>{
  for(const changed of [{...body(),customerPreparation:{...body().customerPreparation,materials:[{title:'자료',reason:'확인',availability:'available'}]}},{...body(),customerApproval:{approved:true}}]){
    let calls=0;const result=await generateOfficeWorkflow(request,context,async input=>{calls++;return reply(input,changed);});
    assert.equal(calls,1);assert.equal(result.status,'error');assert.equal(result.artifact,undefined);
  }
});
test('a server-observed absence of customer words remains a required review question even when the model omits it',async()=>{
  const c={...context,missing:['recorded-customer-words-unavailable'],facts:{customer:{name:'테스트 고객'},activities:[]}};
  const answer={...body(),customerPreparation:{...body().customerPreparation,questions:[]}};
  const result=await generateOfficeWorkflow(request,c,async input=>reply(input,answer));
  assert.equal(result.status,'generated');assert.equal(result.execution.modelCalls,2);assert.match(result.customerPreparation.questions[0],/고객이 직접 말한 문의/);
  assert.equal(result.artifact.body,answer.artifact.body);assert.deepEqual(result.context.missing,c.missing);
  const grounded=groundOfficeCustomerPreparation(result,request,c);
  assert.deepEqual(groundOfficeCustomerPreparation(grounded,request,c),grounded);assert.ok(grounded.customerPreparation.questions.length<=6);
});
