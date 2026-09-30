import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateResearchUsage, researchEditorialIdentity } from './research-editorial.ts';

test('two actual model usages sum thinking and complete token counts without exposing provider output',()=>{
  const result=aggregateResearchUsage([
    {stage:'writer',generated:{ok:true,model:'gemini-test',text:'private generated text',usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,totalTokenCount:35,rawPrompt:'private prompt'}}},
    {stage:'review',generated:{ok:false,model:'gemini-test',failureCategory:'incomplete-output',text:'private rejected text',usageMetadata:{promptTokenCount:40,candidatesTokenCount:50,thoughtsTokenCount:6,totalTokenCount:96},error:{message:'private error'}}},
  ]);
  assert.equal(result.model,'gemini-test');assert.equal(result.usage.modelCalls,2);assert.equal(result.usage.totalTokenCount,131);assert.equal(result.usage.thoughtsTokenCount,11);
  assert.equal(result.usage.stages[0].usage.thoughtsTokenCount,5);assert.equal(result.usage.stages[1].failureCategory,'incomplete-output');assert.doesNotMatch(JSON.stringify(result),/private/);
});
test('missing review usage remains null and mixed model prices never become a false single model total',()=>{
  const usage={promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:0,totalTokenCount:30};
  const uncertain=aggregateResearchUsage([{stage:'writer',generated:{ok:true,model:'gemini-a',usageMetadata:usage}},{stage:'review',generated:{ok:false,model:'gemini-a',failureCategory:'timeout'}}]);
  assert.equal(uncertain.usage.totalTokenCount,null);assert.equal(uncertain.usage.stages[0].usage.totalTokenCount,30);assert.equal(uncertain.usage.stages[1].status,'unknown');
  const mixed=aggregateResearchUsage([{stage:'writer',generated:{ok:true,model:'gemini-a',usageMetadata:usage}},{stage:'review',generated:{ok:true,model:'gemini-b',usageMetadata:usage}}]);
  assert.equal(mixed.model,null);assert.equal(mixed.usage.totalTokenCount,60);assert.equal(mixed.usage.stages[0].model,'gemini-a');assert.equal(mixed.usage.stages[1].model,'gemini-b');
});
test('editorial examples exclude contact details and unrelated private brand metadata',()=>{
  for(const examples of ['운영자 test@example.org', '내부 자료 https://private.example.org', '담당자 010-1234-5678']){
    const result=researchEditorialIdentity({name:'Class',slug:'classmoon',meta:{offer:'공개 교육 정보',philosophy:'현장의 판단',voice_examples:examples,privateContact:'operator secret'}});
    assert.equal(result.offer,'공개 교육 정보');assert.equal(result.philosophy,'현장의 판단');assert.equal(result.voice_examples,undefined);assert.doesNotMatch(JSON.stringify(result),/secret|private.example|test@example/);
  }
});
