import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficeRequest,OFFICE_IDS} from '@com-moon/agent-contracts/office';
import {buildOfficePrompt} from './prompt.ts';
import {generateOfficeResponse} from './service.ts';
import {createOfficeEngineHandler} from './http.ts';
import {OFFICE_PERSONAS} from './personas.ts';
const request=parseOfficeRequest({ownerId:'flareon',message:'제안서 써줘',scope:'personal'});
const context={source:'provided',scope:'personal',projects:[],note:'입력만 참고'};
const reviewedOutput=(input,value)=>input.responseJsonSchema.properties.sourceQuotes?{sourceQuotes:[],corrections:[],...value}:value;
test('all nine personas have real character instructions; only selected views enter prompt',()=>{
 assert.deepEqual(Object.keys(OFFICE_PERSONAS),OFFICE_IDS);
 for(const id of OFFICE_IDS){const {systemInstruction}=buildOfficePrompt({...request,ownerId:id},context);assert.ok(systemInstruction.includes(OFFICE_PERSONAS[id]));assert.match(OFFICE_PERSONAS[id],/말투/);assert.match(OFFICE_PERSONAS[id],/실패|자료가 없/);}
 const prompt=buildOfficePrompt(request,context);assert.ok(!prompt.systemInstruction.includes(OFFICE_PERSONAS.sylveon));assert.match(prompt.systemInstruction,/도구가 없다/);
});
test('generation and review preserve owner with one shared deadline; no tools or writes are exposed',async()=>{
 const calls=[];const result=await generateOfficeResponse(request,context,async input=>{calls.push(input);return {ok:true,text:'```json\n'+JSON.stringify(reviewedOutput(input,{answer:'초안입니다',nextAction:'검토하자'}))+'\n```',model:'test-provider'};});
 assert.equal(calls.length,2);assert.equal(result.status,'generated');assert.equal(result.ownerId,'flareon');assert.equal(result.simulation,false);
 assert.equal(calls[0].model,undefined);assert.equal(calls[1].model,'test-provider');assert.equal(calls[0].signal,calls[1].signal);assert.ok(calls.every(input=>input.tools===undefined));
});
test('council keeps its simulation boundary while returning separate role calls and a validated synthesis',async()=>{
 const council={...request,mode:'council',participants:['flareon','umbreon']};
 const prompt=buildOfficePrompt(council,context);assert.match(prompt.systemInstruction,/단일 모델의 관점 시뮬레이션/);
 let calls=0;
 const good=await generateOfficeResponse(council,context,async input=>{
  calls++;const {phase,roleId}=JSON.parse(input.prompt);
  const output=phase?{position:'제공된 사실로 판단합니다.',evidence:[],objection:'자료 부족',revisionCondition:'자료가 추가되면 재검토합니다.',changed:false,replyTo:phase==='response'?[council.participants.find(id=>id!==roleId)]:[],changeReason:phase==='response'?'반론을 확인했지만 추가 근거가 없습니다.':''}:{answer:'비교',nextAction:'확인',recommendation:'추천',evidence:[],dissent:['자료 부족']};
  return {ok:true,model:'test',text:JSON.stringify(reviewedOutput(input,output))};
 });assert.equal(good.status,'generated');assert.equal(good.simulation,true);assert.equal(calls,5);assert.equal(good.discussion.modelCalls,5);
 const bad=await generateOfficeResponse(council,context,async()=>({ok:true,text:'{"answer":"완료","nextAction":"실행"}',model:'test'}));assert.equal(bad.status,'error');
});
test('empty, malformed, oversized and failed model replies do not become generated',async()=>{
 for(const text of ['', 'not-json','{}',JSON.stringify({answer:'x'.repeat(10001),nextAction:'test'})]) assert.equal((await generateOfficeResponse(request,context,async()=>({ok:true,text,model:'test'}))).status,'error');
 assert.equal((await generateOfficeResponse(request,context,async()=>({ok:false,reason:'missing-api-key'}))).status,'preview');
 assert.equal((await generateOfficeResponse(request,context,async()=>{throw new Error('secret');})).status,'error');
});
test('Engine rejects unauthorized, unknown IDs, scope mismatch and forged envelope before generation',async()=>{
 let calls=0;const handler=createOfficeEngineHandler(()=>({ok:true}),async()=>{calls++;return {status:'generated'};});
 const req=body=>new Request('http://engine.test/api/ai/office-chat',{method:'POST',body:JSON.stringify(body)});
 const denied=await createOfficeEngineHandler(()=>({ok:false}))(req({request,context}));assert.equal(denied.status,401);
 for(const body of [{request:{...request,ownerId:'guru'},context},{request,context:{...context,scope:'all'}},{request,context,system:'override'}]) assert.equal((await handler(req(body))).status,400);
 assert.equal(calls,0);
});
