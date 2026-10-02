import { invokeSupabaseRpc } from './supabase-rest.ts';
import { classifyGeminiFailure, generateGeminiText, getGeminiResponseDiagnostics } from './gemini.ts';
import { aggregateResearchUsage, buildResearchWriterPrompt, buildResearchReviewPrompt, buildResearchSystemInstruction, groundResearchScheduleNote, researchCitationLines, type ResearchGenerationStage } from './research-editorial.ts';
import { contentQualityGeneration } from './content-quality.ts';

type Row=Record<string,any>;
type Evidence={id:string;url:string;title:string;text:string;documentHash:string};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text=(value:unknown,max:number,required=false)=>typeof value==='string'&&value.length<=max&&!value.includes('\0')&&(!required||value.trim())?value.trim():null;
const space=(value:string)=>value.replace(/\s+/g,' ').trim();
export const MAX_RESEARCH_PREPARE_BYTES=4096;

function providerFailure(generated:Row) {
  const diagnostics=getGeminiResponseDiagnostics(generated),failureCategory=classifyGeminiFailure(generated);
  // A received rejection or unusable completed response is definitive. A
  // transport error can happen after HTTP headers, so status alone must never
  // release a draft slot when the helper reports timeout/network/abort.
  const invalidResponse=['invalid-json','blocked-prompt','blocked-output','incomplete-output','empty-output'].includes(failureCategory);
  const rejectedRequest=['missing-api-key','authentication','rate-limit','provider-unavailable','invalid-request','http-error'].includes(failureCategory);
  return {reason:invalidResponse?'model-response-invalid':rejectedRequest?'model-request-rejected':'model-outcome-unknown',providerDiagnostic:{failureCategory,
    ...(diagnostics.finishReason?{finishReason:diagnostics.finishReason}:{}),
    ...(diagnostics.promptFeedback?{blockReason:diagnostics.promptFeedback.blockReason}:{}),
    ...(Number.isInteger(generated.status)&&generated.status>=100&&generated.status<=599?{httpStatus:generated.status}:{})}};
}

type ValidationDiagnostic={code:string;field:string;factIndex?:number;lineStart?:number;lineEnd?:number};
export function parsePreparedResearch(input:unknown,sources:Evidence[],brandId:string):{brief:Row|null;diagnostic:ValidationDiagnostic|null} {
  const reject=(code:string,field:string,extra:Omit<ValidationDiagnostic,'code'|'field'>={})=>({brief:null,diagnostic:{code,field,...extra}});
  if(!input||typeof input!=='object'||Array.isArray(input))return reject('invalid-object','body');
  if(!uuid(brandId))return reject('invalid-brand','brandId');
  const value=input as Row,fields:Row={};
  for(const [key,max,required] of [['title',180,true],['change',1000,true],['whyBrand',1000,true],['interpretation',3000,true],['conditions',2000,true],['counterevidence',3000,true],['unknown',3000,true],['draft',12000,true]] as const){const clean=text(value[key],max,required);if(clean===null)return reject('invalid-field',key);fields[key]=clean;}
  if(!Array.isArray(value.facts)||value.facts.length<1||value.facts.length>8)return reject('invalid-facts','facts');
  const factEvidence:Array<{text:string;sourceId:string;quote:string;locator:string}>=[];
  for(const [factIndex,fact] of value.facts.entries()){
    if(!fact||typeof fact!=='object')return reject('invalid-fact','facts',{factIndex});
    const claim=text(fact.text,1000,true),quote=text(fact.quote,800,true),locator=text(fact.locator,40,true),source=sources.find(source=>source.id===fact.sourceId);
    if(!claim)return reject('invalid-field','facts.text',{factIndex});
    if(!quote)return reject('invalid-field','facts.quote',{factIndex});
    if(!source)return reject('invalid-source-id','facts.sourceId',{factIndex});
    const range=locator?.match(/^L(\d{1,5})(?:-L?(\d{1,5}))?$/);
    if(!locator||!range)return reject('invalid-locator','facts.locator',{factIndex});
    const start=Number(range[1]),end=Number(range[2]||range[1]),location={factIndex,lineStart:start,lineEnd:end};
    if(start<1||end<start||end-start>5)return reject('invalid-line-range','facts.locator',location);
    const lines=source.text.split('\n').filter(line=>{const number=Number(line.match(/^L(\d+):/)?.[1]);return number>=start&&number<=end;});
    if(lines.length!==end-start+1)return reject('missing-source-line','facts.locator',location);
    if(!space(lines.map(line=>line.replace(/^L\d+:\s*/, '')).join(' ')).includes(space(quote)))return reject('quote-not-in-cited-lines','facts.quote',location);
    factEvidence.push({text:claim,sourceId:source.id,quote,locator});
  }
  const cited=sources.filter(source=>factEvidence.some(fact=>fact.sourceId===source.id));
  return {brief:{...fields,brandId,facts:factEvidence.map(fact=>fact.text),factEvidence,sources:cited.map(source=>({url:source.url,title:source.title,accessLevel:'full-text',locator:factEvidence.filter(fact=>fact.sourceId===source.id).map(fact=>fact.locator).join(', '),documentHash:source.documentHash})),origin:'research-ai',verificationLevel:'unreviewed'},diagnostic:null};
}
export function validatePreparedResearch(input:unknown,sources:Evidence[],brandId:string):Row|null {
  return parsePreparedResearch(input,sources,brandId).brief;
}

