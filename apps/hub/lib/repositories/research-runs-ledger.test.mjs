import assert from 'node:assert/strict';
import test from 'node:test';
import { listResearchRuns } from './research-runs-ledger.js';
const W='11111111-1111-4111-8111-111111111111';
test('run repository scopes and bounds reads and never selects evidence or secrets',async()=>{
  const result=await listResearchRuns({workspaceId:W,brand:'22nomad',read:async(table,options)=>{assert.equal(table,'research_runs');assert.equal(options.limit,30);assert.deepEqual(options.filters,[['workspace_id',`eq.${W}`],['brand_slug','eq.22nomad']]);assert.doesNotMatch(options.select,/evidence|request_hash|\*/);return {configured:true,rows:[{id:W,status:'success',brand_slug:'22nomad',counts:{preparedCount:1}}]};}});assert.equal(result.status,'live');assert.equal(result.runs[0].preparedCount,1);
});
test('run read failures and absent configuration remain distinct truthful states',async()=>{
  assert.equal((await listResearchRuns({workspaceId:W,read:async()=>({configured:true,error:true})})).status,'error');
  assert.equal((await listResearchRuns({workspaceId:W,read:async()=>({configured:false})})).status,'preview');
});
