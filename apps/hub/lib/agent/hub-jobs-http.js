import {assertHubWriteAllowed} from '../hub-write-guard.js';
import {authorizeAgentRequest} from './auth.js';
import {agentJson,readAgentJson,jobEventStream} from './http.js';
export function createHubJobHandler(deps={}){
 return async(request)=>{
  try{
   const guard=(deps.guard||assertHubWriteAllowed)(request);if(guard)return guard;
   const write=request.method==='POST';
   const env=deps.env||process.env;
   const auth=(deps.authorize||authorizeAgentRequest)(new Request(request.url,{headers:{authorization:`Bearer ${env.COM_MOON_AGENT_API_TOKEN||''}`}}),{scope:write?'jobs:write':'jobs:read',env});
   if(!auth.ok)return agentJson(auth);
   const body=write?await readAgentJson(request):Object.fromEntries(new URL(request.url).searchParams);
   const action=body.action||(write?'submit':'list');
   if(!(write?['submit','cancel','resume']:['list','get','projects','events']).includes(action))return agentJson({httpStatus:400,data:{status:'error',error:'Invalid job action.'}});
   const {action:ignored,...input}=body;
   if(action==='events'){
    const after=Number(input.after??request.headers.get('last-event-id')??0);
    if(!Number.isSafeInteger(after)||after<0)return agentJson({httpStatus:400,data:{status:'error',error:'Invalid event cursor.'}});
    input.after=after;
   }
   const job=deps.job||(await import('./jobs.js')).handleAgentJob;
   const result=await job(action,input,auth.context);
   if(action==='events'&&request.headers.get('accept')?.includes('text/event-stream')&&result.httpStatus<400&&result.data?.status!=='error')return jobEventStream(request,job,input.id,auth.context,result,input.after);
   return agentJson(result);
  }catch(error){return agentJson({httpStatus:error.status||502,data:{status:'error',error:error.status?error.message:'작업 상태를 확인하지 못했습니다. 새 요청을 만들기 전에 목록을 새로고침해 주세요.',retryable:false}});}
 };
}
