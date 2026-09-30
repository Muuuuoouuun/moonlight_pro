import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePreparedResearch, parsePreparedResearch, executeResearchPrepare, buildResearchPrompt } from './research-prepare.ts';
const W='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
const source={id:P,url:'https://example.org/a',title:'Release',text:'L1: A new model is available today.\nL2: A paid account is required.',documentHash:'a'.repeat(64)};
const brief={title:'New release',change:'A release is available',whyBrand:'Explains access to beginners',facts:[{text:'The publisher announced availability.',sourceId:P,quote:'A new model is available today.',locator:'L1'}],interpretation:'May help beginners.',conditions:'Paid account',counterevidence:'No benchmarks checked',unknown:'Regional availability',draft:'The publisher announced a new model. Account conditions apply.'};
test('prepared research rejects missing or forged source locations and keeps AI provenance server owned',()=>{
  const good=validatePreparedResearch(brief,[source],W);assert.equal(good.origin,'research-ai');assert.equal(good.verificationLevel,'unreviewed');assert.equal(good.factEvidence[0].locator,'L1');
  for(const fact of [{...brief.facts[0],sourceId:W},{...brief.facts[0],quote:'Invented claim'},{...brief.facts[0],locator:'L2'}]) assert.equal(validatePreparedResearch({...brief,facts:[fact]},[source],W),null);
  assert.equal(validatePreparedResearch({...brief,facts:[]},[source],W),null);
});
test('model claim precedes generation and a repeated engine request never invokes model',async()=>{
  const steps=[];let calls=0;
  const rpc=async(name)=>{steps.push(name);return {ok:true,data:name==='research_model_claim_v1'?{status:'claimed',source,brand:{id:W,slug:'22nomad',name:'Nomad',meta:{audience:'beginners'}}}:{status:'saved',briefId:P}};};
  const result=await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc,generate:async()=>{calls++;steps.push('model');return {ok:true,text:JSON.stringify(brief),model:'gemini-test',usageMetadata:{totalTokenCount:100}};}});
  assert.equal(result.status,'saved');assert.deepEqual(steps,['research_model_claim_v1','model','research_source_complete_v1']);assert.equal(calls,1);
  const duplicate=await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async()=>({ok:true,data:{status:'duplicate',briefId:P}}),generate:async()=>{throw Error('paid duplicate');}});
  assert.equal(duplicate.status,'duplicate');
});
test('failed or invalid model output is durably finished and never saved as a brief',async()=>{
  let finish;
  const result=await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1') return {ok:true,data:{status:'claimed',source,brand:{id:W,slug:'22nomad'}}};finish=params.p_result;return {ok:true,data:{status:'error',reason:'invalid-model-evidence'}};},generate:async()=>({ok:true,text:JSON.stringify({...brief,facts:[{...brief.facts[0],quote:'forged'}]}),model:'gemini-test',usageMetadata:{totalTokenCount:100}})});
  assert.equal(result.status,'error');assert.equal(finish.status,'error');assert.equal(finish.usage.totalTokenCount,100);
});
test('existing seeded DB UUIDs use canonical database shape without RFC version restrictions',async()=>{
  const legacy='11111111-1111-0000-0000-111111111111';
  const result=await executeResearchPrepare({preparationId:P,workspaceId:legacy},{workspaceId:legacy},{rpc:async()=>({ok:true,data:{status:'duplicate',briefId:P}}),generate:async()=>{throw Error('must not pay');}});assert.equal(result.status,'duplicate');
});
test('strict evidence diagnostics name only bounded fields and ranges, never generated text',()=>{
  const invalid=parsePreparedResearch({...brief,facts:[{...brief.facts[0],quote:'새 모델을 오늘 사용할 수 있습니다.'}]},[source],W);
  assert.equal(invalid.brief,null);assert.deepEqual(invalid.diagnostic,{code:'quote-not-in-cited-lines',field:'facts.quote',factIndex:0,lineStart:1,lineEnd:1});assert.doesNotMatch(JSON.stringify(invalid.diagnostic),/모델|A new model|example.org/);
  const locator=parsePreparedResearch({...brief,facts:[{...brief.facts[0],locator:'L999'}]},[source],W);assert.equal(locator.diagnostic.code,'missing-source-line');
  const field=parsePreparedResearch({...brief,conditions:''},[source],W);assert.deepEqual(field.diagnostic,{code:'invalid-field',field:'conditions'});
});
test('future invalid output retains field-only diagnostic with billed usage in completion receipt',async()=>{
  let completion;
  const result=await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source,brand:{id:W,slug:'22nomad'}}};completion=params.p_result;return {ok:true,data:{status:'error',reason:'invalid-model-evidence',validationDiagnostic:completion.validationDiagnostic}};},generate:async()=>({ok:true,text:JSON.stringify({...brief,facts:[{...brief.facts[0],quote:'private generated claim'}]}),model:'gemini-test',usageMetadata:{totalTokenCount:100}})});
  assert.equal(result.validationDiagnostic.code,'quote-not-in-cited-lines');assert.equal(completion.usage.totalTokenCount,100);assert.doesNotMatch(JSON.stringify(completion),/private generated claim/);
  assert.match(buildResearchPrompt({id:W,slug:'22nomad'},source),/quote.*원문 언어.*번역하지/);
});
