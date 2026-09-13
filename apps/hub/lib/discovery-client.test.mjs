import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoveryReadState, filterDiscoveries, discoveryBucket, prepareDiscoveryRequest, writeDiscovery } from './discovery-client.js';

test('HTTP 200 error and malformed live envelopes never appear as empty success', () => {
  assert.equal(discoveryReadState({status:'error',records:[]}).status, 'error');
  assert.equal(discoveryReadState({status:'live'}).status, 'error');
  assert.equal(discoveryReadState({status:'preview',records:[]}).status, 'preview');
  assert.equal(discoveryReadState({status:'live',records:[]}).status, 'live');
});
test('filters scope exactly and keeps paused review dates actionable', () => {
  const rows=[{id:'a',title:'진단',orgScope:'classin',status:'captured'}, {id:'b',title:'워크숍',orgScope:'personal',status:'paused',reviewDate:'2026-09-13'}, {id:'c',title:'종료',orgScope:'personal',status:'closed',reviewDate:'2026-09-12'}];
  assert.deepEqual(filterDiscoveries(rows,{scope:'personal',filter:'review',today:'2026-09-13'}).map(r=>r.id),['b']);
  assert.equal(discoveryBucket(rows[2],'2026-09-13'),'archive');
  assert.deepEqual(filterDiscoveries(rows,{query:'진단',scope:'all'}).map(r=>r.id),['a']);
});
test('retry keeps exact request identity; edited payload changes receipt but keeps record id', () => {
  const d={id:'record',title:'first',revision:0,links:[{type:'task',id:'task',title:'hydrated'}]};
  const first=prepareDiscoveryRequest(d,null,()=> 'request-1');
  const retry=prepareDiscoveryRequest(d,first,()=> 'request-2');
  assert.deepEqual(retry,first);
  const edit=prepareDiscoveryRequest({...d,title:'edited'},first,()=> 'request-2');
  assert.equal(edit.payload.id,first.payload.id);
  assert.equal(edit.payload.requestId,'request-2');
  assert.deepEqual(edit.payload.links,[{type:'task',id:'task'}]);
});
test('save distinguishes durable duplicate, conflict and HTTP 200 error', async () => {
  const call=(body,ok=true)=>writeDiscovery({},async()=>({ok,json:async()=>body}));
  assert.equal((await call({status:'duplicate',record:{id:'a'}})).ok,true);
  assert.equal((await call({status:'saved'})).ok,false);
  assert.equal((await call({status:'conflict',record:{id:'a'}},false)).status,'conflict');
  assert.equal((await call({status:'error'})).ok,false);
});

test('server query encodes literal search and keeps detail IDs independent', async () => {
  const { discoveryListUrl } = await import('./discovery-client.js');
  const url = new URL(discoveryListUrl({scope:'personal',view:'grow',status:'validating',q:'한글 %_," & 🚀',offset:40}), 'https://hub.test');
  assert.equal(url.searchParams.get('q'),'한글 %_," & 🚀');
  assert.equal(url.searchParams.get('scope'),'personal');
  assert.equal(url.searchParams.get('view'),'grow');
  assert.equal(url.searchParams.get('status'),'validating');
  assert.equal(url.searchParams.get('offset'),'40');
});
test('review reasons distinguish user dates, pause conditions and closed records', async () => {
  const { discoveryReviewReason } = await import('./discovery-client.js');
  assert.equal(discoveryReviewReason({status:'closed',reviewDate:'2026-01-01'},'2026-09-13'),'종료한 기회');
  assert.equal(discoveryReviewReason({status:'paused',reviewDate:'2026-09-13'},'2026-09-13'),'다시 보기로 한 날짜가 됐어요');
  assert.equal(discoveryReviewReason({status:'paused',resumeCondition:'예산 확보'},'2026-09-13'),'재개 조건 · 예산 확보');
  assert.equal(discoveryReviewReason({status:'exploring'},'2026-09-13'),'검토 날짜 미정');
});