export const RESEARCH_RESPONSE_SCHEMA={type:'object',properties:{title:{type:'string'},change:{type:'string'},whyBrand:{type:'string'},facts:{type:'array',minItems:1,maxItems:3,items:{type:'object',properties:{text:{type:'string'},sourceId:{type:'string'},quote:{type:'string'},locator:{type:'string'}},required:['text','sourceId','quote','locator']}},interpretation:{type:'string'},conditions:{type:'string'},counterevidence:{type:'string'},unknown:{type:'string'},draft:{type:'string'}},required:['title','change','whyBrand','facts','interpretation','conditions','counterevidence','unknown','draft']};

export function researchResponseSchemaForSource(source:Evidence) {
  const facts=RESEARCH_RESPONSE_SCHEMA.properties.facts;
  return {...RESEARCH_RESPONSE_SCHEMA,properties:{...RESEARCH_RESPONSE_SCHEMA.properties,facts:{...facts,minItems:1,maxItems:3,items:{...facts.items,properties:{...facts.items.properties,
    sourceId:{...facts.items.properties.sourceId,enum:[source.id]},
    quote:{...facts.items.properties.quote,description:'One short verbatim continuous substring within the single cited original source line; never join separate sentences or lines.'},
    locator:{type:'string',enum:researchCitationLines(source)},
  }}}}};
}

export function buildResearchPrompt(brand:Row,source:Evidence) {
  return buildResearchWriterPrompt(brand,source);
}

export async function executeResearchPrepare(input:unknown,config:{workspaceId?:string},{rpc=invokeSupabaseRpc,generate=(request:Parameters<typeof generateGeminiText>[0])=>generateGeminiText({...request,usageSurface:'research-prepare'})}={}) {
  const request=input as Row;
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(key=>!['workspaceId','preparationId'].includes(key))||!uuid(request.preparationId)||!uuid(request.workspaceId)||request.workspaceId!==config.workspaceId)return {status:'invalid-input',reason:'invalid-preparation'};
  const params={p_workspace_id:request.workspaceId,p_preparation_id:request.preparationId};
  const claim=await rpc('research_model_claim_v1',params,{timeoutMs:10000});
  if(!claim.ok||!claim.data)return {status:'unknown',reason:'model-claim-unconfirmed'};
  const data=claim.data as Row;if(data.status!=='claimed')return data;
  const source=data.source as Evidence,brand=data.brand as Row;
  if(!source?.text||source.text.length>18000||!uuid(brand?.id))return {status:'error',reason:'invalid-claimed-evidence'};
  const stages:ResearchGenerationStage[]=[];
  const runStage=async(stage:'writer'|'review',prompt:string)=>{
    let generated:Row;
    try{generated=await generate({...contentQualityGeneration(),prompt,systemInstruction:buildResearchSystemInstruction(stage),responseMimeType:'application/json',responseJsonSchema:researchResponseSchemaForSource(source),temperature:stage==='review'?0.1:0.2});}
    catch{generated={ok:false,reason:'model-outcome-unknown'};}
    stages.push({stage,generated});return generated;
  };
  let generated=await runStage('writer',buildResearchPrompt(brand,source));
  let candidate:unknown,brief:Row|null=null,validationDiagnostic:ValidationDiagnostic|null=null;
  if(generated.ok){
    try{candidate=JSON.parse(generated.text);}catch{validationDiagnostic={code:'invalid-json',field:'body'};}
    if(candidate!==undefined){
      generated=await runStage('review',buildResearchReviewPrompt(brand,source,candidate));
      if(generated.ok)try{
        const reviewed=JSON.parse(generated.text),validated=parsePreparedResearch(reviewed,[source],brand.id);
        // Invalid evidence never enters schedule narrowing. Revalidate the
        // projected fields and unchanged citation before saving the final brief.
        const narrowed=validated.brief?groundResearchScheduleNote(brand,source,reviewed):reviewed;
        const parsed=narrowed===reviewed?validated:parsePreparedResearch(narrowed,[source],brand.id);brief=parsed.brief;validationDiagnostic=parsed.diagnostic;
        // Keep legacy stored-brief parsing compatible, but enforce the tighter
        // negotiated contract on every new generation even if a provider ignores
        // its JSON schema. A reviewed draft must not cite an excluded AI summary.
        if(brief){
          const allowed=new Set(researchCitationLines(source)),facts=brief.factEvidence as Row[];
          const invalidIndex=facts.findIndex(fact=>!allowed.has(fact.locator));
          if(facts.length>3){brief=null;validationDiagnostic={code:'invalid-facts',field:'facts'};}
          else if(invalidIndex>=0){brief=null;validationDiagnostic={code:'invalid-locator',field:'facts.locator',factIndex:invalidIndex};}
        }
      }catch{validationDiagnostic={code:'invalid-json',field:'body'};}
    }
  }
  const failure=generated.ok?null:providerFailure(generated),totals=aggregateResearchUsage(stages);
  const result:Row={status:brief?'saved':'error',reason:brief?'ok':generated.ok?'invalid-model-evidence':failure?.reason,...totals,estimatedCostUsd:null,...(brief?{brief}:validationDiagnostic?{validationDiagnostic}:{}),...(failure?{providerDiagnostic:failure.providerDiagnostic}:{})};
  const finish=await rpc('research_source_complete_v1',{...params,p_result:result},{timeoutMs:15000});
  if(!finish.ok||!finish.data)return {status:'unknown',reason:'preparation-save-unconfirmed',model:result.model,usage:result.usage};
  return finish.data as Row;
}
