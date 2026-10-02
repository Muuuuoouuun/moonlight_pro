import assert from 'node:assert/strict';
import test from 'node:test';
import { runResearchPreparation, runResearchSweep } from './research-run-service.js';
const W='11111111-1111-4111-8111-111111111111',R='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333';
const command={requestId:R,brand:'22nomad'};
function dependencies(extra={}){const steps=[];return {steps,workspaceId:W,env:{COM_MOON_ENGINE_URL:'https://engine.test',COM_MOON_SHARED_WEBHOOK_SECRET:'secret'},read:async()=>({configured:true,rows:[{id:B,workspace_id:W,slug:'22nomad',status:'active'}]}),rpc:async(name,params)=>{steps.push(name);return {ok:true,data:name==='research_run_claim_v1'?{status:'claimed',run:{id:R,brand_slug:'22nomad',status:'running'}}:name==='research_source_claim_v1'?{status:'claimed',preparationId:B}:{status:'saved',run:{id:R,brand_slug:'22nomad',status:'success',counts:{preparedCount:1},brief_ids:[B]}}};},discover:async()=>({candidates:[{url:'https://example.org/release',title:'Release',official:true}],failures:[]}),sourceRead:async url=>({url,body:'<article><p>A new release is available to users with a paid account. Access requires an active subscription and a supported region; broader availability is not announced.</p></article>',contentType:'text/html'}),prepare:async()=>{steps.push('engine');return {status:'saved',briefId:B,usage:{totalTokenCount:20}};},search:async()=>{steps.push('search');return {status:'preview',calls:0};},...extra};}
test('run and source are claimed durably before paid calls and success exposes bounded receipt',async()=>{const deps=dependencies();const result=await runResearchPreparation(command,deps);assert.equal(result.status,'ok');assert.deepEqual(deps.steps,['research_run_claim_v1','search','research_source_claim_v1','engine','research_run_finish_v1']);assert.equal(result.run.preparedCount,1);});
test('request replay and unknown claims never invoke source discovery or model',async()=>{for(const status of ['duplicate','running']){const deps=dependencies({rpc:async()=>({ok:true,data:{status,run:{id:R,status:'running'}}}),discover:async()=>{throw Error('must not collect');},prepare:async()=>{throw Error('must not pay');}});const result=await runResearchPreparation(command,deps);assert.equal(result.replayed,true);}});
test('source duplicate skips model and bounded errors are recorded while official sources work without Brave',async()=>{const deps=dependencies({rpc:async(name)=>({ok:true,data:name==='research_run_claim_v1'?{status:'claimed',run:{id:R}}:name==='research_source_claim_v1'?{status:'duplicate',briefId:B}:{status:'saved',run:{id:R,status:'success',counts:{preparedCount:0,duplicateCount:1}}}}),prepare:async()=>{throw Error('must not pay');}});assert.equal((await runResearchPreparation(command,deps)).run.duplicateCount,1);});
test('wrong database brand and unconfirmed request claims fail before any model',async()=>{for(const deps of [dependencies({read:async()=>({configured:true,rows:[{id:B,workspace_id:W,slug:'other',status:'active'}]})}),dependencies({rpc:async()=>({ok:false})})]){deps.prepare=async()=>{throw Error('must not pay');};const result=await runResearchPreparation(command,deps);assert.equal(result.status,'error');}});
test('invalid evidence is not passed to Engine and Engine failure finishes a recoverable partial receipt',async()=>{const deps=dependencies({prepare:async()=>({status:'unknown',reason:'preparation-outcome-unknown'}),rpc:async(name)=>({ok:true,data:name==='research_run_claim_v1'?{status:'claimed',run:{id:R}}:name==='research_source_claim_v1'?{status:'claimed',preparationId:B}:{status:'saved',run:{id:R,status:'failed',reason:'preparation-outcome-unknown'}}})});assert.equal((await runResearchPreparation(command,deps)).status,'error');});
test('disabled sweep performs no source/model work and enabled sweep records scheduled runs',async()=>{let calls=0,recorded=0;const options={now:new Date('2026-10-01T08:00:00+09:00'),env:{COM_MOON_RESEARCH_ENABLED:'false'},run:async()=>{calls++;return {status:'ok',run:{id:R}};},record:async()=>{recorded++;return {persisted:true};}};assert.equal((await runResearchSweep(options)).status,'disabled');assert.equal(calls,0);options.env.COM_MOON_RESEARCH_ENABLED='true';assert.equal((await runResearchSweep(options)).runs.length,3);assert.equal(recorded,1);});
test('scheduled brands start together so a slow education model cannot starve other brands',async()=>{
  let started=0;const release=[];
  const running=runResearchSweep({now:new Date('2026-10-01T08:00:00+09:00'),env:{COM_MOON_RESEARCH_ENABLED:'true'},run:async()=>{started++;await new Promise(resolve=>release.push(resolve));return {status:'ok',run:{id:R}};},record:async()=>({persisted:true})});
  await new Promise(resolve=>setImmediate(resolve));const count=started;release.forEach(resolve=>resolve());assert.equal(count,3);await running;
});
test('failed discovery with no readable originals is durably recorded as failure rather than success',async()=>{
  let final;
  const deps=dependencies({discover:async()=>({candidates:[],failures:[{source:'moe',reason:'robots-disallowed'}]}),search:async()=>({status:'error',reason:'brave-upstream-failed',calls:1}),rpc:async(name,params)=>{if(name==='research_run_claim_v1')return {ok:true,data:{status:'claimed',run:{id:R}}};final=params.p_result;return {ok:true,data:{run:{id:R,status:final.counts.failedCount?'failed':'success',reason:final.reason,counts:final.counts}}};}});
  const result=await runResearchPreparation(command,deps);assert.equal(result.status,'error');assert.equal(final.counts.failedCount,2);
});
test('unknown terminal request replay stays an error receipt and never restarts paid work',async()=>{
  const deps=dependencies({rpc:async()=>({ok:true,data:{status:'duplicate',run:{id:R,status:'unknown',reason:'model-outcome-unknown'}}}),discover:async()=>{throw Error('must not discover');}});const result=await runResearchPreparation(command,deps);assert.equal(result.status,'error');assert.equal(result.run.status,'unknown');assert.equal(result.replayed,true);
});

