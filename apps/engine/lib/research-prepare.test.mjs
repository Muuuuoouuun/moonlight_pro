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
  assert.equal(result.status,'saved');assert.deepEqual(steps,['research_model_claim_v1','model','model','research_source_complete_v1']);assert.equal(calls,2);
  const duplicate=await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async()=>({ok:true,data:{status:'duplicate',briefId:P}}),generate:async()=>{throw Error('paid duplicate');}});
  assert.equal(duplicate.status,'duplicate');
});
test('failed or invalid model output is durably finished and never saved as a brief',async()=>{
  let finish;
  const result=await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1') return {ok:true,data:{status:'claimed',source,brand:{id:W,slug:'22nomad'}}};finish=params.p_result;return {ok:true,data:{status:'error',reason:'invalid-model-evidence'}};},generate:async()=>({ok:true,text:JSON.stringify({...brief,facts:[{...brief.facts[0],quote:'forged'}]}),model:'gemini-test',usageMetadata:{totalTokenCount:100}})});
  assert.equal(result.status,'error');assert.equal(finish.status,'error');assert.equal(finish.usage.totalTokenCount,200);
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
  assert.equal(result.validationDiagnostic.code,'quote-not-in-cited-lines');assert.equal(completion.usage.totalTokenCount,200);assert.doesNotMatch(JSON.stringify(completion),/private generated claim/);
  // Quote correctness is asserted by the validator above, not a prompt keyword score.
});
test('research bounds each stage while retaining one durable paid claim',async()=>{
  const requests=[];
  await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name)=>({ok:true,data:name==='research_model_claim_v1'?{status:'claimed',source,brand:{id:W,slug:'22nomad'}}:{status:'saved',briefId:P}}),generate:async(input)=>{requests.push(input);return {ok:true,text:JSON.stringify(brief),model:'gemini-test'};}});
  for(const request of requests){assert.equal(request.model,'gemini-3.1-pro-preview');assert.equal(request.thinkingLevel,'low');assert.equal(request.maxOutputTokens,16384);assert.equal(request.retries,0);}
});
test('terminal provider replies fail definitively but transport and crash outcomes retain their draft slot',async()=>{
  const cases=[
    [{ok:false,reason:'max_tokens',failureCategory:'incomplete-output',status:200,finishReason:'MAX_TOKENS',usageMetadata:{promptTokenCount:1235,candidatesTokenCount:208,thoughtsTokenCount:5278,totalTokenCount:6721}},'model-response-invalid','incomplete-output'],
    [{ok:false,failureCategory:'blocked-output',status:200,finishReason:'SAFETY'},'model-response-invalid','blocked-output'],
    [{ok:false,status:200,promptFeedback:{blockReason:'SAFETY'}},'model-response-invalid','blocked-prompt'],
    [{ok:false,status:401},'model-request-rejected','authentication'],
    [{ok:false,status:429},'model-request-rejected','rate-limit'],
    [{ok:false,status:503},'model-request-rejected','provider-unavailable'],
    [{ok:false,failureCategory:'invalid-json',status:200},'model-response-invalid','invalid-json'],
    [{ok:false,failureCategory:'empty-output',status:200,finishReason:'STOP'},'model-response-invalid','empty-output'],
    [{ok:false,failureCategory:'timeout',status:200},'model-outcome-unknown','timeout'],
    [{ok:false,failureCategory:'network-error',status:200},'model-outcome-unknown','network-error'],
    [{ok:false,failureCategory:'aborted'},'model-outcome-unknown','aborted'],
    [{ok:false,reason:'model-outcome-unknown'},'model-outcome-unknown','provider-error'],
  ];
  for(const [generated,reason,category] of cases){let completion;
    await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source,brand:{id:W,slug:'22nomad'}}};completion=params.p_result;return {ok:true,data:completion};},generate:async()=>({...generated,model:'gemini-3-flash-preview',text:'private provider output',error:{message:'private provider error'},promptFeedback:{...generated.promptFeedback,safetyExplanation:'private prompt'}})});
    assert.equal(completion.reason,reason);assert.equal(completion.providerDiagnostic.failureCategory,category);assert.doesNotMatch(JSON.stringify(completion),/private provider|private prompt/);
    if(generated.usageMetadata)for(const [key,value] of Object.entries(generated.usageMetadata))assert.equal(completion.usage[key],value);
    if(generated.finishReason)assert.equal(completion.providerDiagnostic.finishReason,generated.finishReason);
  }
});

