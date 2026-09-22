import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCodexCliProvider } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/scripts/office-evaluation/codex-provider.mjs';
import { generateOfficeResponse } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/apps/engine/lib/office/service.ts';
import { buildOfficePrompt } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/apps/engine/lib/office/prompt.ts';
import { officeResponseSchema } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/apps/engine/lib/office/response-schema.ts';
import { buildOfficeSourceCatalog, officeSourceReviewPrompt, officeSourceReviewSchema, readSourceReviewedOutput } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/apps/engine/lib/office/source-review.ts';
import { OFFICE_VERSION, parseOfficeAnswer } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/packages/agent-contracts/office.js';
import { createTracedOfficeGenerator } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/scripts/office-evaluation/trace.mjs';
import { collectOfficeQualityProvenance, createOfficeQualityRun, qualityHash, runOfficeQualityEvaluation, openOfficeQualityJournal } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/scripts/office-evaluation/runner.mjs';
import { OFFICE_QUALITY_SCENARIOS } from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/scripts/office-evaluation/scenarios.mjs';
const prefix='/tmp/moonlight-office-codex-single-pass';
const adapterPath='/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/scripts/office-evaluation/codex-provider.mjs';
const adapter=await createCodexCliProvider({command:process.execPath,argv:['/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare/node_modules/@openai/codex/bin/codex.js']});
const snapshot=async()=>{
 const base=await collectOfficeQualityProvenance();const sources={...base.sources};
 sources['evaluation-adapter:codex-provider.mjs']=createHash('sha256').update(await readFile(adapterPath)).digest('hex');
 sources['evaluation-runner:codex-single-pass.mjs']=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
 const modelConfiguration={provider:'codex-cli',model:'codex-cli-default',adapter:adapter.provenance,reasoningOverride:'low',experiment:'One source-bound individual generation; original multi-call council; shared 48-second deadline unchanged'};
 return {...base,sources,modelConfiguration,bundleHash:qualityHash({sources,modelConfiguration})};
};
async function singlePass(request,context,generate,onDiagnostic){
 if(request.mode==='council') return generateOfficeResponse(request,context,generate,onDiagnostic);
 const meta={ownerId:request.ownerId,mode:request.mode,scope:request.scope,participants:request.participants,lens:null,simulation:false,version:OFFICE_VERSION,context};
 const signal=AbortSignal.timeout(48_000);const catalog=buildOfficeSourceCatalog(request,context);
 const built=officeSourceReviewPrompt(buildOfficePrompt(request,context),catalog);
 const input={...built,systemInstruction:built.systemInstruction+'\n이번 호출에서 최종 답변을 처음 작성한다. 별도 AI 초안은 없다. 원문의 범위와 사실·미확인·제안을 구분해 확인하고 답변한다. 초안 교정 내역이 없으면 corrections는 빈 배열이다.',responseJsonSchema:officeSourceReviewSchema(officeResponseSchema(request.mode),catalog),maxOutputTokens:8192,thinkingLevel:'low',signal};
 let phase='draft',category='provider';
 try {
  const response=await generate(input);
  if(!response.ok) {onDiagnostic?.({phase,category:signal.aborted?'deadline':'provider',ownerId:request.ownerId});return {...meta,status:'error',error:'단일 작성 실험의 공급자 호출 실패'};}
  if(signal.aborted){category='deadline';signal.throwIfAborted();}
  category='json';const raw=JSON.parse(response.text);
  category='source-review';const reviewed=readSourceReviewedOutput(raw,request,context,catalog);
  category='contract';const answer=parseOfficeAnswer(reviewed,request.mode);
  return {...meta,status:'generated',...answer,model:response.model};
 }catch{onDiagnostic?.({phase,category,ownerId:request.ownerId});return {...meta,status:'error',error:'단일 작성 실험의 응답 경계 실패'};}
}
const provenance=await snapshot();
const only=['jolteon-work','jolteon-evidence','flareon-evidence','glaceon-social','delivery-urgent'];
const run=createOfficeQualityRun(OFFICE_QUALITY_SCENARIOS.filter(s=>only.includes(s.id)),{provenance,datasetStatus:'development'});
const journal=await openOfficeQualityJournal(prefix+'.run.jsonl',{run});
await writeFile(prefix+'.provider.jsonl','',{flag:'wx',mode:0o600});
let sequence=0,queue=Promise.resolve();
const observed=async(input)=>{
 const id=++sequence,started=Date.now(),{signal,...request}=input;
 const appliedInput={...input,thinkingLevel:'low'};const response=await adapter.generate(appliedInput);const {signal:appliedSignal,...appliedRequest}=appliedInput;
 queue=queue.then(()=>appendFile(prefix+'.provider.jsonl',JSON.stringify({id,request,appliedRequest,response,elapsedMs:Date.now()-started})+'\n'));await queue;return response;
};
try{
 const report=await runOfficeQualityEvaluation(run,{generate:createTracedOfficeGenerator(singlePass,observed,'codex-cli-default'),concurrency:1,onAttempt:a=>journal.append({type:'attempt',...a}),onResult:async record=>{await journal.append({type:'result',record});console.log(JSON.stringify({id:record.id,status:record.response.status,errorCode:record.response.errorCode,elapsedMs:record.elapsedMs}));}});
 const end=await snapshot(),unchanged=provenance.bundleHash===end.bundleHash;
 await journal.append({type:'runtime-check',at:new Date().toISOString(),unchanged,bundleHash:end.bundleHash,officeVersion:end.officeVersion});
 console.log(JSON.stringify({summary:report.summary,runtimeUnchanged:unchanged,quality:'unscored'}));if(!unchanged||report.summary.generated!==report.summary.planned)process.exitCode=1;
}finally{await queue;await journal.close();}
