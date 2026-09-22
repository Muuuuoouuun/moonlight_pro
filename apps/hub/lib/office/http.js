import { parseOfficeRequest,OfficeInputError,OFFICE_VERSION } from '@com-moon/agent-contracts/office';
import { assertHubWriteAllowed,readHubWriteJson } from '../hub-write-guard.js';
import { readOfficeContext } from '../repositories/office-context.js';
import { recordAgentRun } from '../sales-os/agent-runs.js';
import { callOfficeEngine } from './engine-client.js';
export function createOfficeHubHandler({guard=assertHubWriteAllowed,readContext=readOfficeContext,callEngine=callOfficeEngine,recordRun=recordAgentRun}={}) {
 return async req=>{
  const denied=guard(req);if(denied)return denied;
  const body=await readHubWriteJson(req,{maxBytes:90000});if(body.error)return body.error;
  let request;
  try{request=parseOfficeRequest(body.data);}catch(error){return Response.json({status:'error',error:error instanceof OfficeInputError?error.message:'요청을 확인해 주세요.'},{status:400});}
  try{
   const context=await readContext(request);
   const result=await callEngine(request,context);
   if(result.status!=='generated')return Response.json(result,{status:result.status==='preview'?202:502});
   let log={persisted:false,id:null};
   try{
    log=await recordRun({agent:request.mode==='council'?'office.council':`office.${request.ownerId}`,mode:request.mode,ref:`office:${request.scope}`,inputSummary:`${OFFICE_VERSION} owner=${request.ownerId} scope=${request.scope} views=${request.participants.join(',')}`,recommendation:{answer:result.answer,nextAction:result.nextAction,...(request.mode==='council'?{recommendation:result.recommendation,evidence:result.evidence,dissent:result.dissent,discussion:result.discussion}:{})},result:'ok'});
   }catch{ /* A generated answer is still useful when only its run log fails. */ }
   return Response.json({...result,version:OFFICE_VERSION,log:{persisted:log?.persisted===true,runId:log?.persisted===true?log.id:null},businessWrites:false});
  }catch{return Response.json({status:'error',error:'Office 요청을 처리하지 못했습니다. 입력은 보존됩니다.'},{status:502});}
 };
}
