import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficeRequest,OFFICE_IDS} from '@com-moon/agent-contracts/office';
import {buildOfficePrompt} from './prompt.ts';
import {generateOfficeResponse} from './service.ts';
import {createOfficeEngineHandler} from './http.ts';
import {OFFICE_PERSONAS} from './personas.ts';
import {reportOfficeDiagnostic} from './deliberation.ts';
const request=parseOfficeRequest({ownerId:'flareon',message:'제안서 써줘',scope:'personal'});
const context={source:'provided',scope:'personal',projects:[],note:'입력만 참고'};
const reviewedOutput=(input,value)=>input.responseJsonSchema.properties.sourceIndexes?{sourceIndexes:[],corrections:[],...value}:value;
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

const diagnosticAnswer = { answer: '공개 답변입니다.', nextAction: '추가 행동 없음.' };
const diagnosticReply = (input, patch = {}) => ({ ok: true, model: 'test-provider', text: JSON.stringify({ ...reviewedOutput(input, diagnosticAnswer), ...patch }) });

test('draft and review diagnostics separate provider, JSON, source and contract failures without leaking content', async () => {
  const failures = [
    ['draft', 'provider'], ['draft', 'thrown-provider'], ['draft', 'json'], ['draft', 'contract'],
    ['review', 'provider'], ['review', 'thrown-provider'], ['review', 'json'], ['review', 'source-review'], ['review', 'contract'], ['review', 'model-mismatch'],
  ];
  for (const [failedPhase, failure] of failures) {
    const events = [], calls = [];
    const result = await generateOfficeResponse(request, context, async input => {
      calls.push(input);
      const phase = calls.length === 1 ? 'draft' : 'review';
      if (phase !== failedPhase) return diagnosticReply(input);
      if (failure === 'provider') return { ok: false, reason: 'PRIVATE_PROVIDER_DETAIL' };
      if (failure === 'thrown-provider') throw new Error('PRIVATE_PROVIDER_EXCEPTION');
      if (failure === 'json') return { ...diagnosticReply(input), text: '{"PRIVATE_UNFINISHED_JSON"' };
      if (failure === 'source-review') return diagnosticReply(input, { sourceIndexes: ['PRIVATE_UNTRACEABLE_QUOTE'] });
      if (failure === 'contract') return diagnosticReply(input, { answer: ['PRIVATE_INVALID_ANSWER'] });
      return { ...diagnosticReply(input), model: 'PRIVATE_DIFFERENT_MODEL' };
    }, event => events.push(event));
    assert.deepEqual(events, [{ phase: failedPhase, category: failure === 'thrown-provider' ? 'provider' : failure, ownerId: request.ownerId }]);
    assert.equal(result.status, 'error');
    assert.equal(calls.length, failedPhase === 'draft' ? 1 : 2);
    assert.equal(result.answer, undefined);
    assert.equal(result.diagnostics, undefined);
    assert.doesNotMatch(JSON.stringify({ events, result }), /PRIVATE_/);
  }
});

test('diagnostics do not change public envelopes when callbacks throw or reject', async () => {
  for (const failure of ['json', 'missing-api-key', 'review-contract']) {
    const makeProvider = () => {
      let calls = 0;
      return async input => {
        calls++;
        if (failure === 'missing-api-key') return { ok: false, reason: 'missing-api-key' };
        if (failure === 'json') return { ok: true, model: 'test-provider', text: '{invalid' };
        return calls === 1 ? diagnosticReply(input) : diagnosticReply(input, { nextAction: null });
      };
    };
    const expected = await generateOfficeResponse(request, context, makeProvider());
    for (const observer of [() => { throw new Error('PRIVATE_OBSERVER'); }, async () => { throw new Error('PRIVATE_ASYNC_OBSERVER'); }]) {
      assert.deepEqual(await generateOfficeResponse(request, context, makeProvider(), observer), expected);
    }
  }
  const events = [];
  const generated = await generateOfficeResponse(request, context, async input => diagnosticReply(input), event => events.push(event));
  assert.equal(generated.status, 'generated');
  assert.deepEqual(events, []);
  assert.equal(generated.diagnostics, undefined);
});