test('provided revision replaces writer text for the observed source-scope errors; this is a pipeline test, not model certification',async()=>{
  const cases=[
    {slug:'politicofficer',text:'L1: 10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호',quote:'10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호',bad:'AI 기술의 교육 영향이 커져 장기적인 입시 제도 변화를 모색하는 논의의 시작점이다.',good:'일정표에는 AI 시대 대입제도 방향을 주제로 한 토론회가 기재돼 있다.',draft:'뉴스핌 일정표에는 AI 시대 대입제도 토론회가 기재돼 있다. 일정과 제목만으로 제도 개편 의도나 논의 결과를 확인할 수 없다. 주최 측 결과에 실제 제도 변경안이 제시되는지 확인해야 한다.'},
    {slug:'politicofficer',text:'L1: 10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호',quote:'10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호',bad:'교육·금융·경영 분야의 AI 토론회가 다수 개최됐다.',good:'일정표에는 오전 10시 AI 시대 대입제도 토론회가 예정돼 있다.',draft:'AI 대입제도 토론회 일정은 확인된다. 제도 변경 여부는 후속 결과를 확인해야 한다.'},
    {slug:'politicofficer',text:'L1: 10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호',quote:'10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호',bad:'오전 10시 AI 대입제도 토론회가 예정돼 있다. 대입제도의 방향을 논의한다는 점이 주목할 만하다. 오전 10시 국회 본관 228호에서 예정된 토론회를 주목해야 한다.',good:'일정표에는 AI 시대 대입제도 토론회가 예정돼 있다.',draft:'일정표에는 AI 시대 대입제도 토론회가 기재돼 있다. 일정만으로 정책 변경을 판단하기엔 이르다. 독자가 먼저 확인할 질문은 실제 제도 변경안이 제시되는가다. 주최 측 결과에 변경 제안이 담기는지 확인한 뒤 논의의 범위를 판단할 수 있다.'},
    {slug:'classmoon',text:'L1: 그 밖의 855건에는 시스템 오류 발생으로 로그인 자체가 불가하여 전산 기록이 남지 못한 경우를 포함한다.',quote:'그 밖의 855건에는 시스템 오류 발생으로 로그인 자체가 불가하여 전산 기록이 남지 못한 경우를 포함한다.',bad:'855건 모두 로그인 불가로 전산 기록이 남지 않아 구제됐다.',good:'855건에는 로그인 불가로 전산 기록이 남지 않은 사례가 포함되며 그 수는 확인되지 않는다.',draft:'기록이 없는 855건 전체를 같은 원인으로 볼 근거는 없다. 학생의 실제 접수 상황과 최종 접수 결과를 확인해야 한다.'},
    {slug:'22nomad',text:'L1: one-fifth of Astra’s standard input and output token prices.\nL2: GPT‑6.1 Sol is not yet available in Chat.',quote:'one-fifth of Astra’s standard input and output token prices.',bad:'누구나 Chat에서 Astra급 성능을 전체 비용의 20%로 쓸 수 있다.',good:'OpenAI는 표준 API 입력·출력 토큰 단가가 Astra의 5분의 1이라고 발표했다.',draft:'OpenAI 발표의 가격 비교는 표준 API 단가 기준이다. Chat에는 아직 제공되지 않으므로 이용 중인 제품과 자신의 작업 비용을 별도로 확인해야 한다.'},
    {slug:'22nomad',text:'L1: one-fifth of Astra’s standard input and output token prices.',quote:'one-fifth of Astra’s standard input and output token prices.',bad:'개인적으로 자동화 스크립트를 짜거나 긴 문서를 분석할 때 API 비용이 늘 부담이었는데, 이제 테스트 진입 장벽이 크게 낮아졌다.',good:'OpenAI는 표준 API 입력·출력 토큰 단가가 Astra의 5분의 1이라고 발표했다.',draft:'OpenAI 발표는 표준 API 단가를 비교한다. 실제 작업의 총비용과 품질은 같은 작업을 실행한 결과와 청구 비용으로 확인해야 한다.'},
  ];
  for(const fixture of cases){const evidence={...source,text:fixture.text};let calls=0,completion;
    const writer={...brief,facts:[{text:fixture.bad,quote:fixture.quote,sourceId:P,locator:'L1'}],draft:fixture.bad};
    const revised={...writer,facts:[{...writer.facts[0],text:fixture.good}],draft:fixture.draft,counterevidence:'원문에서 확인된 조건을 벗어난 일반화는 지원되지 않는다.'};
    const result=await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source:evidence,brand:{id:W,slug:fixture.slug}}};completion=params.p_result;return {ok:true,data:completion};},generate:async request=>{assert.equal(request.retries,0);calls++;if(calls===2){assert.ok(request.prompt.includes(evidence.text));assert.ok(request.prompt.includes(JSON.stringify(writer)));}return {ok:true,text:JSON.stringify(calls===1?writer:revised),model:'gemini-test',usageMetadata:calls===1?{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:5,totalTokenCount:35}:{promptTokenCount:40,candidatesTokenCount:50,thoughtsTokenCount:6,totalTokenCount:96}};}});
    assert.equal(calls,2);assert.equal(result.status,'saved');assert.equal(completion.brief.facts[0],fixture.good);assert.equal(completion.brief.draft,fixture.draft);assert.notEqual(completion.brief.facts[0],fixture.bad);
    assert.equal(completion.usage.promptTokenCount,50);assert.equal(completion.usage.candidatesTokenCount,70);assert.equal(completion.usage.thoughtsTokenCount,11);assert.equal(completion.usage.totalTokenCount,131);assert.equal(completion.usage.modelCalls,2);
  }
});
test('review failure retains both calls and a timed out review preserves writer usage without inventing a zero',async()=>{
  for(const timedOut of [false,true]){let calls=0,completion;
    const result=await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source,brand:{id:W,slug:'22nomad'}}};completion=params.p_result;return {ok:true,data:completion};},generate:async()=>++calls===1?{ok:true,text:JSON.stringify(brief),model:'gemini-test',usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:5,totalTokenCount:35}}:{ok:false,model:'gemini-test',failureCategory:timedOut?'timeout':'incomplete-output',finishReason:timedOut?null:'MAX_TOKENS',usageMetadata:timedOut?null:{promptTokenCount:40,candidatesTokenCount:50,thoughtsTokenCount:6,totalTokenCount:96}}});
    assert.equal(calls,2);assert.equal(result.reason,timedOut?'model-outcome-unknown':'model-response-invalid');assert.equal(completion.usage.modelCalls,2);assert.equal(completion.usage.totalTokenCount,timedOut?null:131);assert.equal(completion.usage.stages[0].usage.totalTokenCount,35);assert.equal(completion.usage.stages[1].stage,'review');assert.equal(completion.brief,undefined);
  }
});
test('the final review must pass original-language quote validation and counterevidence cannot be blank',async()=>{
  assert.equal(validatePreparedResearch({...brief,counterevidence:''},[source],W),null);
  let calls=0,completion;
  await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source,brand:{id:W,slug:'22nomad'}}};completion=params.p_result;return {ok:true,data:completion};},generate:async()=>{calls++;return {ok:true,text:JSON.stringify(calls===1?brief:{...brief,facts:[{...brief.facts[0],quote:'새 모델이 오늘 출시됐다.'}]}),model:'gemini-test',usageMetadata:{totalTokenCount:20}};}});
  assert.equal(calls,2);assert.equal(completion.reason,'invalid-model-evidence');assert.equal(completion.validationDiagnostic.code,'quote-not-in-cited-lines');assert.equal(completion.usage.totalTokenCount,40);assert.equal(completion.brief,undefined);
});
test('approved brand purpose reaches writing while private metadata never reaches either model',async()=>{
  const prompt=buildResearchPrompt({id:W,slug:'classmoon',meta:{philosophy:'교육 현장의 실제 문제',offer:'교육 정보와 현장 사례',voice_examples:'예시: 이번 변화에서 무엇을 확인할까요?',privateNotes:'secret operator memo',accessToken:'secret credential'}},source);
  assert.ok(prompt.includes('교육 현장의 실제 문제'));assert.ok(prompt.includes('교육 정보와 현장 사례'));assert.ok(prompt.includes('이번 변화에서 무엇을 확인할까요?'));assert.ok(!prompt.includes('secret'));
});

