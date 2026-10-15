import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeResearchRun, researchSettings, scheduledResearchRequests, projectResearchRun } from './research-run-contract.js';
const id='11111111-1111-4111-8111-111111111111';
test('run contract permits registered aliases and bounded quantities but rejects forged provenance',()=>{
  assert.deepEqual(normalizeResearchRun({requestId:id,brand:'class.moon'}),{requestId:id,brand:'class.moon',dbSlug:'classmoon',topic:'education-office',limit:3});
  for(const input of [{brand:'unknown'},{brand:'class.moon',limit:4},{brand:'22nomad',origin:'research-ai'},{brand:'22nomad',verificationLevel:'verified'},{brand:'politic_officer',topic:'education-office'}]) assert.equal(normalizeResearchRun({requestId:id,...input}),null);
});
test('political schedule runs KST 08 through 22 every two hours, daily brands once at 08',()=>{
  for(const hour of [0,6,7,9,21,23]) assert.equal(scheduledResearchRequests(new Date(`2026-10-01T${String(hour).padStart(2,'0')}:00:00+09:00`)).length,0);
  assert.equal(scheduledResearchRequests(new Date('2026-10-01T08:00:00+09:00')).length,3);
  assert.equal(scheduledResearchRequests(new Date('2026-10-01T22:00:00+09:00'))[0].brand,'politic_officer');
  assert.deepEqual(scheduledResearchRequests(new Date('2026-10-01T08:00:00+09:00')),scheduledResearchRequests(new Date('2026-10-01T08:45:00+09:00')));
  assert.equal(researchSettings({COM_MOON_RESEARCH_ENABLED:'true'}).costCapUsd,null);
});
test('run projection never exposes evidence, provider secrets or request hashes',()=>{
  const run=projectResearchRun({id,brand_slug:'22nomad',status:'success',counts:{preparedCount:1,searchCalls:0},usage:null,raw_text:'private',request_hash:'secret',reason:'ok',brief_ids:[id]});
  assert.equal(run.preparedCount,1);assert.equal(run.estimatedCostUsd,null);assert.equal(run.raw_text,undefined);assert.equal(run.request_hash,undefined);
});
test('estimated run cost includes actual thinking usage and incomplete or unknown pricing stays null',()=>{
  const row={model:'gemini-3.5-flash',usage:{promptTokenCount:1000,candidatesTokenCount:100,thoughtsTokenCount:50,totalTokenCount:1150}};
  assert.equal(projectResearchRun(row).estimatedCostUsd,0.00285);
  assert.equal(projectResearchRun({...row,usage:{promptTokenCount:1000,candidatesTokenCount:100}}).estimatedCostUsd,null);
  assert.equal(projectResearchRun({...row,model:'unknown-new-model'}).estimatedCostUsd,null);
});
