import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectAgentGoals} from './goals-projection.js';
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const context={workspaceId:id(1),actorId:'codex',scopes:['read']};
const options={secret:'test-only-cursor-secret'};
function ledger(count=3){return {status:'live',source:'supabase',asOf:'2026-09-21T00:00:00Z',objectives:Array.from({length:count},(_,n)=>({id:id(n+10),title:`목표 ${n}`,description:'',scope:'personal',periodStart:'2026-09-01',periodEnd:'2026-09-30',timezone:'Asia/Seoul',status:'active',revision:1})),metrics:[],observations:[],links:[]};}
test('overview paginates objectives with context-bound cursors',()=>{
  const data=ledger();const first=projectAgentGoals(data,{scope:'personal',limit:'2'},context,options);
  assert.equal(first.objectives.length,2);assert.equal(first.page.hasMore,true);assert.equal(first.metrics.length,0);
  const last=projectAgentGoals(data,{scope:'personal',limit:'2',cursor:first.page.nextCursor},context,options);
  assert.equal(last.objectives.length,1);assert.equal(last.page.hasMore,false);
  assert.throws(()=>projectAgentGoals(data,{scope:'company',limit:'2',cursor:first.page.nextCursor},context,options));
  assert.throws(()=>projectAgentGoals(data,{scope:'personal',limit:'2',cursor:first.page.nextCursor},{...context,workspaceId:id(2)},options));
});
test('large history and evidence stay within 32KiB while latest measurement truth is preserved',()=>{
  const data=ledger(1);const objectiveId=data.objectives[0].id;
  data.metrics=Array.from({length:20},(_,n)=>({id:id(n+100),objectiveId,name:`측정 ${n}`,unit:'건',role:'outcome',direction:'increase',baseline:0,target:3,targetMin:null,targetMax:null,sourceKey:'manual',status:'active',revision:1,measurement:{value:n,coverage:'partial',observedAt:data.asOf,sourceKey:'manual',periodStart:'2026-09-01',periodEnd:'2026-09-30',evidence:Array.from({length:20},()=>({label:'근거'.repeat(100),href:`https://example.com/${'a'.repeat(1800)}`,occurredAt:data.asOf})),note:'내용'.repeat(1900)},progress:{value:null,achieved:null,state:'partial'}}));
  data.observations=Array.from({length:80},()=>({...data.metrics[0].measurement}));
  let cursor,seen=0;
  do {
    const result=projectAgentGoals(data,{objectiveId,limit:'10',...(cursor?{cursor}:{})},context,options);
    assert.ok(Buffer.byteLength(JSON.stringify(result))<=32768);
    assert.equal(result.observations.length,0);assert.equal(result.historyAvailableViaHub,true);
    assert.ok(result.metrics.length>0);assert.equal(result.metrics[0].measurement.coverage,'partial');assert.equal(result.metrics[0].progress.achieved,null);assert.equal(result.metrics[0].measurement.evidenceTruncated,true);
    seen+=result.metrics.length;cursor=result.page.nextCursor;
  }while(cursor);
  assert.equal(seen,20);
});
test('source failure stays error and truncation never promises complete totals',()=>{
  const failed=projectAgentGoals({...ledger(),status:'error',source:'error',error:'read-failed'},{},context,options);assert.equal(failed.status,'error');
  const partial=projectAgentGoals({...ledger(),status:'partial',truncatedSources:['operating_objectives']},{},context,options);
  assert.equal(partial.page.totalCount,null);assert.equal(partial.sourceIncomplete,true);
});
test('objective detail retains stale link repair metadata',()=>{
  const data=ledger(1),objectiveId=data.objectives[0].id;
  data.links=[{objectiveId,entityType:'tasks',entityId:id(50),linkStatus:'unavailable',stale:true,staleReason:'entity-source-unavailable',entityScope:null,entityHref:null}];
  const detail=projectAgentGoals(data,{objectiveId},context,options);
  assert.deepEqual(detail.links,data.links);
});
