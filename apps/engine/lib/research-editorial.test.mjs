import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateResearchUsage, researchEditorialIdentity } from './research-editorial.ts';

const scheduleId='127cdc33-2fd8-4d07-95e0-d4f932b9a604';
const scheduleSource={id:scheduleId,url:'https://www.newspim.com/news/view/20260929001162',title:'[오늘의 국회일정] 국회의장·상임위·세미나·기자회견·주요 정당 - 9월 30일',text:'L21: 10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호',documentHash:'a'.repeat(64)};
const scheduleReviewed={title:'AI 시대 대입제도 개편 논의, 국회 일정표에 등장',change:'국회에서 대입 개편 논의가 시작됐다.',whyBrand:'정치권이 이 의제를 어떻게 다루기 시작했는지 관찰할 필요가 있다.',facts:[{text:'대입제도 개편을 논의하기 시작했다.',sourceId:scheduleId,quote:'이인선 의원실 등, 인공지능 시대, 대입제도의 방향은?',locator:'L21'}],interpretation:'정치권이 교육 제도에 기술을 편입하는 단계다.',conditions:'오늘 개최되는 토론회다.',counterevidence:'대안이 오간 결과는 아직 모른다.',unknown:'기존 평가 방식을 대체할 제안의 실제 적용 시점이 필요하다.',draft:'기존 평가 방식을 대체할 개편 제안이 등장하는지 지켜봐야 한다.',privateError:'private operator error'};

