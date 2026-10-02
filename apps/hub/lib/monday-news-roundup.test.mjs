import assert from 'node:assert/strict';
import test from 'node:test';
import { mondayNewsPeriod, buildMondayNewsRoundup, prepareMondayNewsRoundup } from './monday-news-roundup.js';
const W='11111111-1111-4111-8111-111111111111';
const now=new Date('2026-10-05T08:30:00+09:00');
const period={periodStart:'2026-09-28',periodEnd:'2026-10-04',weekendStart:'2026-10-03'};
function entry(index,date='2026-10-03T00:00:00Z',slug='classmoon') {
  return {id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,createdAt:date,brandSlug:slug,
    payload:{origin:'research-ai',verificationLevel:'unreviewed',title:`소식 ${index}`,change:`확인된 변화 ${index}`,whyBrand:'대상과 시행 조건을 비교한다.',unknown:'시행 결과를 확인해야 한다.',counterevidence:'예고는 시행 결과가 아니다.',
      facts:['기관의 시행 예고'],factEvidence:[{text:'기관의 시행 예고',quote:'시행 예정',locator:'L2'}],sources:[{url:`https://example.com/news/${index}`,title:`원문 ${index}`,documentHash:'a'.repeat(64)}]}};
}
test('Monday KST after 08:30 selects the completed Monday-Sunday including weekend',()=>{
  assert.deepEqual(mondayNewsPeriod(now),period);
  for(const date of ['2026-10-05T08:29:59+09:00','2026-10-04T23:59:59+09:00','2026-10-06T08:30:00+09:00'])assert.equal(mondayNewsPeriod(new Date(date)),null);
});
test('roundup keeps weekend collection separate, factual limits and per-brand original links',()=>{
  const document=buildMondayNewsRoundup([entry(1),entry(2,'2026-09-30T00:00:00Z','22nomad')],period);
  assert.match(document.interpretation,/주말에 수집한 소식/);
  assert.match(document.interpretation,/지난 한 주 평일 주요 소식/);
  assert.match(document.interpretation,/시행 결과를 확인해야 한다/);
  assert.match(document.interpretation,/발표일/);
  assert.equal(document.facts.verificationLevel,'unreviewed');
  assert.equal(document.briefIds.length,2);assert.equal(document.sourceRefs.length,2);
  assert.equal(document.artifactKind,'markdown');
  assert.match(document.interpretation,/\[리서치 원본\]\(https:\/\/moonlight-pro-hub\.vercel\.app\/dashboard\/content\/research\?brief=/);
});
test('selection excludes outside period, discarded or unsupported records and deduplicates URLs',()=>{
  const first=entry(1),duplicate=entry(2);duplicate.payload.sources=first.payload.sources;
  const invalid=entry(3);invalid.payload.factEvidence=[];
  const discarded={...entry(4),state:'discarded'};
  const result=buildMondayNewsRoundup([first,duplicate,invalid,discarded,entry(5,'2026-10-05T00:00:00Z'),entry(6,'2026-09-27T00:00:00Z'),entry(7,undefined,'other')],period);
  assert.equal(result.briefIds.length,1);
});
test('per-brand selection reserves weekend space without hiding that coverage is limited',()=>{
  const rows=Array.from({length:9},(_,index)=>entry(index+1,index<3?'2026-10-04T00:00:00Z':'2026-10-01T00:00:00Z'));
  const result=buildMondayNewsRoundup(rows,period);
  assert.equal(result.briefIds.length,5);assert.equal(result.facts.weekendCount,2);
  assert.match(result.uncertainties.join(' '),/최대 5건/);
});
test('empty data never becomes a invented roundup',()=>assert.equal(buildMondayNewsRoundup([],period),null));
test('previously saved valid range citations remain visible while malformed or overlong ranges are excluded',()=>{
  const range=entry(1);range.payload.factEvidence[0].locator='L2-L4';
  const result=buildMondayNewsRoundup([range],period);
  assert.equal(result.briefIds.length,1);assert.match(result.interpretation,/원문 L2-L4/);
  for(const locator of ['L4-L2','L2-L8','L0','L2-bad']) {
    const invalid=entry(2);invalid.payload.factEvidence[0].locator=locator;
    assert.equal(buildMondayNewsRoundup([invalid],period),null);
  }
});
test('long conditions and quotes reduce the selected count instead of truncating evidence or exceeding storage',()=>{
  const rows=Array.from({length:15},(_,index)=>entry(index+1,'2026-10-01T00:00:00Z',['classmoon','22nomad','politicofficer'][Math.floor(index/5)]));
  for(const row of rows){row.payload.conditions='적용 조건 '.repeat(400);row.payload.whyBrand='브랜드 관련성 '.repeat(100);row.payload.unknown='후속 확인 '.repeat(400);row.payload.factEvidence=[{text:'조건이 있는 발표 '.repeat(70),quote:'확인된 원문 '.repeat(90),locator:'L2'}];}
  const result=buildMondayNewsRoundup(rows,period);
  assert.ok(result.interpretation.length<=39000);assert.ok(result.briefIds.length<15);
  assert.match(result.uncertainties.join(' '),/선정 건수를 줄였다/);
});
test('disabled or not due runs make no database writes',async()=>{
  const rpc=()=>assert.fail('not due');
  assert.equal((await prepareMondayNewsRoundup({now,workspaceId:W,enabled:false,rpc})).status,'idle');
  assert.equal((await prepareMondayNewsRoundup({now:new Date('2026-10-06'),workspaceId:W,enabled:true,rpc})).status,'idle');
});
test('source read errors do not save and saved roundups replay before reading any sources',async()=>{
  const calls=[];
  const rpc=async(name)=>{calls.push(name);return name==='report_news_roundup_receipt_v1'?{ok:true,data:{status:'not-found'}}:{ok:false};};
  assert.equal((await prepareMondayNewsRoundup({now,workspaceId:W,enabled:true,rpc})).status,'error');
  assert.deepEqual(calls,['report_news_roundup_receipt_v1','report_news_roundup_sources_v1']);
  const replay=await prepareMondayNewsRoundup({now,workspaceId:W,enabled:true,rpc:async(name)=>{assert.equal(name,'report_news_roundup_receipt_v1');return {ok:true,data:{status:'duplicate',reportId:W}};}});
  assert.equal(replay.status,'duplicate');assert.equal(replay.reportId,W);
});
test('prepare saves one bounded document with the stable week and no model dependency',async()=>{
  const calls=[];
  const result=await prepareMondayNewsRoundup({now,workspaceId:W,enabled:true,rpc:async(name,args)=>{
    calls.push(name);assert.equal(args.p_workspace_id,W);assert.equal(args.p_period_start,period.periodStart);
    if(name==='report_news_roundup_receipt_v1')return {ok:true,data:{status:'not-found'}};
    if(name==='report_news_roundup_sources_v1')return {ok:true,data:{status:'live',entries:[entry(1)]}};
    assert.equal(args.p_payload.facts.verificationLevel,'unreviewed');return {ok:true,data:{status:'saved',reportId:W,revision:1}};
  }});
  assert.equal(result.status,'saved');assert.equal(calls.length,3);assert.equal(result.additionalModelCalls,0);
});
