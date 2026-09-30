import assert from 'node:assert/strict';
import test from 'node:test';
let getReportsArchive;try { ({getReportsArchive}=await import('./reports-ledger.js')); } catch {}
const W='11111111-1111-4111-8111-111111111111';
test('archive has one transactional read and opaque chronology cursor, with null evidence intact',async()=>{
  assert.equal(typeof getReportsArchive,'function');let calls=0;
  const result=await getReportsArchive({workspaceId:W,actorId:'operator',invokeRpc:async(name,params)=>{
    calls++;assert.equal(name,'report_archive_v1');assert.equal(params.p_workspace_id,W);
    return{ok:true,data:{status:'live',items:[{source:'snapshot',row:{id:W,kind:'weekly',scope:'company',revision:2,payload:{status:'partial',facts:{stats:{contacts:null}}}}}],nextCursor:{createdAt:'2026-09-30T00:00:00Z',id:'stored:'+W}}};
  }});
  assert.equal(calls,1);assert.equal(result.reports[0].facts.stats.contacts,null);assert.equal(result.reports[0].revision,2);assert.equal(result.status,'partial');assert.equal(typeof result.nextCursor,'string');
  const next=await getReportsArchive({workspaceId:W,cursor:result.nextCursor,invokeRpc:async(_name,params)=>{assert.equal(params.p_before.id,'stored:'+W);return{ok:true,data:{status:'live',items:[],nextCursor:null}};}});
  assert.equal(next.status,'live');
});
test('deep links bypass page bounds and invalid refs/cursors never query storage',async()=>{
  assert.equal(typeof getReportsArchive,'function');let calls=0;
  const invokeRpc=async(_name,params)=>{calls++;assert.equal(params.p_ref,'research:'+W);return{ok:true,data:{status:'live',items:[{source:'research',row:{id:W,title:'근거',facts:['원문'],draft:'검토 원고'}}]}};};
  assert.equal((await getReportsArchive({workspaceId:W,report:'research:'+W,invokeRpc})).reports[0].id,'research:'+W);
  assert.equal((await getReportsArchive({workspaceId:W,report:'stored:wrong',invokeRpc})).status,'error');
  assert.equal((await getReportsArchive({workspaceId:W,cursor:'invalid',invokeRpc})).status,'error');assert.equal(calls,1);
});
test('missing config is preview and failed archive is error; Office partial is preserved',async()=>{
  assert.equal(typeof getReportsArchive,'function');
  assert.equal((await getReportsArchive({workspaceId:W,invokeRpc:async()=>({ok:false,error:'missing-config'})})).status,'preview');
  assert.equal((await getReportsArchive({workspaceId:W,invokeRpc:async()=>({ok:false,status:503})})).status,'error');
  const office=await getReportsArchive({workspaceId:W,invokeRpc:async()=>({ok:true,data:{status:'live',items:[{source:'office',row:{id:W,scope:'classin',result:{artifact:{body:'부분 집계'},context:{missing:['연락 미측정']}}}}]}})});
  assert.equal(office.reports[0].status,'partial');assert.equal(office.status,'partial');
});
