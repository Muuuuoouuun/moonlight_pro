import {test} from 'node:test';
import assert from 'node:assert/strict';
import { runFinanceCommand } from './finance-service.js';
test('review rejects stale or missing revisions and immutable source changes before RPC',async()=>{
 let called=0;const invoke=async()=>{called++;return {ok:true,data:{status:'saved'}};};
 const env={workspaceId:'00000000-0000-4000-8000-000000000001',invoke};
 for(const patch of [{expectedRevision:null},{expectedRevision:1,changes:{netAmount:5}},{expectedRevision:1,entity:'other'}]) {
  const r=await runFinanceCommand({action:'review',entity:'entry',id:'00000000-0000-4000-8000-000000000002',changes:{purpose:'company'},...patch},env);
  assert.equal(r.status,'error');
 }
 assert.equal(called,0);
});
test('review forwards server workspace and preserves conflict envelope',async()=>{
 let params;const invoke=async(name,p)=>{params=p;return {ok:true,data:{status:'conflict'}};};
 const r=await runFinanceCommand({action:'review',entity:'entry',id:'00000000-0000-4000-8000-000000000002',expectedRevision:1,workspaceId:'ignored',changes:{purpose:'company'}},{workspaceId:'server-workspace',invoke});
 assert.equal(r.status,'conflict');assert.equal(r.httpStatus,409);assert.equal(params.p_workspace_id,'server-workspace');
});
test('upstream failure never looks like a successful save',async()=>{
 const r=await runFinanceCommand({action:'review',entity:'subscription',id:'00000000-0000-4000-8000-000000000002',expectedRevision:1,changes:{usageNote:'직접 확인'}},{workspaceId:'server-workspace',invoke:async()=>({ok:false})});
 assert.equal(r.status,'failed');assert.equal(r.httpStatus,502);
});
