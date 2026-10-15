import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('./',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const digest=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`:JSON.stringify(value);
const hash=value=>digest(stable(value));
const bytes=await readFile(new URL('runs/v26-frozen.jsonl',base));
assert(bytes.toString().endsWith('\n'));
const entries=bytes.toString().trimEnd().split('\n').map(JSON.parse),run=entries[0];
const results=entries.filter(e=>e.type==='result').map(e=>e.record);
const checks=entries.filter(e=>e.type==='runtime-check');
const cases=await json('suite/cases.json'),freeze=await json('suite/freeze.json'),review=await json('assessment.json');
assert.equal(digest(await readFile(new URL('suite/cases.json',base))),freeze.datasetFileSha256);
assert.equal(hash(cases),run.suiteHash);assert.deepEqual(run.scenarios,cases);
assert.equal(review.suiteHash,run.suiteHash);assert.equal(review.runId,run.runId);
assert.equal(review.baseCommit,'15101f5c59bc011090f1e7d9670c57bbdf9aa9fd');
const known=new Set(cases.flatMap(s=>s.turns.map(t=>s.id+'/'+t.id)));
assert.equal(results.length,known.size);
const records=new Map();const pending=new Set();
for(const e of entries.slice(1)){
 if(e.type==='attempt'){assert(!pending.has(e.id));pending.add(e.id);}
 else if(e.type==='result'){
  const r=e.record;assert(known.has(r.id)&&!records.has(r.id));records.set(r.id,r);
  assert.equal(hash(r.response),r.responseHash);
  if(r.request)assert.equal(hash({request:r.request,context:r.context}),r.inputHash);
  if(r.response.status!=='blocked')assert(pending.delete(r.id));
 }else assert.equal(e.type,'runtime-check');
}
assert.equal(pending.size,0);assert.equal(checks.length,1);
assert.equal(checks[0].unchanged,true);assert.equal(checks[0].bundleHash,run.provenance.bundleHash);
assert.equal(checks[0].coverage.verifiedResultCount,results.length);
assert.equal(checks[0].coverage.resultsHash,hash(results.map(({id,inputHash=null,responseHash})=>({id,inputHash,responseHash}))));
let criteria=0,anchors=0;const statuses={met:0,'partially-met':0,'not-met':0,unassessed:0};
const checkAnchor=a=>{
 let target;
 if(a.kind==='response'){
  const r=records.get(a.recordId);assert.equal(r.response.status,'generated');
  target=a.path.reduce((obj,key)=>obj[key],r);
 }else{
  assert.equal(a.kind,'source');const s=cases.find(s=>s.id===a.caseId);
  target=[...s.sources,...s.turns.flatMap(t=>t.extraSources)].find(s=>s.id===a.sourceId)?.text;
 }
 assert.equal(typeof target,'string');assert(target.includes(a.quote),JSON.stringify(a));anchors++;
};
assert.deepEqual(review.scenarioAssessments.map(a=>a.caseId),cases.map(s=>s.id));
for(const a of review.scenarioAssessments){
 const s=cases.find(s=>s.id===a.caseId);assert.equal(a.criteria.length,s.expected.length);
 for(const [index,c] of a.criteria.entries()){
  assert.equal(c.index,index);assert.equal(c.criterion,s.expected[index]);assert(Object.hasOwn(statuses,c.status));
  statuses[c.status]++;criteria++;assert(c.anchors.length);c.anchors.forEach(checkAnchor);
 }
 for(const c of a.additionalConcerns||[])c.anchors.forEach(checkAnchor);
}
const calls=results.flatMap(r=>r.response.evaluationTrace?.calls||[]);
const frequency=values=>Object.fromEntries([...new Set(values)].map(v=>[v,values.filter(x=>x===v).length]));
const times=results.map(r=>r.elapsedMs).sort((a,b)=>a-b);
const fingerprint=hash({runId:run.runId,suiteHash:run.suiteHash,provenance:run.provenance,results:results.map(r=>({id:r.id,inputHash:r.inputHash||null,responseHash:r.responseHash}))});
const summary={formatVersion:1,baseCommit:review.baseCommit,roleVersion:review.roleVersion,runId:run.runId,startedAt:run.createdAt,endedAt:checks[0].at,modelConfiguration:run.provenance.modelConfiguration,runtimeBundleHash:run.provenance.bundleHash,sourceCount:Object.keys(run.provenance.sources).length,datasetFileSha256:freeze.datasetFileSha256,suiteHash:run.suiteHash,fingerprint,journalSha256:digest(bytes),runtimeIntegrity:'verified',actualConcurrency:1,retries:0,splicing:false,coverage:{scenarios:cases.length,planned:known.size,recorded:results.length,statuses:frequency(results.map(r=>r.response.status)),interrupted:pending.size,subjects:[...new Set(cases.flatMap(s=>s.subjects))],nineRoleOverallCertification:false},provider:{calls:calls.length,outcomes:frequency(calls.map(c=>c.result?.reason||'unknown')),actualModelVersions:frequency(calls.map(c=>c.result?.modelVersion||'unavailable')),requestedModels:frequency(calls.map(c=>c.settings.modelRequested||'unavailable'))},generationLatencyMs:{min:times[0],median:(times[3]+times[4])/2,max:times.at(-1)},semanticReview:{frozenCriteria:criteria,statuses,validatedQuoteAnchors:anchors,scenarioVerdicts:frequency(review.scenarioAssessments.map(a=>a.verdict)),criteriaAreIndependentScores:false},disclosure:'Held out at this frozen run; h01/h02 later disclosed to the prompt implementer for subsequent development. Reuse is development, not fresh holdout.'};
await writeFile(new URL('execution-summary.json',base),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',checks:['frozen-case-bytes','suite-hash','request-response-hashes','runtime-coverage-hash','no-pending-attempts','all-frozen-criteria-covered','all-quote-anchors-valid'],criteria,anchors,summary},null,2));
