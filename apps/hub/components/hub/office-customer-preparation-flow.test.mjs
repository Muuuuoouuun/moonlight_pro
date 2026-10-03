import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { OFFICE_CUSTOMER_PREPARATION_VERSION, createOfficeCustomerApproval, officeCustomerApprovalPayload } from '@com-moon/agent-contracts/office-workflow';
import { createOfficeWorkflowSessions, officeWorkflowKey, officeWorkflowGenerationRequest, officeWorkflowNote, loadOfficeWorkflowOrigin as loadOrigin, readOfficeWorkflowSelection as readSelection } from './office-workflow-client.js';
import { CUSTOMER_PREPARATION_MESSAGE, officeCustomerInputKey, officeCustomerGenerationBlock, officeCustomerApprovalCurrent, officeCustomerContextUpdate, officeCustomerStage } from './office-customer-preparation-client.js';

// Exercise the actual UI event handlers with test-only transports. No component
// implementation is copied; browser visual QA remains a separate check.
const source=await readFile(new URL('./office-workflow-panel.jsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('panel.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
const workflow=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='WorkflowForOrigin');
const names=['cancelCustomer','approveCustomer','rejectCustomer','inspect','load','generate','openTask','apply','saveTask'];
const declarations=workflow.body.statements.filter(statement=>ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(node=>names.includes(node.name.getText(ast))));
assert.equal(declarations.length,names.length);
const compiled=ts.transpileModule(declarations.map(node=>node.getText(ast)).join('\n')+'\nreturn {'+names.join(',')+'};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const id='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222';
const input={intent:'customer_reply',scope:'classin',originRef:{entityType:'lead',entityId:id}};

function harness({generateResponse,applyResponse,initialRequestId,readResponse}={}) {
  const store=createOfficeWorkflowSessions(),sessionKey=officeWorkflowKey(input)+(initialRequestId?`:request:${initialRequestId}`:''),calls={generate:[],apply:[],reads:[],projects:0,events:0},receipts=new Map();
  store.update(sessionKey,{open:true,context:{status:'ready',contextHash:'a'.repeat(64),capabilities:{generate:true}},draft:'수업 목적을 확인하고 다음 연락을 준비해 주세요.'});
  const value=()=>store.get(sessionKey),patch=changes=>store.update(sessionKey,changes);
  let fetchedContext=structuredClone(value().context);
  const loadTicket={current:0};
  const generated=request=>({status:'generated',requestId:request.requestId,...input,persistence:{persisted:true},capabilities:{applyTask:true},result:{status:'generated',requestId:request.requestId,resultRevision:1,ownerId:request.ownerId,scope:request.scope,mode:'draft',participants:[],summary:'사용 목적 확인',artifact:{kind:'text',body:'대상 수업과 사용 목적을 알려 주시면 확인하겠습니다.'},evidence:[],uncertainties:[],sourceCheck:'none',nextStep:{kind:'create_task',label:'목적 확인',fields:{title:'고객의 사용 목적 확인',description:'확인된 기록의 범위에서 문의',nextAction:'다음 연락'}},context:{contextHash:request.expectedContextHash,asOf:'2026-10-02T00:00:00Z',missing:[]},customerPreparation:{version:OFFICE_CUSTOMER_PREPARATION_VERSION,purpose:'사용 목적 확인',materials:[],questions:['사용 목적은 무엇인가요?']},execution:{modelCalls:2,providerRetries:0,costStatus:'unknown'}}});
  const readOfficeWorkflow=async path=>{
    calls.reads.push(path);
    const data=path.startsWith('context?')?structuredClone(fetchedContext):path.startsWith('requests/')?receipts.get(path.slice('requests/'.length)):({status:'ready',requests:[]});
    return readResponse?readResponse(path,data):data;
  };
  const fetcher=async url=>Response.json(await readOfficeWorkflow(url.slice('/api/hub/office/'.length)));
  const loadOfficeWorkflowOrigin=(input,options)=>loadOrigin(input,{...options,fetcher});
  const readOfficeWorkflowSelection=(id,input,options)=>readSelection(id,input,{...options,fetcher});
  const sendOfficeWorkflow=async request=>{calls.generate.push(request);const data=generateResponse?await generateResponse(request,generated(request)):generated(request);receipts.set(request.requestId,data);return data;};
  const writeOfficeWorkflow=async(path,body)=>{calls.apply.push({path,body});return applyResponse?applyResponse(path,body,calls.apply.length):{status:'saved',requestId:value().receipt.requestId,persistence:{persisted:true},application:{state:'saved',commandId:id,entityId:projectId,entityConfirmed:true},capabilities:{applyTask:false}};};
  const handlers=()=>{
    const state=value(),receipt=state.receipt,result=receipt?.result;
    const deps={store,sessionKey,patch,state,receipt,result,input,scope:'classin',intent:'customer_reply',isCustomer:true,ownerId:state.ownerId||'flareon',
      hasApplication:Boolean(receipt?.application?.commandId),crypto:globalThis.crypto,CUSTOMER_PREPARATION_MESSAGE,OFFICE_CUSTOMER_PREPARATION_VERSION,
      officeCustomerInputKey,officeCustomerGenerationBlock,officeCustomerApprovalCurrent,officeCustomerContextUpdate,createOfficeCustomerApproval,officeCustomerApprovalPayload,loadTicket,
      officeWorkflowGenerationRequest,officeWorkflowNote,readOfficeWorkflow,readOfficeWorkflowSelection,loadOfficeWorkflowOrigin,initialRequestId,sendOfficeWorkflow,writeOfficeWorkflow,query:'test',initialMessage:{},
      fetch:async()=>{calls.projects++;return {ok:true,json:async()=>({status:'live',projects:[{id:projectId,name:'검증용 프로젝트',orgScope:'classin'}]})};},
      window:{dispatchEvent(){calls.events++;}},Event,onTaskCreated(){}};
    return new Function(...Object.keys(deps),compiled)(...Object.values(deps));
  };
  return {store,sessionKey,patch,value,handlers,calls,generated,setReadReceipt:data=>receipts.set(data.requestId,data),setFetchedContext:value=>{fetchedContext=value;}};
}

test('the actual UI follows customer -> owner -> reviewed draft -> explicit approval -> confirmed task, with no automatic task creation',async()=>{
  const h=harness();await h.handlers().generate();
  assert.equal(h.calls.generate.length,1);assert.equal(h.calls.generate[0].ownerId,'flareon');assert.deepEqual(h.calls.generate[0].participants,[]);assert.equal(h.calls.apply.length,0);assert.equal(h.value().draft,'');
  await h.handlers().openTask();assert.equal(h.calls.projects,0);
  await h.handlers().approveCustomer();assert.equal(h.value().customerApproval,null);
  h.patch({reviewedSources:true,reviewedQuestions:true});await h.handlers().approveCustomer();assert.equal(officeCustomerApprovalCurrent(h.value()),true);assert.equal(h.calls.apply.length,0);
  await h.handlers().openTask();assert.equal(h.calls.projects,1);assert.equal(h.value().taskFields.projectId,'');
  h.patch({taskFields:{...h.value().taskFields,projectId}});
  const saved=await h.handlers().saveTask();assert.equal(saved.ok,true);assert.equal(h.calls.apply.length,1);assert.equal(h.calls.apply[0].body.customerApproval.resultHash,h.value().customerApproval.resultHash);assert.equal(h.calls.events,1);
  assert.equal(h.value().receipt.application.entityConfirmed,true);assert.equal(h.value().receipt.application.state,'saved');
});
test('rapid double generation starts one request and cancelling it prevents approval after late success',async()=>{
  let resolve;const gate=new Promise(done=>resolve=done);
  const h=harness({generateResponse:async(_request,result)=>{await gate;return result;}});
  const first=h.handlers().generate();await h.handlers().generate();assert.equal(h.calls.generate.length,1);
  h.handlers().cancelCustomer();assert.equal(h.value().cancelledRequestId,h.calls.generate[0].requestId);
  resolve();await first;h.patch({reviewedSources:true,reviewedQuestions:true});await h.handlers().approveCustomer();await h.handlers().openTask();
  assert.equal(h.value().customerApproval,null);assert.equal(h.calls.projects,0);assert.equal(h.calls.apply.length,0);
});
test('unknown task save reuses the same exact approved payload and cancellation cannot imply the dispatched command stopped',async()=>{
  const h=harness({applyResponse:async(_path,_body,count)=>count===1?{status:'unknown',requestId:id}:{status:'saved',persistence:{persisted:true},application:{state:'saved',commandId:id,entityId:projectId,entityConfirmed:false},capabilities:{applyTask:false}}});
  await h.handlers().generate();h.patch({reviewedSources:true,reviewedQuestions:true});await h.handlers().approveCustomer();await h.handlers().openTask();h.patch({taskFields:{...h.value().taskFields,projectId}});
  assert.equal((await h.handlers().saveTask()).ok,false);assert.equal(h.value().applicationUnknown,true);
  h.handlers().cancelCustomer();assert.equal(h.value().cancelledRequestId,null);
  await h.handlers().apply(h.value().applyInput);
  assert.deepEqual(h.calls.apply[1].body.fields,h.calls.apply[0].body.fields);assert.deepEqual(h.calls.apply[1].body.customerApproval,h.calls.apply[0].body.customerApproval);
  assert.equal(h.value().receipt.application.entityConfirmed,false);assert.equal(h.calls.generate.length,1);
});

test('refreshing changed source through the actual load handler clears approval and the next approval binds both source snapshots',async()=>{
  const h=harness();await h.handlers().generate();h.patch({reviewedSources:true,reviewedQuestions:true});await h.handlers().approveCustomer();assert.equal(officeCustomerApprovalCurrent(h.value()),true);
  h.setFetchedContext({...h.value().context,contextHash:'c'.repeat(64)});await h.handlers().load();
  assert.equal(h.value().customerApproval,null);assert.equal(h.value().reviewedSources,false);assert.equal(h.value().reviewedQuestions,false);assert.equal(officeCustomerApprovalCurrent(h.value()),false);
  h.patch({reviewedSources:true,reviewedQuestions:true});await h.handlers().approveCustomer();
  assert.equal(h.value().customerApproval.contextHash,'a'.repeat(64));assert.equal(h.value().customerApproval.reviewedContextHash,'c'.repeat(64));assert.equal(officeCustomerApprovalCurrent(h.value()),true);
  assert.equal(h.calls.generate.length,1);assert.equal(h.calls.apply.length,0);
});
test('human rejection keeps the source/result and requires an edited request plus a new review, without creating work',async()=>{
  const h=harness();await h.handlers().generate();const rejectedId=h.value().receipt.requestId;h.handlers().rejectCustomer();
  assert.equal(h.value().rejectedRequestId,rejectedId);assert.match(officeCustomerStage(h.value()).label,/초안 반려/);
  h.patch({reviewedSources:true,reviewedQuestions:true});await h.handlers().approveCustomer();await h.handlers().openTask();assert.equal(h.value().customerApproval,null);assert.equal(h.calls.apply.length,0);
  h.patch({draft:'확답 대신 사용 목적을 확인하는 질문으로 바꿔 주세요.'});await h.handlers().generate();
  assert.notEqual(h.value().receipt.requestId,rejectedId);assert.equal(h.value().rejectedRequestId,null);assert.equal(h.value().reviewedSources,false);assert.equal(h.calls.generate.length,2);assert.equal(h.calls.apply.length,0);
});

export { harness as createOfficeCustomerUiTestHarness };

function linkedHarness(options={}) {
  const h=harness({initialRequestId:id,...options});
  h.setReadReceipt(h.generated({requestId:id,ownerId:'flareon',scope:'classin',expectedContextHash:'a'.repeat(64)}));
  return h;
}
test('a linked request is the first selection only; refresh and preserved session keep the explicitly generated revision',async()=>{
  const h=linkedHarness();await h.handlers().load();assert.equal(h.value().receipt.requestId,id);assert.equal(h.calls.generate.length,0);
  h.patch({draft:'사용 목적 질문을 수정해 주세요.'});await h.handlers().generate();const revision=h.value().receipt.requestId;assert.notEqual(revision,id);
  await h.handlers().load();assert.equal(h.value().receipt.requestId,revision);
  await h.handlers().load();assert.equal(h.value().receipt.requestId,revision);assert.equal(h.calls.apply.length,0);
});
test('a linked request refresh keeps an explicitly selected history receipt',async()=>{
  const h=linkedHarness();await h.handlers().load();
  h.setReadReceipt(h.generated({requestId:projectId,ownerId:'flareon',scope:'classin',expectedContextHash:'a'.repeat(64)}));
  await h.handlers().inspect(projectId);assert.equal(h.value().receipt.requestId,projectId);
  await h.handlers().load();assert.equal(h.value().receipt.requestId,projectId);assert.equal(h.calls.generate.length,0);
});
test('a late linked refresh cannot overwrite a subsequent history selection or a cancelled generated revision',async()=>{
  let resolve,started,block=false;const gate=new Promise(done=>resolve=done),reading=new Promise(done=>started=done);
  const h=linkedHarness({readResponse:async(path,data)=>{if(block&&path===`requests/${id}`){started();await gate;}return data;}});
  await h.handlers().load();block=true;const loading=h.handlers().load();await reading;
  h.setReadReceipt(h.generated({requestId:projectId,ownerId:'flareon',scope:'classin',expectedContextHash:'a'.repeat(64)}));
  await h.handlers().inspect(projectId);h.patch({draft:'명확한 확인 질문으로 수정해 주세요.'});await h.handlers().generate();
  const revision=h.value().receipt.requestId;h.handlers().cancelCustomer();resolve();await loading;
  assert.equal(h.value().receipt.requestId,revision);assert.equal(h.value().cancelledRequestId,revision);assert.equal(h.calls.apply.length,0);
  assert.match(h.value().note,/취소/);
});
test('the first linked restore cannot replace history selected while its read is still in flight',async()=>{
  let resolve,started;const gate=new Promise(done=>resolve=done),reading=new Promise(done=>started=done);
  const h=linkedHarness({readResponse:async(path,data)=>{if(path===`requests/${id}`){started();await gate;}return data;}});
  const loading=h.handlers().load();await reading;
  h.setReadReceipt(h.generated({requestId:projectId,ownerId:'flareon',scope:'classin',expectedContextHash:'a'.repeat(64)}));
  await h.handlers().inspect(projectId);resolve();await loading;
  assert.equal(h.value().receipt.requestId,projectId);assert.equal(h.calls.generate.length,0);assert.equal(h.calls.apply.length,0);
});
