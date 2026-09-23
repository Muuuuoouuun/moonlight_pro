import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createOfficeWorkflowSessions,officeWorkflowKey,officeWorkflowNote,readOfficeWorkflow,writeOfficeWorkflow,validWorkflowReceipt,mergeOfficeWorkflowReceipt,officeWorkflowGenerationRequest,sendOfficeWorkflow} from './office-workflow-client.js';
import {OFFICE_DISCUSSION_VERSION,parseOfficeDeliberation} from '@com-moon/agent-contracts/office';
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

test('workflow request snapshots include selected controls and keep follow-up context independent',()=>{
  const store=createOfficeWorkflowSessions(),key=officeWorkflowKey(input);
  store.update(key,{mode:'council',reviewers:['eevee'],draft:'  사용자가 쓴 원문  ',context:{contextHash:'a'.repeat(64)},deliberation:{profile:'scrutiny',warmth:2,influence:{vaporeon:2,eevee:3}}});
  const request=officeWorkflowGenerationRequest(input,store.get(key),{requestId:id,ownerId:'vaporeon',defaultMessage:'주간 정리를 작성해 주세요.'});
  assert.equal(request.message,'사용자가 쓴 원문');
  assert.deepEqual(request.participants,['vaporeon','eevee']);
  assert.equal(request.deliberation.warmth,2);
  store.update(key,{request,pending:true,sentDraft:store.get(key).draft,deliberation:{profile:'urgent'}});
  assert.equal(request.deliberation.profile,'scrutiny');
  assert.deepEqual(request.deliberation.influence,{vaporeon:2,eevee:3});
  store.accept(key,id,{status:'unknown',requestId:id});
  assert.equal(store.get(key).draft,'  사용자가 쓴 원문  ');
  store.update(key,{receipt:answer});
  const next=officeWorkflowGenerationRequest(input,store.get(key),{requestId:other,ownerId:'vaporeon',defaultMessage:'주간 정리를 작성해 주세요.'});
  assert.equal(next.parentRequestId,id);
  assert.equal(next.boundedHistory[0].text,'본문');
  assert.equal(next.deliberation.profile,'urgent');
});

test('workflow generation validates result identity and exact discussion settings before clearing input',async()=>{
  const participants=['vaporeon','eevee'];
  const deliberation=parseOfficeDeliberation({profile:'urgent',influence:{eevee:3}},participants);
  const request={...input,requestId:id,ownerId:'vaporeon',mode:'council',participants,deliberation,message:'주간 검토',expectedContextHash:'a'.repeat(64),boundedHistory:[]};
  const discussion={version:OFFICE_DISCUSSION_VERSION,settings:deliberation,modelCalls:3,turns:participants.map(ownerId=>({ownerId,round:'position',position:'확인된 기록으로 판단합니다.',evidence:['제공된 기록'],objection:'',revisionCondition:'미확인 상태가 확인되면 다시 판단합니다.',changed:false,replyTo:[],changeReason:''}))};
  const receipt={...answer,result:{...answer.result,status:'generated',ownerId:'vaporeon',mode:'council',participants,discussion}};
  const send=body=>sendOfficeWorkflow(request,{fetcher:async(_,init)=>{assert.deepEqual(JSON.parse(init.body).deliberation,deliberation);return Response.json(body);}});
  assert.equal((await send(receipt)).status,'generated');
  for(const changes of [{ownerId:'flareon'},{mode:'draft'},{participants:['vaporeon','umbreon']},{discussion:undefined},{discussion:{...discussion,settings:{...deliberation,convergence:0}}}]) {
    const rejected=await send({...receipt,result:{...receipt.result,...changes}});
    assert.equal(rejected.status,'unknown');assert.equal(rejected.result,undefined);
  }
  assert.equal(validWorkflowReceipt({...receipt,result:{...receipt.result,discussion:undefined}},{requestId:id,scope:'personal'}),true);
  assert.equal(validWorkflowReceipt({...receipt,result:{...receipt.result,discussion:{...discussion,turns:[]}}},{requestId:id,scope:'personal'}),false);
});

