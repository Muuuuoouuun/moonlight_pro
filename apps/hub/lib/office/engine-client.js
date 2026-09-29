import { parseOfficeAnswer,parseOfficeContext,parseOfficeDiscussion,parseOfficeFailure,officeFailureMessage,OFFICE_VERSION } from '@com-moon/agent-contracts/office';
const count=value=>Number.isSafeInteger(value)&&value>=0;
// Only a well-formed record crosses into the run log; a malformed one is dropped, the answer is kept.
function generationRecord(value) {
 if(!value||typeof value!=='object'||!count(value.elapsedMs)||!count(value.modelCalls))return null;
 const usage=value.usage;
 if(usage!==null&&!(usage&&['promptTokens','outputTokens','totalTokens'].every(key=>count(usage[key]))))return null;
 return {elapsedMs:value.elapsedMs,modelCalls:value.modelCalls,usage:usage===null?null:{promptTokens:usage.promptTokens,outputTokens:usage.outputTokens,totalTokens:usage.totalTokens}};
}
export async function callOfficeEngine(request,context,{fetcher=fetch,engineUrl=process.env.COM_MOON_ENGINE_URL,secret=process.env.COM_MOON_SHARED_WEBHOOK_SECRET,retries=0}={}) {
 if(!engineUrl?.trim()||!secret?.trim()) return {status:'preview',error:'Office Engine 연결이 필요합니다. 입력은 보존됩니다.'};
 const attempts=Math.max(0,Math.min(retries,2));
 for(let attempt=0;attempt<=attempts;attempt++) {
  try {
   const response=await fetcher(`${engineUrl.trim().replace(/\/$/,'')}/api/ai/office-chat`,{method:'POST',headers:{'content-type':'application/json','x-com-moon-shared-secret':secret.trim()},body:JSON.stringify({request,context}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(55000)});
   const data=await response.json().catch(()=>null);
   if(data?.status==='preview' && response.status===202) return {status:'preview',error:'AI 연결이 필요합니다. 입력은 보존됩니다.'};
   // 2026-09-23 운영자 확정: 분류된 실패는 원인별 문구로 돌려준다. 그 밖의 실패는 기존 일반 오류다.
   const failure=data?.status==='error'?parseOfficeFailure(data.failure):null;
   if(failure) return {status:'error',error:officeFailureMessage(failure),failure};
   if(!response.ok || data?.status!=='generated') {
    if(attempt<attempts && (response.status===502 || response.status===503)) {
     await new Promise(r=>setTimeout(r,600));
     continue;
    }
    throw new Error('engine-failed');
   }
   // Never label an older Engine's advice with this Hub's newer policy version.
   if(data.version!==OFFICE_VERSION) throw new Error('policy-version-mismatch');
   if(data.ownerId!==request.ownerId || data.mode!==request.mode || data.scope!==request.scope || data.lens!==null || data.simulation!==(request.mode==='council') || JSON.stringify(data.participants)!==JSON.stringify(request.participants)) throw new Error('route-mismatch');
   const answer=parseOfficeAnswer({answer:data.answer,nextAction:data.nextAction,...(request.mode==='council'?{recommendation:data.recommendation,evidence:data.evidence,dissent:data.dissent}:{})},request.mode);
   parseOfficeContext(data.context,request.scope);
   if(JSON.stringify(data.context)!==JSON.stringify(context)) throw new Error('context-mismatch');
   const discussion=request.mode==='council'?{discussion:parseOfficeDiscussion(data.discussion,request)}:{};
   if(request.mode!=='council'&&data.discussion!==undefined)throw new Error('unexpected-discussion');
   return {status:'generated',...answer,...discussion,ownerId:request.ownerId,mode:request.mode,scope:request.scope,participants:request.participants,lens:null,simulation:data.simulation,version:data.version,model:typeof data.model==='string'?data.model:null,context,...(['traced','none','untraced'].includes(data.sourceCheck)?{sourceCheck:data.sourceCheck}:{}),...(generationRecord(data.generation)?{generation:generationRecord(data.generation)}:{})};
  }catch(err){
   if(attempt<attempts) {
    await new Promise(r=>setTimeout(r,600));
    continue;
   }
   return {status:'error',error:'Office 응답을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.'};
  }
 }
 return {status:'error',error:'Office 응답을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.'};
}
