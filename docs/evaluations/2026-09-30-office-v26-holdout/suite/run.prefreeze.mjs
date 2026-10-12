import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const {values}=parseArgs({options:{'runtime-root':{type:'string'},live:{type:'boolean',default:false},output:{type:'string'},'expect-commit':{type:'string'},'expect-model':{type:'string',default:'gemini-3-flash-preview'}}});
if(!values['runtime-root'])throw new Error('--runtime-root is required.');
const runtimeRoot=resolve(values['runtime-root']);
const bytes=await readFile(resolve(here,'cases.json'));
const freeze=JSON.parse(await readFile(resolve(here,'freeze.json'),'utf8'));
const datasetFileSha256=createHash('sha256').update(bytes).digest('hex');
if(datasetFileSha256!==freeze.datasetFileSha256)throw new Error('Frozen private dataset changed.');
const scenarios=JSON.parse(bytes.toString('utf8'));
const fromRoot=path=>import(pathToFileURL(resolve(runtimeRoot,path)).href);
const runner=await fromRoot('scripts/office-evaluation/runner.mjs');
const provenance=await runner.collectOfficeQualityProvenance();
const run=runner.createOfficeQualityRun(scenarios,{provenance,datasetStatus:'independent-holdout'});
if(!values.live){
 console.log(JSON.stringify({status:'validated-no-model-calls',scenarios:scenarios.length,generationCalls:run.plan.generationCalls,datasetFileSha256,suiteHash:run.suiteHash},null,2));
 process.exit(0);
}
if(!values.output||!/^[0-9a-f]{40}$/.test(values['expect-commit']||''))throw new Error('Live run requires --output and exact --expect-commit.');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:runtimeRoot,encoding:'utf8'}).trim();
if(head!==values['expect-commit'])throw new Error('Runtime HEAD does not match frozen correction commit.');
execFileSync('git',['diff','--quiet'],{cwd:runtimeRoot});
execFileSync('git',['diff','--cached','--quiet'],{cwd:runtimeRoot});
if(provenance.modelConfiguration.model!==values['expect-model'])throw new Error('Configured model differs from explicitly expected model.');
if(!(process.env.GEMINI_API_KEY?.trim()||process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()))throw new Error('Gemini configuration missing.');
const {generateOfficeResponse}=await fromRoot('apps/engine/lib/office/service.ts');
const {generateGeminiText}=await fromRoot('apps/engine/lib/gemini.ts');
const {createTracedOfficeGenerator}=await fromRoot('scripts/office-evaluation/trace.mjs');
await writeFile(resolve(here,'run-started.json'),JSON.stringify({at:new Date().toISOString(),head,datasetFileSha256,suiteHash:run.suiteHash,runId:run.runId,output:resolve(values.output),model:provenance.modelConfiguration},null,2)+'\n',{flag:'wx',mode:0o600});
const journal=await runner.openOfficeQualityJournal(values.output,{run});
const records=[];
try{
 const report=await runner.runOfficeQualityEvaluation(run,{
  generate:createTracedOfficeGenerator(generateOfficeResponse,generateGeminiText,provenance.modelConfiguration.model),concurrency:1,
  onAttempt:attempt=>journal.append({type:'attempt',...attempt}),
  onResult:async record=>{await journal.append({type:'result',record});records.push(record);console.log(JSON.stringify({id:record.id,status:record.response.status,errorCode:record.response.errorCode||null,elapsedMs:record.elapsedMs}));},
 });
 const end=await runner.collectOfficeQualityProvenance();
 const unchanged=provenance.bundleHash===end.bundleHash&&provenance.officeVersion===end.officeVersion;
 const resultsHash=runner.qualityHash(records.map(({id,inputHash=null,responseHash})=>({id,inputHash,responseHash})));
 await journal.append({type:'runtime-check',at:new Date().toISOString(),unchanged,bundleHash:end.bundleHash,officeVersion:end.officeVersion,coverage:{version:1,priorResultCount:0,priorResultsHash:runner.qualityHash([]),resultCount:records.length,resultsHash,verifiedResultCount:unchanged?records.length:0,runtimeIntegrity:unchanged?'verified':'unverified'}});
 console.log(JSON.stringify({summary:report.summary,datasetFileSha256,suiteHash:run.suiteHash,baseCommit:head,unchanged,qualityClaim:'unscored-targeted-holdout'},null,2));
 if(!unchanged||report.summary.generated!==report.summary.planned)process.exitCode=1;
}finally{await journal.close();}