test('choosing saved council results restores their controls for revision without overwriting draft',()=>{
  const store=createOfficeWorkflowSessions(),key=officeWorkflowKey(input);
  const participants=['vaporeon','eevee'],deliberation=parseOfficeDeliberation({profile:'explore',challenge:3},participants);
  store.update(key,{draft:'수정할 내용',mode:'draft'});
  store.selectReceipt(key,{...answer,result:{...answer.result,ownerId:'vaporeon',mode:'council',participants,discussion:{settings:deliberation}}});
  const selected=store.get(key);
  assert.equal(selected.draft,'수정할 내용');
  assert.equal(selected.mode,'council');
  assert.deepEqual(selected.reviewers,['eevee']);
  assert.deepEqual(selected.deliberation,deliberation);
  store.update(key,{deliberation:{...deliberation,warmth:3}});
  store.selectReceipt(key,{...answer,result:{...answer.result,ownerId:'vaporeon',mode:'council',participants,discussion:{settings:deliberation}}});
  assert.equal(store.get(key).deliberation.warmth,3);
});

test('expired or failed record metadata restores controls without manufacturing a discussion',()=>{
  const store=createOfficeWorkflowSessions(),key=officeWorkflowKey(input),participants=['vaporeon','eevee'];
  const deliberation=parseOfficeDeliberation({profile:'scrutiny',influence:{eevee:3}},participants);
  const receipt={status:'expired',requestId:id,scope:'personal',ownerId:'vaporeon',mode:'council',participants,deliberation,result:null};
  assert.equal(validWorkflowReceipt(receipt,{requestId:id,scope:'personal'}),true);
  const request={requestId:id,ownerId:'vaporeon',mode:'council',participants,deliberation};
  assert.equal(validWorkflowReceipt(receipt,{requestId:id,scope:'personal',request}),true);
  assert.equal(validWorkflowReceipt({...receipt,deliberation:{...deliberation,warmth:3}},{requestId:id,scope:'personal',request}),false);
  assert.equal(validWorkflowReceipt({...receipt,deliberation:{...deliberation,challenge:8}},{requestId:id,scope:'personal'}),false);
  store.update(key,{draft:'보존할 수정 내용'});store.selectReceipt(key,receipt);
  assert.deepEqual(store.get(key).deliberation,deliberation);assert.equal(store.get(key).draft,'보존할 수정 내용');
  assert.equal(store.get(key).receipt.result,null);
});

test('a 409 context change keeps the change summary for the confirmation step', async () => {
  const requestId = crypto.randomUUID();
  const fetcher = async () => new Response(JSON.stringify({ status: 'conflict', error: 'office-context-changed', requestId, contextChange: { added: 1, updated: 2, removed: 0 } }), { status: 409 });
  const data = await writeOfficeWorkflow(`requests/${requestId}/apply`, {}, { fetcher, requestId, scope: 'personal' });
  assert.equal(data.status, 'conflict');
  assert.equal(data.error, 'office-context-changed');
  assert.deepEqual(data.contextChange, { added: 1, updated: 2, removed: 0 });
  assert.equal(officeWorkflowNote(data), 'AI 결과를 만든 뒤 새 기록 1건 · 바뀐 기록 2건이 생겼습니다. 확인한 뒤 그대로 연결할 수 있습니다.');
  assert.match(officeWorkflowNote({ status: 'conflict', error: 'office-context-changed', contextChange: { added: 0, updated: 0, removed: 0 } }), /기록 내용이 바뀌었습니다/);
});

test('a classified generation failure explains its cause in the panel note', () => {
  assert.match(officeWorkflowNote({ status: 'error', failure: { phase: 'review', category: 'deadline' } }), /제한 시간/);
  assert.match(officeWorkflowNote({ status: 'error', failure: { phase: 'review', category: 'nope' } }), /요청을 처리하지 못했습니다/);
});
