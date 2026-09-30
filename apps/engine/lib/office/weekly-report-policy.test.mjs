import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOfficeWorkflowPrompt, buildOfficeWorkflowReview } from './workflow-prompt.ts';
import { generateOfficeWorkflow } from './workflow-service.ts';

let groundWeeklyReport;
try { ({ groundWeeklyReport } = await import('./weekly-report-policy.ts')); } catch {}
const request = { requestId:'10000000-0000-4000-8000-000000000001', intent:'weekly_report', ownerId:'vaporeon', mode:'draft', participants:[], scope:'classin', originRef:{periodStart:'2026-09-24',periodEnd:'2026-09-30',timezone:'Asia/Seoul'}, expectedContextHash:'a'.repeat(64), message:'완료 주간의 실제 기록으로 보고서를 작성해 주세요.', boundedHistory:[] };
const metrics = [
  {key:'contacts',label:'연락 활동',value:1,unit:'건',meaning:'CRM에 기록된 실제 연락 활동 횟수',scopeNote:'고유 고객 수가 아닙니다.'},
  {key:'newDeals',label:'신규 딜',value:0,unit:'건',meaning:'기간 중 생성된 딜',scopeNote:'신규 리드 유입 수가 아닙니다.'},
  {key:'wonDeals',label:'성사일 확인된 딜',value:0,unit:'건',meaning:'기간 중 won_at이 확인된 현재 성사 딜',scopeNote:''},
  {key:'wonAmount',label:'성사 계약 금액',value:0,unit:'원',meaning:'성사 딜의 계약 금액 합계',scopeNote:'입금이 아닙니다.'},
].map(item => ({...item,sourceRefId:`weekly:stats:${item.key}`,comparison:{previous:null,delta:null,percentChange:null,reason:'comparison-unavailable'}}));
const context = {status:'ready',scope:'classin',originRef:request.originRef,originKey:'weekly',facts:{stats:Object.fromEntries(metrics.map(item=>[item.key,item.value])),metricEvidence:metrics,comparison:{status:'unavailable',period:{periodStart:'2026-09-17',periodEnd:'2026-09-23',timezone:'Asia/Seoul',scope:'company'},stats:{},failedSources:[]}},sourceRefs:metrics.map(item=>({id:item.sourceRefId,type:'metric',label:item.label})),missing:[],asOf:'2026-09-30T16:34:10.350Z',contextHash:request.expectedContextHash,capabilities:{generate:true,applyTask:true}};
const answer = body => ({summary:'이번 주 판단',artifact:{kind:'markdown',body},evidence:[],uncertainties:[],dissent:[],nextStep:null});

test('weekly writing and review use readable metric evidence and comparative judgments while other intents stay focused',()=>{
  const built=buildOfficeWorkflowPrompt(request,context), reviewed=buildOfficeWorkflowReview(request,context,answer('초안'));
  for(const policy of [built.systemInstruction,reviewed.systemInstruction]) {
    assert.match(policy,/핵심 판단/); assert.match(policy,/해석과 다른 설명/); assert.match(policy,/확인 한계/);
    assert.match(policy,/metricEvidence/); assert.match(policy,/신규 딜.{0,30}신규 리드/s);
    assert.match(policy,/0.{0,30}미측정/s); assert.match(policy,/전주.{0,30}비교/s);
    assert.match(policy,/1인칭.{0,50}경험/s);assert.match(policy,/내가.{0,50}금지/s);
  }
  const supplied=JSON.parse(built.prompt).sourceContext.facts;
  assert.deepEqual(supplied.metricEvidence,metrics); assert.equal(supplied.stats.wonDeals,0);
  const reply=buildOfficeWorkflowPrompt({...request,intent:'customer_reply'},context);
  assert.doesNotMatch(reply.systemInstruction,/주간 보고서 편집 기준/);
});