test('generation uses actual single-line source options and the full stage policy in system instructions',async()=>{
  const requests=[];
  await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async name=>({ok:true,data:name==='research_model_claim_v1'?{status:'claimed',source,brand:{id:W,slug:'22nomad'}}:{status:'saved',briefId:P}}),generate:async request=>{requests.push(request);return {ok:true,text:JSON.stringify(brief),model:'gemini-test'};}});
  const {buildResearchSystemInstruction}=await import('./research-editorial.ts');assert.equal(typeof buildResearchSystemInstruction,'function');
  for(const [index,request] of requests.entries()){
    assert.equal(request.systemInstruction,buildResearchSystemInstruction(index?'review':'writer'));
    assert.equal(request.responseJsonSchema.properties.facts.minItems,1);assert.equal(request.responseJsonSchema.properties.facts.maxItems,3);
    assert.deepEqual(request.responseJsonSchema.properties.facts.items.properties.locator.enum,['L1','L2']);
    assert.deepEqual(request.responseJsonSchema.properties.facts.items.properties.sourceId.enum,[P]);
    for(const bad of ['L1:L2','L1-L2','L999','L18:L26'])assert.ok(!request.responseJsonSchema.properties.facts.items.properties.locator.enum.includes(bad));
  }
  // Existing validated stored briefs retain the prior short-range contract.
  assert.ok(validatePreparedResearch({...brief,facts:[{...brief.facts[0],locator:'L1-L2'}]},[source],W));
});
test('disclosed publisher AI summary and article footer cannot be selected as new citation lines',async()=>{
  const {researchResponseSchemaForSource}=await import('./research-prepare.ts');assert.equal(typeof researchResponseSchemaForSource,'function');
  const packet={...source,url:'https://www.newspim.com/news/view/test',text:'L1: 제목\nL2: 발행일\nL3: 확인일\nL4: 국회는 3일 본회의 대신 상임위를 열었다.\nL5: AI 요약 두번째 줄\nL6: AI 요약 세번째 줄\nL7: ! AI가 자동 생성한 요약으로 정확하지 않을 수 있어요.\nL8: 10:00 인공지능 시대 대입제도 토론회\nL9: GAM - 해외주식 투자 도우미\nL10: 관련 기사 광고'};
  assert.deepEqual(researchResponseSchemaForSource(packet).properties.facts.items.properties.locator.enum,['L1','L2','L3','L8']);
  const prompt=buildResearchPrompt({id:W,slug:'politicofficer'},packet);
  assert.ok(prompt.includes('L8: 10:00 인공지능 시대 대입제도 토론회'));
  assert.ok(!prompt.includes('국회는 3일'));assert.ok(!prompt.includes('AI 요약 두번째'));assert.ok(!prompt.includes('관련 기사 광고'));
});

