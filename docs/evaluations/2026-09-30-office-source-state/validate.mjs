import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('./',import.meta.url),commit='c6d1ca8de5ca8e531c145a7f869b1fd85fec16f6';
const json=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const digest=b=>createHash('sha256').update(b).digest('hex');
const stable=v=>Array.isArray(v)?`[${v.map(stable).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`:JSON.stringify(v);
const hash=v=>digest(stable(v));
const counts=values=>Object.fromEntries([...new Set(values)].map(v=>[v,values.filter(x=>x===v).length]));
const summaries={};
for(const kind of ['development','holdout']){
 const bytes=await readFile(new URL(`runs/${kind}.jsonl`,base));assert(bytes.toString().endsWith('\n'));
 const entries=bytes.toString().trimEnd().split('\n').map(JSON.parse),run=entries[0];
 const cases=await json(`suites/${kind}/cases.json`),freeze=await json(`suites/${kind}/freeze.json`),review=await json(`assessments/${kind}.json`),started=await json(`suites/${kind}/run-started.json`);
 assert.equal(started.head,commit);assert.equal(review.baseCommit,commit);assert.equal(started.runId,run.runId);
 assert.equal(run.datasetStatus,kind==='development'?'development':'independent-holdout');assert.equal(review.datasetStatus,run.datasetStatus);
 assert.equal(digest(await readFile(new URL(`suites/${kind}/cases.json`,base))),freeze.datasetFileSha256);
 assert.equal(hash(cases),run.suiteHash);assert.deepEqual(run.scenarios,cases);assert.equal(review.suiteHash,run.suiteHash);assert.equal(review.runId,run.runId);
 const expected=new Set(cases.flatMap(s=>s.turns.map(t=>s.id+'/'+t.id))),records=new Map(),pending=new Set();
 const results=[],checks=[];
 for(const e of entries.slice(1)){
  if(e.type==='attempt'){assert(!pending.has(e.id));pending.add(e.id);}
  else if(e.type==='result'){
   const r=e.record;assert(expected.has(r.id)&&!records.has(r.id));records.set(r.id,r);results.push(r);
   assert.equal(hash(r.response),r.responseHash);
   if(r.request)assert.equal(hash({request:r.request,context:r.context}),r.inputHash);
   if(r.response.status!=='blocked')assert(pending.delete(r.id));
  }else{assert.equal(e.type,'runtime-check');checks.push(e);}
 }
 assert.equal(results.length,expected.size);assert.equal(pending.size,0);assert.equal(checks.length,1);
 assert.equal(checks[0].unchanged,true);assert.equal(checks[0].bundleHash,run.provenance.bundleHash);assert.equal(checks[0].coverage.verifiedResultCount,results.length);
 assert.equal(checks[0].coverage.resultsHash,hash(results.map(({id,inputHash=null,responseHash})=>({id,inputHash,responseHash}))));
 let anchors=0,criteria=0;const statuses={met:0,'partially-met':0,'not-met':0,unassessed:0};
 const anchor=a=>{
  let text;
  if(a.kind==='response'){const r=records.get(a.recordId);assert.equal(r.response.status,'generated');text=a.path.reduce((v,k)=>v[k],r);}
  else{assert.equal(a.kind,'source');const s=cases.find(s=>s.id===a.caseId);text=[...s.sources,...s.turns.flatMap(t=>t.extraSources)].find(s=>s.id===a.sourceId)?.text;}
  assert.equal(typeof text,'string');assert(text.includes(a.quote),JSON.stringify(a));anchors++;
 };
 assert.deepEqual(review.scenarioAssessments.map(a=>a.caseId),cases.map(s=>s.id));
 for(const a of review.scenarioAssessments){
  const s=cases.find(s=>s.id===a.caseId);assert.equal(a.criteria.length,s.expected.length);
  for(const [i,c] of a.criteria.entries()){assert.equal(c.index,i);assert.equal(c.criterion,s.expected[i]);assert(Object.hasOwn(statuses,c.status));statuses[c.status]++;criteria++;assert(c.anchors.length);c.anchors.forEach(anchor);}
  for(const c of a.additionalConcerns||[])c.anchors.forEach(anchor);
 }
 const calls=results.flatMap(r=>r.response.evaluationTrace?.calls||[]),times=results.map(r=>r.elapsedMs).sort((a,b)=>a-b),mid=Math.floor(times.length/2);
 const summary={formatVersion:1,dataset:kind,datasetStatus:run.datasetStatus,baseCommit:commit,roleVersion:'2026-09-30.v26-role-proportionality',sourcePolicyVersion:'source-state-v1',runId:run.runId,startedAt:run.createdAt,endedAt:checks[0].at,modelConfiguration:run.provenance.modelConfiguration,runtimeBundleHash:run.provenance.bundleHash,sourceCount:Object.keys(run.provenance.sources).length,datasetFileSha256:freeze.datasetFileSha256,suiteHash:run.suiteHash,fingerprint:hash({runId:run.runId,suiteHash:run.suiteHash,provenance:run.provenance,results:results.map(r=>({id:r.id,inputHash:r.inputHash||null,responseHash:r.responseHash}))}),journalSha256:digest(bytes),runtimeIntegrity:'verified',actualConcurrency:1,retries:0,splicing:false,coverage:{scenarios:cases.length,planned:expected.size,recorded:results.length,statuses:counts(results.map(r=>r.response.status)),interrupted:pending.size,subjects:[...new Set(cases.flatMap(s=>s.subjects))],nineRoleOverallCertification:false},provider:{calls:calls.length,outcomes:counts(calls.map(c=>c.result?.reason||'unknown')),actualModelVersions:counts(calls.map(c=>c.result?.modelVersion||'unavailable'))},generationLatencyMs:{min:times[0],median:times.length%2?times[mid]:(times[mid-1]+times[mid])/2,max:times.at(-1)},semanticReview:{frozenCriteria:criteria,statuses,validatedQuoteAnchors:anchors,scenarioVerdicts:counts(review.scenarioAssessments.map(a=>a.verdict)),countsAreIndependentScores:false}};
 await writeFile(new URL(`${kind}-summary.json`,base),JSON.stringify(summary,null,2)+'\n');summaries[kind]=summary;
}
assert.equal(summaries.development.runtimeBundleHash,summaries.holdout.runtimeBundleHash);
const chronology=await json('suites/holdout/chronology.json');
assert(Date.parse(chronology.privateSuiteFrozenAt)>Date.parse(chronology.candidateCommittedAt));
assert.equal(chronology.preCommitFreeze,false);assert.equal(chronology.preImplementationFreeze,false);
const oldBytes=await readFile(new URL('../2026-09-30-office-v26-holdout/runs/v26-frozen.jsonl',base));
assert.equal(digest(oldBytes),'ea945e5839bfe9d6daa39f1ad36f286ccfc5900ce9f8f52697027e0bb389e7ab');
const output={status:'PASS',checks:['exact-dataset-bytes-and-criteria','development-vs-holdout-classification','all-input-response-hashes','runtime-coverage-hashes','zero-pending-attempts','every-quote-anchor','honest-after-commit-chronology','original-v26-journal-unchanged'],summaries};
console.log(JSON.stringify(output,null,2));
