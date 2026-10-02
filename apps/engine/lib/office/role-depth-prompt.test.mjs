import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_IDS, parseOfficeRequest } from '@com-moon/agent-contracts/office';
import { OFFICE_ROLE_DEPTH_REGISTRY, OFFICE_ROLE_DEPTH_VERSION } from '@com-moon/agent-contracts/office-role-depth';
import { buildOfficePrompt } from './prompt.ts';
import { buildOfficeReview } from './review.ts';
import { buildOfficeSpecialistPrompt } from './role-depth-prompt.ts';
import { OFFICE_ROLE_CARD_VERSION, getOfficeRoleCard } from './role-cards.ts';
import { runOfficeDiscussion } from './deliberation.ts';
import { buildOfficeWorkflowPrompt, buildOfficeWorkflowReview } from './workflow-prompt.ts';
import { parseOfficeWorkflowRequest, parseOfficeWorkflowContext } from '@com-moon/agent-contracts/office-workflow';
const context = { source: 'provided', scope: 'classin', projects: [], note: '사용자 입력만 참고' };
test('existing typed workflow draft/review now receives the selected role behavior without another model call',()=>{
  for(const ownerId of OFFICE_IDS){const request=parseOfficeWorkflowRequest({requestId:'11111111-1111-4111-8111-111111111111',intent:'freeform',ownerId,scope:'personal',mode:'draft',originRef:{},expectedContextHash:'a'.repeat(64),message:'정한 목적 범위의 원문만 준비'});const c=parseOfficeWorkflowContext({status:'ready',scope:'personal',originRef:{},originKey:'freeform:provided',facts:{provided:'합성 원문'},sourceRefs:[],missing:[],asOf:'2026-10-02T00:00:00Z',contextHash:request.expectedContextHash,capabilities:{generate:true,applyTask:false}},request);for(const prompt of [buildOfficeWorkflowPrompt(request,c),buildOfficeWorkflowReview(request,c,{summary:'초안',artifact:{kind:'text',body:'합성 초안'},evidence:[],uncertainties:[],dissent:[],nextStep:null})]){assert.ok(prompt.systemInstruction.includes(OFFICE_ROLE_DEPTH_REGISTRY[ownerId].behavior.goodJudgment));assert.ok(prompt.systemInstruction.includes(OFFICE_ROLE_DEPTH_REGISTRY[ownerId].behavior.badJudgment));assert.match(prompt.systemInstruction,/이 호출에는 도구가 없다/);assert.ok(prompt.systemInstruction.length<24000);}}
});
test('every council position and response receives only its own current behavioral depth', async () => {
  for (const ownerId of OFFICE_IDS) {
    const other = ownerId === 'eevee' ? 'vaporeon' : 'eevee';
    const request = parseOfficeRequest({ ownerId, mode: 'council', participants: [ownerId, other], scope: 'personal', message: '담당 범위의 판단만 비교해 주세요.' });
    const calls = [];
    await runOfficeDiscussion(request, { ...context, scope: 'personal' }, new AbortController().signal, async input => {
      const data = JSON.parse(input.prompt); calls.push({ input, data });
      return { ok: true, model: 'synthetic-role-check', text: JSON.stringify({ sourceIndexes: [], corrections: [], position: '제공 범위에서만 판단합니다.', evidence: [], objection: '', revisionCondition: '새 원문 확인 시 재검토합니다.', changed: false, replyTo: data.phase === 'response' ? [request.participants.find(id => id !== data.roleId)] : [], changeReason: data.phase === 'response' ? '새 사실이 없어 현재 판단을 유지합니다.' : '' }) };
    });
    assert.equal(calls.length, 4);
    for (const { input, data } of calls) {
      const role = OFFICE_ROLE_DEPTH_REGISTRY[data.roleId];
      assert.ok(input.systemInstruction.includes(OFFICE_ROLE_DEPTH_VERSION), `${ownerId}/${data.phase} depth version`);
      assert.ok(input.systemInstruction.includes(role.behavior.goodJudgment));
      assert.ok(input.systemInstruction.includes(role.behavior.badJudgment));
      assert.ok(input.systemInstruction.includes(getOfficeRoleCard(data.roleId).voice.texture));
      for (const excluded of OFFICE_IDS.filter(id => id !== data.roleId)) assert.ok(!input.systemInstruction.includes(OFFICE_ROLE_DEPTH_REGISTRY[excluded].responsibility));
      assert.equal(input.tools, undefined);
    }
  }
});
test('behavioral depth reaches both real prompt and review without changing the frozen voices', () => {
  assert.equal(OFFICE_ROLE_CARD_VERSION, '2026-09-23.v25-grounding-regression-fix');
  for (const ownerId of OFFICE_IDS) { const request = parseOfficeRequest({ ownerId, scope: 'classin', message: '이 자료에서 전문 결과를 준비해 주세요.' }); for (const result of [buildOfficePrompt(request, context), buildOfficeReview(request, context, { answer: '원문', nextAction: '추가 행동 없음.' })]) { assert.ok(result.systemInstruction.includes(OFFICE_ROLE_DEPTH_VERSION)); assert.ok(result.systemInstruction.includes(OFFICE_ROLE_DEPTH_REGISTRY[ownerId].behavior.goodJudgment)); assert.ok(result.systemInstruction.includes(OFFICE_ROLE_DEPTH_REGISTRY[ownerId].behavior.badJudgment)); assert.ok(result.systemInstruction.length < 24000); for (const otherId of OFFICE_IDS.filter(id => id !== ownerId)) assert.ok(!result.systemInstruction.includes(OFFICE_ROLE_DEPTH_REGISTRY[otherId].responsibility)); } }
});
test('specialist prompt carries only selected inputs, real persona character and explicit no-call limits', () => {
  for (const ownerId of OFFICE_IDS) { const role = OFFICE_ROLE_DEPTH_REGISTRY[ownerId], input = { version: OFFICE_ROLE_DEPTH_VERSION, taskId: 'prompt:t1', ownerId, epoch: 0, scope: 'classin', goal: '전문 초안', inputs: {}, sources: [], completionCriteria: ['원문 보존'], constraints: [] }, result = buildOfficeSpecialistPrompt(input); assert.equal(result.execution.providerCalls, 0); assert.equal(result.execution.businessWrites, false); assert.equal(result.missingInputs.length, role.inputFields.length); assert.ok(result.systemInstruction.includes(getOfficeRoleCard(ownerId).voice.character)); assert.match(result.systemInstruction, /비신뢰 자료/); assert.deepEqual(JSON.parse(result.prompt).expectedOutputKeys, role.outputFields.map(item => item.key)); assert.equal(result.systemInstruction.includes('API_KEY'), false); }
});