test('new generation rejects ranges and excluded citation lines even if a provider ignores its negotiated schema',async()=>{
  for(const locator of ['L1-L2','L1:L2','L999']){let calls=0,completion;
    await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source,brand:{id:W,slug:'22nomad'}}};completion=params.p_result;return {ok:true,data:completion};},generate:async()=>{calls++;return {ok:true,text:JSON.stringify(calls===1?brief:{...brief,facts:[{...brief.facts[0],locator}]}),model:'gemini-test',usageMetadata:{totalTokenCount:20}};}});
    assert.equal(completion.reason,'invalid-model-evidence');assert.equal(completion.brief,undefined);assert.equal(completion.usage.totalTokenCount,40);assert.equal(calls,2);
  }
  const excludedSource={...source,url:'https://www.newspim.com/news/view/test',text:'L1: 제목\nL2: 발행일\nL3: 확인일\nL4: A new model is available today.\nL5: AI summary\nL6: AI summary\nL7: AI가 자동 생성한 요약으로 정확하지 않을 수 있어요.\nL8: A paid account is required.'};
  for(const invalid of [{...brief,facts:[{...brief.facts[0],locator:'L4'}]},{...brief,facts:Array.from({length:4},()=>brief.facts[0])}]){let calls=0,completion;
    const evidence=invalid.facts.length===4?source:excludedSource;
    await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source:evidence,brand:{id:W,slug:'politicofficer'}}};completion=params.p_result;return {ok:true,data:completion};},generate:async()=>{calls++;return {ok:true,text:JSON.stringify(calls===1?brief:invalid),model:'gemini-test',usageMetadata:{totalTokenCount:20}};}});
    assert.equal(completion.reason,'invalid-model-evidence');assert.equal(completion.brief,undefined);assert.equal(completion.usage.totalTokenCount,40);assert.equal(calls,2);
  }
});