test('replayed scheduled receipts remain readable without adding another automation run',async()=>{
  for(const runStatus of ['ok','running','error','partial']){
    const receipt={status:runStatus,replayed:true,run:{id:R,status:runStatus,preparedCount:1}};
    const result=await runResearchSweep({now:new Date('2026-10-01T08:15:00+09:00'),env:{COM_MOON_RESEARCH_ENABLED:'true'},
      run:async()=>receipt,record:async()=>assert.fail('replay must not insert automation rows')});
    assert.equal(result.status,['error','partial'].includes(runStatus)?'partial':'ok');
    assert.deepEqual(result.runs,[receipt,receipt,receipt]);
    assert.equal(result.automationRecorded,false);assert.equal(result.automationLog,'not-needed');
  }
});

test('fresh successful, failed, running and interrupted attempts still record their actual sweep',async()=>{
  for(const fresh of [{status:'ok',run:{id:R}}, {status:'error',run:{id:R}}, {status:'running',attempted:true,replayed:true,run:{id:R}}, null]){
    let writes=0,logged,index=0;
    const result=await runResearchSweep({now:new Date('2026-10-01T08:15:00+09:00'),env:{COM_MOON_RESEARCH_ENABLED:'true'},
      run:async()=>{if(index++===0){if(fresh===null)throw Error('private interrupted exception');return fresh;}return {status:'ok',replayed:true,run:{id:R}};},
      record:async input=>{writes++;logged=input;return {persisted:true};}});
    assert.equal(writes,1);assert.equal(result.automationRecorded,true);assert.equal(result.automationLog,'saved');
    assert.deepEqual(logged.output.runs,result.runs);assert.equal(logged.status,result.status==='ok'?'success':'failure');
    assert.equal(JSON.stringify(result).includes('private interrupted exception'),false);
  }
});

test('automation log failure is visible without throwing or repeating paid preparation',async()=>{
  for(const record of [async()=>{throw Error('private database exception');},async()=>({persisted:false}),async()=>null]){
    let attempts=0;
    const result=await runResearchSweep({now:new Date('2026-10-01T10:15:00+09:00'),env:{COM_MOON_RESEARCH_ENABLED:'true'},
      run:async()=>{attempts++;return {status:'ok',run:{id:R,preparedCount:1}};},record});
    assert.equal(attempts,1);assert.equal(result.status,'ok');assert.equal(result.runs[0].run.preparedCount,1);
    assert.equal(result.automationRecorded,false);assert.equal(result.automationLog,'error');
    assert.equal(JSON.stringify(result).includes('private database exception'),false);
  }
});

test('Hub allows the two-stage research writer and review to finish before its bounded deadline',async()=>{
  const {callResearchEngine}=await import('./research-run-service.js');
  const original=AbortSignal.timeout;let timeoutMs;
  try{
    AbortSignal.timeout=milliseconds=>{timeoutMs=milliseconds;return new AbortController().signal;};
    const result=await callResearchEngine({workspaceId:W,preparationId:B},{env:{COM_MOON_ENGINE_URL:'https://engine.test',COM_MOON_SHARED_WEBHOOK_SECRET:'secret'},fetchImpl:async()=>{
      if(timeoutMs<45000*2+15000)throw new Error('premature timeout after writer');
      return {ok:true,json:async()=>({status:'saved',briefId:B})};
    }});
    assert.equal(result.status,'saved');assert.equal(timeoutMs,115000);
  }finally{AbortSignal.timeout=original;}
});
test('insufficient remaining run time cannot claim a paid two-stage preparation',async()=>{
  let current=0,claims=0,reads=0;
  const deps=dependencies({now:()=>current,discover:async()=>{current=110000;return {candidates:[{url:'https://example.org/a',title:'Release',official:true}],failures:[]};},sourceRead:async()=>{reads++;return {url:'https://example.org/a',body:'<article>A new public release is available. Access requires an active paid subscription and a supported account; broader availability is not announced.</article>',contentType:'text/html'};},prepare:async()=>assert.fail('not enough time for writer and review')});
  const rpc=deps.rpc;deps.rpc=async(name,params)=>{if(name==='research_source_claim_v1')claims++;return rpc(name,params);};
  await runResearchPreparation(command,deps);assert.equal(reads,0);assert.equal(claims,0);
});
test('source collection time is rechecked before any new paid preparation claim',async()=>{
  let current=0,claims=0;
  const deps=dependencies({now:()=>current,sourceRead:async()=>{current=115000;return {url:'https://example.org/release',body:'<article>A new public release is available. Access requires an active paid subscription and a supported account; broader availability is not announced.</article>',contentType:'text/html'};},prepare:async()=>assert.fail('writer must not start after collection consumes its budget')});
  const rpc=deps.rpc;deps.rpc=async(name,params)=>{if(name==='research_source_claim_v1')claims++;return rpc(name,params);};
  await runResearchPreparation(command,deps);assert.equal(claims,0);
});
