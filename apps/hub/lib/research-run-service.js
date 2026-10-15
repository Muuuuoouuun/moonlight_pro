import { createHash } from 'node:crypto';
import { invokeSupabaseRpc, resolveDefaultWorkspaceId } from './server-write.js';
import { fetchSupabaseRowsDetailed } from './server-read.js';
import { recordAutomationRun } from './automation-runs.js';
import { isCanonicalUuid } from './uuid.js';
import { normalizeResearchRun, projectResearchRun, scheduledResearchRequests } from './research-run-contract.js';
import { searchBraveNews } from './research-news.js';
import { discoverOfficialSources, createResearchSourceReader, extractSourceDocument, boundedSourceError, canonicalResearchUrl } from './research-source.js';

export async function callResearchEngine(input,{env=process.env,fetchImpl=fetch}={}) {
  const url=env.COM_MOON_ENGINE_URL?.trim().replace(/\/$/,''),secret=env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim();
  if(!url||!secret)return {status:'preview',reason:'research-engine-not-configured'};
  try {
    const response=await fetchImpl(`${url}/api/research/prepare`,{method:'POST',headers:{'content-type':'application/json','x-com-moon-shared-secret':secret},body:JSON.stringify(input),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(115000)});
    const data=await response.json();
    if(!data||typeof data!=='object'||!['saved','duplicate','running','unknown','error','invalid-input','conflict'].includes(data.status)||(data.status==='saved'&&(!response.ok||!isCanonicalUuid(data.briefId))))throw Error('invalid-engine-response');
    return data;
  }catch{return {status:'unknown',reason:'preparation-outcome-unknown'};}
}
export async function runResearchPreparation(input,{workspaceId=resolveDefaultWorkspaceId(),env=process.env,read=fetchSupabaseRowsDetailed,rpc=invokeSupabaseRpc,discover=discoverOfficialSources,sourceRead=createResearchSourceReader(),prepare=body=>callResearchEngine(body,{env}),search=searchBraveNews,now=Date.now}={}) {
  const command=normalizeResearchRun(input);
  if(!command)return {status:'invalid-input',reason:'invalid-research-request',httpStatus:400};
  if(!isCanonicalUuid(workspaceId))return {status:'preview',reason:'missing-workspace',httpStatus:503};
  if(!env.COM_MOON_ENGINE_URL?.trim()||!env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim())return {status:'preview',reason:'research-engine-not-configured',httpStatus:503};
  const {requestId,...payload}=command;
  const brandRead=await read('brands',{select:'id,workspace_id,slug,status',filters:[['workspace_id',`eq.${workspaceId}`],['slug',`eq.${command.dbSlug}`],['status','eq.active']],limit:2});
  const brand=brandRead.rows?.[0];
  if(!brandRead.configured)return {status:'preview',reason:'database-not-configured',httpStatus:503};
  if(brandRead.error||brandRead.rows?.length!==1||!isCanonicalUuid(brand?.id)||brand.workspace_id!==workspaceId||brand.slug!==command.dbSlug||brand.status!=='active')return {status:'error',reason:'brand-identity-unconfirmed',httpStatus:409};
  const claim=await rpc('research_run_claim_v1',{p_workspace_id:workspaceId,p_request_id:requestId,p_request_hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),p_command:{...payload,brandId:brand.id}},{timeoutMs:10000});
  if(!claim.ok||!claim.data)return {status:'error',reason:'run-claim-unconfirmed',httpStatus:502};
  const receipt=claim.data;
  if(['invalid-input','conflict','error'].includes(receipt.status))return {status:receipt.status,reason:receipt.reason||'run-not-claimed',httpStatus:receipt.status==='conflict'?409:receipt.status==='invalid-input'?400:502};
  if(receipt.status!=='claimed')return {status:receipt.run?.status==='running'?'running':['failed','unknown'].includes(receipt.run?.status)?'error':receipt.run?.status==='partial'?'partial':'ok',reason:receipt.reason||receipt.run?.reason||null,run:receipt.run?projectResearchRun(receipt.run):null,replayed:true,httpStatus:200};
  const runId=receipt.run?.id;if(!isCanonicalUuid(runId))return {status:'error',reason:'invalid-run-claim',httpStatus:502};
  const counts={preparedCount:0,sourceCount:0,duplicateCount:0,failedCount:0,searchCalls:0};
  const failures=[],deadline=now()+250000;let candidates=[];
  try {
    const official=await discover(command.brand,{read:sourceRead,maxCandidates:6});
    candidates=official.candidates||[];failures.push(...(official.failures||[]));counts.failedCount+=(official.failures||[]).length;
    // Search descriptions remain transient in the discovery adapter. Only URLs
    // and titles survive into candidate processing; evidence always fetches origin.
    const found=receipt.resumed?{status:'preview',calls:0}:await search({brand:command.dbSlug,topic:command.topic,apiKey:env.BRAVE_SEARCH_API_KEY});
    counts.searchCalls=found.calls||0;
    if(found.status==='ok')candidates.push(...found.results.slice(0,5).map(result=>({url:result.url,title:result.title,official:false,adapterUrl:'brave-news'})));
    else if(found.status==='error'){counts.failedCount++;failures.push({source:'brave-news',reason:found.reason});}
    const urls=new Set();candidates=candidates.filter(candidate=>{const url=canonicalResearchUrl(candidate.url);if(!url||urls.has(url))return false;candidate.url=url;urls.add(url);return true;}).slice(0,8);
    for(const candidate of candidates) {
      if(counts.preparedCount>=command.limit)break;
      if(now()>deadline-150000){counts.failedCount++;failures.push({source:'pipeline',reason:'research-time-budget-exhausted'});break;}
      let source;
      try{const result=await sourceRead(candidate.url);source={...extractSourceDocument({...result,title:candidate.title}),entryUrl:candidate.url};if(source.text.length<100)throw Error('insufficient-original-text');}
      catch(error){counts.failedCount++;failures.push({source:new URL(candidate.url).hostname,reason:boundedSourceError(error)});continue;}
      counts.sourceCount++;
      // Leave the source-claim RPC, both model stages and run completion time
      // after collection; avoid reserving a source whose model cannot finish.
      if(now()>deadline-140000){counts.failedCount++;failures.push({source:'pipeline',reason:'research-time-budget-exhausted'});break;}
      const sourceClaim=await rpc('research_source_claim_v1',{p_workspace_id:workspaceId,p_run_id:runId,p_source:{...source,adapterUrl:candidate.adapterUrl||new URL(candidate.url).origin,official:candidate.official===true}},{timeoutMs:10000});
      if(!sourceClaim.ok||!sourceClaim.data){counts.failedCount++;failures.push({source:'ledger',reason:'source-claim-unconfirmed'});continue;}
      if(sourceClaim.data.status==='duplicate'){counts.duplicateCount++;continue;}
      if(sourceClaim.data.status!=='claimed'){counts.failedCount++;failures.push({source:'ledger',reason:sourceClaim.data.reason||'source-not-claimed'});if(sourceClaim.data.reason==='daily-quantity-reached')break;continue;}
      // Engine fetches the claimed evidence from the DB; callers cannot replace
      // the source or brand identity in this server-to-server request.
      const result=await prepare({workspaceId,preparationId:sourceClaim.data.preparationId});
      if(result.status==='saved')counts.preparedCount++;
      else if(result.status==='duplicate')counts.duplicateCount++;
      else{counts.failedCount++;failures.push({source:'engine',reason:result.reason||'preparation-outcome-unknown'});}
    }
  }catch{counts.failedCount++;failures.push({source:'pipeline',reason:'research-run-interrupted'});}
  const reason=failures[0]?.reason||(counts.preparedCount?'ok':counts.duplicateCount?'no-new-source':'no-readable-source');
  const finished=await rpc('research_run_finish_v1',{p_workspace_id:workspaceId,p_run_id:runId,p_result:{counts,reason,failures:failures.slice(0,12)}},{timeoutMs:15000});
  if(!finished.ok||!finished.data?.run)return {status:'unknown',reason:'run-save-unconfirmed',run:projectResearchRun({...receipt.run,reason:'run-save-unconfirmed'}),httpStatus:202};
  const run=projectResearchRun(finished.data.run);
  return {status:run.status==='failed'||run.status==='unknown'?'error':run.status==='partial'?'partial':'ok',run,reason:run.reason,httpStatus:200};
}