test('shared deadline diagnostics retain the failing draft or review phase and original 48-second budget', async t => {
  let deadline;
  const budgets = [];
  t.mock.method(AbortSignal, 'timeout', milliseconds => { budgets.push(milliseconds); return deadline.signal; });
  for (const failedPhase of ['draft', 'review']) {
    deadline = new AbortController();
    const events = [], calls = [];
    const result = await generateOfficeResponse(request, context, async input => {
      calls.push(input);
      if ((calls.length === 1 ? 'draft' : 'review') === failedPhase) deadline.abort(new DOMException('PRIVATE_DEADLINE_REASON', 'TimeoutError'));
      return diagnosticReply(input);
    }, event => events.push(event));
    assert.deepEqual(events, [{ phase: failedPhase, category: 'deadline', ownerId: request.ownerId }]);
    assert.equal(result.status, 'error');
    assert.equal(calls.length, failedPhase === 'draft' ? 1 : 2);
    assert.ok(calls.every(input => input.signal === deadline.signal));
    assert.doesNotMatch(JSON.stringify({ events, result }), /PRIVATE_/);
  }
  assert.deepEqual(budgets, [48_000, 48_000]);
});

test('diagnostic observers receive only allowed enums and registered role IDs', () => {
  const events = [], observer = event => events.push(event);
  reportOfficeDiagnostic(observer, { phase: 'review', category: 'contract', ownerId: 'PRIVATE_UNKNOWN_ROLE', error: 'PRIVATE_ERROR', text: 'PRIVATE_TEXT' });
  reportOfficeDiagnostic(observer, { phase: 'PRIVATE_PHASE', category: 'contract', ownerId: 'flareon' });
  reportOfficeDiagnostic(observer, { phase: 'draft', category: 'PRIVATE_CATEGORY', ownerId: 'flareon' });
  reportOfficeDiagnostic(observer, { phase: 'response', category: 'json', ownerId: 'umbreon', credentials: 'PRIVATE_CREDENTIALS' });
  assert.deepEqual(events, [{ phase: 'review', category: 'contract' }, { phase: 'response', category: 'json', ownerId: 'umbreon' }]);
});
test('a generated chat answer reports elapsed time, model calls and summed usage',async()=>{
 const usageMetadata={promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:130};
 const result=await generateOfficeResponse(request,context,async input=>({ok:true,text:JSON.stringify(reviewedOutput(input,{answer:'초안입니다',nextAction:'검토하자'})),model:'test-provider',usageMetadata}));
 assert.equal(result.status,'generated');
 assert.equal(result.generation.modelCalls,2);
 assert.ok(Number.isInteger(result.generation.elapsedMs)&&result.generation.elapsedMs>=0);
 assert.deepEqual(result.generation.usage,{promptTokens:200,outputTokens:40,totalTokens:260});
});
test('Engine returns the first classified failure with an operator message, never provider text',async()=>{
 const handler=createOfficeEngineHandler(()=>({ok:true}),async(_request,_context,_provider,onDiagnostic)=>{onDiagnostic({phase:'review',category:'deadline'});onDiagnostic({phase:'synthesis',category:'provider'});return {status:'error',error:'secret provider detail'};});
 const response=await handler(new Request('http://engine.test/api/ai/office-chat',{method:'POST',body:JSON.stringify({request,context})}));
 assert.equal(response.status,502);
 const data=await response.json();
 assert.deepEqual(data.failure,{phase:'review',category:'deadline'});
 assert.match(data.error,/제한 시간/);
 assert.doesNotMatch(JSON.stringify(data),/secret provider detail/);
});