test('actual measured-zero, deal/lead and activity/people errors become an honest bounded report without another model call',async()=>{
  const bad=answer('### 주요 활동 지표\n- 신규 리드 유입: 0건\n- 성사 딜: 미측정 (금액: 미측정)\n이번 주 연락한 고객 1명은 현재 집중 프로젝트의 우선순위 영향일 가능성이 큽니다.\n정체된 딜 전수 점검을 제안합니다.');
  bad.nextStep={kind:'create_task',label:'정체 딜 전수 점검',fields:{title:'정체 딜 전수 점검'}};
  let calls=0;
  const result=await generateOfficeWorkflow(request,context,async input=>{
    calls++;
    return {ok:true,model:'test-provider',text:JSON.stringify({...bad,...(input.responseJsonSchema.properties.sourceIndexes?{sourceIndexes:[],corrections:[]}: {})}),usageMetadata:{promptTokenCount:20,candidatesTokenCount:10,totalTokenCount:35}};
  });
  assert.equal(calls,2); assert.equal(result.status,'generated');
  assert.match(result.artifact.body,/신규 딜.{0,8}0건/); assert.match(result.artifact.body,/성사일 확인된 딜.{0,8}0건/);
  assert.match(result.artifact.body,/성사 계약 금액.{0,8}0원/); assert.match(result.artifact.body,/연락 활동.{0,8}1건/);
  assert.doesNotMatch(result.artifact.body,/고객 1명|가능성이 큽|정체된 딜 전수|신규 리드 유입: 0/);
  assert.match(result.artifact.body,/비교.*확인|비교.*판단/s); assert.equal(result.nextStep,null);
  assert.ok(result.uncertainties.some(note=>note.includes('지표')));
});

test('bounded checks preserve correct prose, measured null and comparison limits rather than certify all semantics',()=>{
  assert.equal(typeof groundWeeklyReport,'function');
  const good=answer('## 핵심 판단\n연락 활동은 1건입니다. 고유 고객 수는 확인되지 않았습니다.\n성사 딜: 0건. 전주 성사 딜은 미측정이므로 증감은 판단할 수 없습니다.\n신규 딜은 0건이며 입금은 미확인입니다.');
  assert.deepEqual(groundWeeklyReport(good,request,context),good);
  const unavailable={...context,facts:{...context.facts,stats:{...context.facts.stats,wonDeals:null},metricEvidence:metrics.map(item=>item.key==='wonDeals'?{...item,value:null}:item)}};
  const unknown=answer('성사 딜: 미측정\n신규 딜: 0건');
  assert.deepEqual(groundWeeklyReport(unknown,request,unavailable),unknown);
  assert.deepEqual(groundWeeklyReport(answer('신규 리드 유입: 0건'),{...request,intent:'customer_reply'},context),answer('신규 리드 유입: 0건'));
});

test('comparison without a valid baseline never fabricates a rate or a causal decline',()=>{
  assert.equal(typeof groundWeeklyReport,'function');
  const adjusted=groundWeeklyReport(answer('연락 활동: 1건\n연락이 줄어든 것은 프로젝트 우선순위 영향일 가능성이 큽니다.'),request,context);
  assert.doesNotMatch(adjusted.artifact.body,/줄어든 것은|우선순위 영향/);
  assert.match(adjusted.artifact.body,/전주|비교/); assert.doesNotMatch(adjusted.artifact.body,/\d+%/);
});
test('corrected rate comparisons keep percentage points distinct from relative change',()=>{
  const rate={key:'focusRate',label:'오늘 3개 당일 완료율',value:60,unit:'%',meaning:'같은 날 완료율',scopeNote:'워크스페이스 전체',sourceRefId:'weekly:stats:focusRate',comparison:{previous:40,delta:20,deltaUnit:'%p',percentChange:50,reason:null}};
  const adjusted=groundWeeklyReport(answer('신규 리드 유입: 0건'),{...request,scope:'personal'},{...context,facts:{...context.facts,metricEvidence:[...metrics,rate]}});
  assert.match(adjusted.artifact.body,/전주 40%, 차이 \+20%p/);assert.doesNotMatch(adjusted.artifact.body,/차이 \+20%(?!p)|초안에서|사실을 인증/);
});
