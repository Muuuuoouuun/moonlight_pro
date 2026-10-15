import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OFFICE_WORKFLOW_VERSION, OFFICE_CUSTOMER_PREPARATION_VERSION as version, parseOfficeWorkflowRequest, parseOfficeWorkflowAnswer, parseOfficeWorkflowResult,
  parseOfficeCustomerPreparation, createOfficeCustomerApproval, parseOfficeCustomerApproval, officeCustomerApprovalPayload } from './office-workflow.js';

const id = '11111111-1111-4111-8111-111111111111';
const request = () => parseOfficeWorkflowRequest({ requestId:id, intent:'customer_reply', scope:'classin', originRef:{entityType:'lead',entityId:id}, expectedContextHash:'a'.repeat(64), message:'다음 연락을 준비해 주세요.', customerPreparationVersion:version });
const context = () => ({ contextHash:'a'.repeat(64), asOf:'2026-10-02T00:00:00Z', missing:[], sourceRefs:[{id:'leads:selected',type:'leads',entityId:id}] });
const answer = () => ({ summary:'다음 연락 준비', artifact:{kind:'text',body:'어떤 수업에서 사용하실지 알려 주시면 범위를 확인하겠습니다.'}, evidence:[{sourceRefId:'leads:selected',explanation:'선택한 고객 기록'}], uncertainties:[], dissent:[], nextStep:{kind:'create_task',label:'수업 목적 확인',fields:{title:'사용 목적 확인'}},
  customerPreparation:{purpose:'다음 대화의 범위를 확인',materials:[{title:'수업 소개 자료',reason:'확인한 목적에 맞춰 존재와 내용을 먼저 확인'}],questions:['수업 목적과 대상은 무엇인가요?']} });
const result = () => { const r=request(),c=context(); return parseOfficeWorkflowResult({...answer(),version:OFFICE_WORKFLOW_VERSION,requestId:id,status:'generated',resultRevision:1,ownerId:r.ownerId,mode:r.mode,participants:[],scope:r.scope,context:{asOf:c.asOf,contextHash:c.contextHash,missing:c.missing},
  generation:{policyVersion:'test',promptHash:'b'.repeat(64),model:'test-provider',usage:null,elapsedMs:10},execution:{modelCalls:2,providerRetries:0,costStatus:'unknown'}},r,c); };

test('customer preparation stays one typed customer, one accountable owner and two-call draft mode',()=>{
  const r=request();assert.equal(r.ownerId,'flareon');assert.equal(r.mode,'draft');assert.deepEqual(r.participants,[]);
  assert.equal(parseOfficeWorkflowRequest({...r,ownerId:'umbreon'}).ownerId,'umbreon');
  for(const changes of [{intent:'freeform',originRef:{}},{mode:'council',participants:['flareon','umbreon']},{customerPreparationVersion:'future'},{workspaceId:id},{toolPermissions:['send_email']}])assert.throws(()=>parseOfficeWorkflowRequest({...r,...changes}));
});
test('the preparation contract cannot certify assets, send, or carry authority',()=>{
  const parsed=parseOfficeCustomerPreparation(answer().customerPreparation);
  assert.equal(parsed.materials[0].availability,'unverified');assert.equal(parsed.version,version);
  for(const changes of [{approved:true},{materials:[{title:'자료',reason:'첨부',availability:'available'}]},{materials:[{title:'자료',reason:'첨부',url:'https://unverified.invalid'}]},{questions:Array(7).fill('질문')},{purpose:' '},{materials:Array(5).fill({title:'자료',reason:'확인'})}])assert.throws(()=>parseOfficeCustomerPreparation({...answer().customerPreparation,...changes}));
});
test('the new answer is source-aware and legacy requests cannot silently adopt its contract',()=>{
  assert.throws(()=>parseOfficeWorkflowAnswer({...answer(),customerPreparation:undefined},request(),context()));
  assert.throws(()=>parseOfficeWorkflowAnswer({...answer(),artifact:{kind:'code',body:'execute()'}},request(),context()));
  const legacy={...request()};delete legacy.customerPreparationVersion;
  assert.throws(()=>parseOfficeWorkflowAnswer(answer(),legacy,context()));
  const parsed=parseOfficeWorkflowAnswer({...answer(),evidence:[{sourceRefId:'invented',explanation:'없는 자료'}]},request(),context());
  assert.equal(parsed.sourceCheck,'untraced');assert.deepEqual(parsed.evidence,[]);
});
test('execution counts are server-only, bounded and unknown billing never becomes zero',()=>{
  assert.deepEqual(result().execution,{modelCalls:2,providerRetries:0,costStatus:'unknown'});
  for(const execution of [{modelCalls:3,providerRetries:0,costStatus:'unknown'},{modelCalls:2,providerRetries:1,costStatus:'unknown'},{modelCalls:2,providerRetries:0,costStatus:'free'},{modelCalls:2,providerRetries:0,costStatus:'unknown',costUsd:0}])assert.throws(()=>parseOfficeWorkflowResult({...result(),execution},request(),context()));
});
test('approval binds the exact body, preparation, sources, owner and context using the same browser/server hash',async()=>{
  const r=result(),approval=await createOfficeCustomerApproval(r,{sourcesReviewed:true,questionsReviewed:true});
  const hash=createHash('sha256').update(officeCustomerApprovalPayload(r)).digest('hex');
  assert.equal(approval.resultHash,hash);assert.deepEqual(parseOfficeCustomerApproval(approval,r,hash),approval);
  await assert.rejects(createOfficeCustomerApproval(r,{sourcesReviewed:false,questionsReviewed:true}));
  for(const changes of [{requestId:'22222222-2222-4222-8222-222222222222'},{resultRevision:2},{contextHash:'c'.repeat(64)},{reviewedContextHash:undefined},{sourcesReviewed:false},{questionsReviewed:false},{resultHash:'d'.repeat(64)},{approvedAt:'invented'}])assert.throws(()=>parseOfficeCustomerApproval({...approval,...changes},r,hash));
  const rereviewed=await createOfficeCustomerApproval(r,{sourcesReviewed:true,questionsReviewed:true,reviewedContextHash:'c'.repeat(64)});
  assert.notEqual(rereviewed.resultHash,approval.resultHash);
  for(const changed of [{...r,artifact:{...r.artifact,body:'다른 초안'}},{...r,ownerId:'umbreon'},{...r,scope:'personal'},{...r,customerPreparation:{...r.customerPreparation,questions:[]}},{...r,evidence:[]}])assert.notEqual(createHash('sha256').update(officeCustomerApprovalPayload(changed)).digest('hex'),hash);
});