export async function runResearchSweep({now=new Date(),env=process.env,workspaceId=resolveDefaultWorkspaceId(),run=input=>runResearchPreparation(input,{env,workspaceId}),record=recordAutomationRun}={}) {
  if(env.COM_MOON_RESEARCH_ENABLED!=='true')return {status:'disabled',reason:'research-not-enabled',runs:[],automationRecorded:false,automationLog:'not-needed'};
  const requests=scheduledResearchRequests(now),runs=[];
  if(!requests.length)return {status:'idle',reason:'outside-research-window',runs,automationRecorded:false,automationLog:'not-needed'};
  const settled=await Promise.allSettled(requests.map(request=>run(request)));
  settled.forEach((entry,index)=>{if(entry.status==='fulfilled'){const {httpStatus,...result}=entry.value;runs.push(result);}else runs.push({status:'error',reason:'research-run-interrupted',brand:requests[index].brand});});
  const status=runs.some(result=>['error','unknown','partial'].includes(result.status))?'partial':'ok';
  // Re-reading a durable receipt is not another automation execution.
  if(runs.every(result=>result.replayed===true&&result.attempted!==true&&result.reason!=='research-run-interrupted'))return {status,runs,automationRecorded:false,automationLog:'not-needed'};
  let recorded;
  try{recorded=await record({workspaceId,key:'research-sweep',name:'브랜드 리서치 준비',status:status==='ok'?'success':'failure',correlationId:`research-sweep:${requests.map(request=>request.requestId).join(':')}`,input:{brands:requests.map(request=>request.brand),scheduledAt:now.toISOString()},output:{runs,summary:`리서치 ${runs.reduce((sum,item)=>sum+(item.run?.preparedCount||0),0)}개 준비`},errorMessage:status==='partial'?'research-partial':null,startedAt:now.toISOString()});}
  catch{/* Log availability never discards results or retries paid preparation. */}
  const automationRecorded=recorded?.persisted===true;
  return {status,runs,automationRecorded,automationLog:automationRecorded?'saved':'error'};
}