test('reviewed thin parliament evidence becomes an unreviewed schedule note after quote validation, with the same two paid usages',async()=>{
  const scheduleSource={...source,title:'[오늘의 국회일정] 세미나 - 9월 30일',url:'https://www.newspim.com/news/view/20260929001162',text:'L21: 10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호'};
  const raw={...brief,title:'AI 대입제도 개편 논의 시작',change:'기존 평가 대체',whyBrand:'청년 세대의 삶과 직결',interpretation:'정치권이 기술을 교육 제도에 편입하기 시작했다.',conditions:'오늘 토론회 개최',counterevidence:'개편 논의 결과가 아직 없다.',unknown:'수능을 대체할 개편안의 적용 시점',draft:'기존 평가를 대체할 제안이 나타날지 지켜봐야 한다.',facts:[{text:'대입 개편 논의가 시작됐다.',sourceId:P,locator:'L21',quote:'이인선 의원실 등, 인공지능 시대, 대입제도의 방향은?'}],error:'private model error'};
  let completion,calls=0;
  await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source:scheduleSource,brand:{id:W,slug:'politicofficer'}}};completion=params.p_result;return {ok:true,data:completion};},generate:async()=>{calls++;return {ok:true,text:JSON.stringify(raw),model:'gemini-test',usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:5,totalTokenCount:35}};}});
  assert.equal(completion.status,'saved');assert.equal(calls,2);assert.equal(completion.usage.modelCalls,2);assert.equal(completion.usage.totalTokenCount,70);
  assert.equal(completion.brief.origin,'research-ai');assert.equal(completion.brief.verificationLevel,'unreviewed');assert.equal(completion.brief.factEvidence[0].quote,raw.facts[0].quote);assert.equal(completion.brief.factEvidence[0].locator,'L21');assert.equal(completion.brief.factEvidence[0].sourceId,P);assert.equal(completion.brief.sources[0].documentHash,scheduleSource.documentHash);
  for(const field of ['title','change','whyBrand','interpretation','conditions','counterevidence','unknown','draft'])assert.notEqual(completion.brief[field],raw[field]);
  assert.doesNotMatch(JSON.stringify(completion),/개편|대체|시작|편입|청년|오늘 토론회|private model/);
  assert.equal(completion.brief.facts.length,1);assert.equal(completion.brief.facts[0],'기사에는 이인선 의원실 등의 ‘인공지능 시대, 대입제도의 방향은?’ 일정이 예고돼 있다.');
});
test('schedule field narrowing cannot rescue invalid or excluded evidence and still records both paid calls',async()=>{
  const scheduleSource={...source,title:'[오늘의 국회일정] 세미나 - 9월 30일',url:'https://www.newspim.com/news/view/20260929001162',text:'L21: 10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호'};
  const fact={text:'대입 개편 논의가 시작됐다.',sourceId:P,locator:'L21',quote:'이인선 의원실 등, 인공지능 시대, 대입제도의 방향은?'};
  for(const change of [{quote:''},{quote:'위조 인용'},{sourceId:W},{locator:'L21-L22'},{locator:'L21:L22'},{locator:'L999'}]){let calls=0,completion;
    await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source:scheduleSource,brand:{id:W,slug:'politicofficer'}}};completion=params.p_result;return {ok:true,data:completion};},generate:async()=>{calls++;return {ok:true,text:JSON.stringify({...brief,facts:[{...fact,...change}]}),model:'gemini-test',usageMetadata:{totalTokenCount:20}};}});
    assert.equal(completion.reason,'invalid-model-evidence');assert.equal(completion.brief,undefined);assert.equal(calls,2);assert.equal(completion.usage.totalTokenCount,40);
  }
  const aiSource={...scheduleSource,text:scheduleSource.text+'\nL22: AI summary\nL23: AI summary\nL24: AI가 자동 생성한 요약으로 정확하지 않을 수 있어요.'};let completion;
  await executeResearchPrepare({preparationId:P,workspaceId:W},{workspaceId:W},{rpc:async(name,params)=>{if(name==='research_model_claim_v1')return {ok:true,data:{status:'claimed',source:aiSource,brand:{id:W,slug:'politicofficer'}}};completion=params.p_result;return {ok:true,data:completion};},generate:async()=>({ok:true,text:JSON.stringify({...brief,facts:[fact]}),model:'gemini-test',usageMetadata:{totalTokenCount:20}})});
  assert.equal(completion.reason,'invalid-model-evidence');assert.equal(completion.brief,undefined);assert.equal(completion.usage.totalTokenCount,40);
});
