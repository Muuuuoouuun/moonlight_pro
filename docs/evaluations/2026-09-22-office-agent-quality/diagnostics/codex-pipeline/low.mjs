import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCodexCliProvider } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/scripts/office-evaluation/codex-provider.mjs';
import { generateOfficeResponse } from '/Users/clmagi/Desktop/Projects/moonlight_proj/apps/engine/lib/office/service.ts';
import { createTracedOfficeGenerator } from '/Users/clmagi/Desktop/Projects/moonlight_proj/scripts/office-evaluation/trace.mjs';
import { collectOfficeQualityProvenance, createOfficeQualityRun, qualityHash, runOfficeQualityEvaluation, openOfficeQualityJournal } from '/Users/clmagi/Desktop/Projects/moonlight_proj/scripts/office-evaluation/runner.mjs';
import { OFFICE_QUALITY_SCENARIOS } from '/Users/clmagi/Desktop/Projects/moonlight_proj/scripts/office-evaluation/scenarios.mjs';
const prefix='/tmp/moonlight-office-codex-low-pipeline';
const adapterPath='/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/scripts/office-evaluation/codex-provider.mjs';
const adapter=await createCodexCliProvider({command:process.execPath,argv:['/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/node_modules/@openai/codex/bin/codex.js']});
const snapshot=async()=>{
  const base=await collectOfficeQualityProvenance();
  const sources={...base.sources};
  sources['evaluation-adapter:codex-provider.mjs']=createHash('sha256').update(await readFile(adapterPath)).digest('hex');
  sources['evaluation-runner:codex-pipeline.mjs']=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
  const modelConfiguration={provider:'codex-cli',model:'codex-cli-default',adapter:adapter.provenance,reasoningOverride:'low',experiment:'All generation phases use low effort; instructions and deadline unchanged'};
  return {...base,sources,modelConfiguration,bundleHash:qualityHash({sources,modelConfiguration})};
};
const provenance=await snapshot();
const only=['vaporeon-evidence','jolteon-evidence','umbreon-social','glaceon-social','delivery-urgent'];
const scenarios=OFFICE_QUALITY_SCENARIOS.filter(s=>only.includes(s.id));
const run=createOfficeQualityRun(scenarios,{provenance,datasetStatus:'development'});
const journal=await openOfficeQualityJournal(prefix+'.run.jsonl',{run});
await writeFile(prefix+'.provider.jsonl','',{flag:'wx',mode:0o600});
let sequence=0;let queue=Promise.resolve();
const observed=async(input)=>{
 const id=++sequence;const started=Date.now();const {signal,...request}=input;
 const appliedInput={...input,thinkingLevel:'low'};
 const response=await adapter.generate(appliedInput);
 const {signal:appliedSignal,...appliedRequest}=appliedInput;
 queue=queue.then(()=>appendFile(prefix+'.provider.jsonl',JSON.stringify({id,request,appliedRequest,response,elapsedMs:Date.now()-started})+'\n'));
 await queue;
 return response;
};
try {
 const report=await runOfficeQualityEvaluation(run,{
  generate:createTracedOfficeGenerator(generateOfficeResponse,observed,'codex-cli-default'),concurrency:1,
  onAttempt:attempt=>journal.append({type:'attempt',...attempt}),
  onResult:async record=>{await journal.append({type:'result',record});console.log(JSON.stringify({id:record.id,status:record.response.status,errorCode:record.response.errorCode,elapsedMs:record.elapsedMs}));},
 });
 const end=await snapshot();const unchanged=provenance.bundleHash===end.bundleHash;
 await journal.append({type:'runtime-check',at:new Date().toISOString(),unchanged,bundleHash:end.bundleHash,officeVersion:end.officeVersion});
 console.log(JSON.stringify({summary:report.summary,runtimeUnchanged:unchanged,quality:'unscored'}));
 if(!unchanged||report.summary.generated!==report.summary.planned)process.exitCode=1;
} finally {await queue;await journal.close();}