test('a single validated parliament schedule is narrowed in every field without inventing proposal, intent or history',async()=>{
  const {groundResearchScheduleNote}=await import('./research-editorial.ts');assert.equal(typeof groundResearchScheduleNote,'function');
  const narrowed=groundResearchScheduleNote({slug:'politicofficer'},scheduleSource,scheduleReviewed);
  assert.notEqual(narrowed,scheduleReviewed);assert.equal(narrowed.facts.length,1);
  assert.equal(narrowed.facts[0].sourceId,scheduleId);assert.equal(narrowed.facts[0].locator,'L21');assert.equal(narrowed.facts[0].quote,scheduleReviewed.facts[0].quote);
  assert.equal(narrowed.title,'국회 예고 일정: 인공지능 시대, 대입제도의 방향은?');
  assert.equal(narrowed.facts[0].text,'기사에는 이인선 의원실 등의 ‘인공지능 시대, 대입제도의 방향은?’ 일정이 예고돼 있다.');
  assert.equal(narrowed.conditions,'9월 30일자 언론 일정 기사에 실린 예고 기준이다. 시간은 10:00, 장소는 국회 본관 228호로 기재돼 있다. 이 근거에서는 실제 개최·일정 변경 여부가 확인되지 않았다.');
  assert.equal(narrowed.counterevidence,'선택한 일정 근거에는 개최 결과나 논의 내용이 없으므로, 판단에는 별도 후속 자료가 필요하다.');
  assert.equal(narrowed.unknown,'선택한 일정 한 줄로는 실제 개최 여부, 논의 내용, 일정 변경 여부, 선택에 필요한 조건을 확인할 수 없다.');
  for(const field of ['title','change','whyBrand','interpretation','conditions','counterevidence','unknown','draft']){
    assert.equal(typeof narrowed[field],'string');assert.ok(narrowed[field].trim());assert.notEqual(narrowed[field],scheduleReviewed[field]);
  }
  assert.doesNotMatch(JSON.stringify(narrowed),/개편|대체|시작|편입|청년|오늘 개최|private|2026/);
  assert.equal(narrowed.draft,'9월 30일자 언론 일정 기사에는 이인선 의원실 등의 ‘인공지능 시대, 대입제도의 방향은?’ 일정이 예고돼 있다. 예고만으로 개최 결과나 정책 변화를 판단하기엔 이르다. 확인할 질문은 ‘주최 측 후속 발표가 있는가, 있다면 실제 논의 내용과 선택에 필요한 조건이 확인되는가?’다.');
  assert.equal(scheduleSource.documentHash,'a'.repeat(64));assert.equal(scheduleReviewed.title,'AI 시대 대입제도 개편 논의, 국회 일정표에 등장');
});
test('schedule grounding is a no-op for other brands, rich or general articles and ambiguous line formats',async()=>{
  const {groundResearchScheduleNote}=await import('./research-editorial.ts');assert.equal(typeof groundResearchScheduleNote,'function');
  for(const slug of ['classmoon','22nomad','other'])assert.equal(groundResearchScheduleNote({slug},scheduleSource,scheduleReviewed),scheduleReviewed);
  assert.equal(groundResearchScheduleNote({slug:'politicofficer'},{...scheduleSource,title:'대입제도 개편 토론회 취재'},scheduleReviewed),scheduleReviewed);
  const rich={...scheduleReviewed,facts:[...scheduleReviewed.facts,scheduleReviewed.facts[0]]};assert.equal(groundResearchScheduleNote({slug:'politicofficer'},scheduleSource,rich),rich);
  for(const body of ['25:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호','10:99 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호','10:00 이인선 의원실 등 / 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호','10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? /','10:00 이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 장소 / 다른 장소','이인선 의원실 등, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호'])assert.equal(groundResearchScheduleNote({slug:'politicofficer'},{...scheduleSource,text:'L21: '+body},scheduleReviewed),scheduleReviewed);
  const noDate=groundResearchScheduleNote({slug:'politic_officer'},{...scheduleSource,title:'[오늘의 국회일정] 세미나 예고'},scheduleReviewed);assert.doesNotMatch(JSON.stringify(noDate),/9월|30일|2026|오늘 개최/);
});
test('an additional host after the first comma is ambiguous and must not become part of the topic',async()=>{
  const {groundResearchScheduleNote}=await import('./research-editorial.ts');
  for(const hosts of ['이인선 의원실, 김영호 의원실','이인선 의원실, 교육위원회 등','이인선 의원실·김영호 의원실','이인선 의원실 및 김영호 의원실']){
    const line=`10:00 ${hosts}, 인공지능 시대, 대입제도의 방향은? / 국회 본관 228호`;
    const packet={...scheduleSource,text:'L21: '+line};
    const candidate={...scheduleReviewed,facts:[{...scheduleReviewed.facts[0],quote:line}]};
    assert.equal(groundResearchScheduleNote({slug:'politicofficer'},packet,candidate),candidate);
  }
  const valid=groundResearchScheduleNote({slug:'politicofficer'},scheduleSource,scheduleReviewed);
  assert.equal(valid.title,'국회 예고 일정: 인공지능 시대, 대입제도의 방향은?');
});
test('schedule grounding never repairs a forged, empty, range or excluded evidence reference',async()=>{
  const {groundResearchScheduleNote}=await import('./research-editorial.ts');assert.equal(typeof groundResearchScheduleNote,'function');
  for(const change of [{quote:''},{quote:'위조한 인용'},{sourceId:'forged-source'},{locator:'L21-L22'},{locator:'L21:L22'},{locator:'L999'}]){
    const candidate={...scheduleReviewed,facts:[{...scheduleReviewed.facts[0],...change}]};assert.equal(groundResearchScheduleNote({slug:'politicofficer'},scheduleSource,candidate),candidate);
  }
  const aiSource={...scheduleSource,text:scheduleSource.text+'\nL22: AI summary\nL23: AI summary\nL24: AI가 자동 생성한 요약으로 정확하지 않을 수 있어요.'};assert.equal(groundResearchScheduleNote({slug:'politicofficer'},aiSource,scheduleReviewed),scheduleReviewed);
  for(const bad of [null,{},[],{facts:[]}])assert.equal(groundResearchScheduleNote({slug:'politicofficer'},scheduleSource,bad),bad);
});

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
