import { parseOfficeAnswer,parseOfficeContext,OFFICE_VERSION } from '@com-moon/agent-contracts/office';
export async function callOfficeEngine(request,context,{fetcher=fetch,engineUrl=process.env.COM_MOON_ENGINE_URL,secret=process.env.COM_MOON_SHARED_WEBHOOK_SECRET}={}) {
 if(!engineUrl?.trim()||!secret?.trim()) return {status:'preview',error:'Office Engine 연결이 필요합니다. 입력은 보존됩니다.'};
 try {
  const response=await fetcher(`${engineUrl.trim().replace(/\/$/,'')}/api/ai/office-chat`,{method:'POST',headers:{'content-type':'application/json','x-com-moon-shared-secret':secret.trim()},body:JSON.stringify({request,context}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(55000)});
  const data=await response.json();
  if(data?.status==='preview' && response.status===202) return {status:'preview',error:'AI 연결이 필요합니다. 입력은 보존됩니다.'};
  if(!response.ok || data?.status!=='generated') throw new Error('engine-failed');
  // Never label an older Engine's advice with this Hub's newer policy version.
  if(data.version!==OFFICE_VERSION) throw new Error('policy-version-mismatch');
  if(data.ownerId!==request.ownerId || data.mode!==request.mode || data.scope!==request.scope || data.lens!==null || data.simulation!==(request.mode==='council') || JSON.stringify(data.participants)!==JSON.stringify(request.participants)) throw new Error('route-mismatch');
  const answer=parseOfficeAnswer({answer:data.answer,nextAction:data.nextAction,...(request.mode==='council'?{recommendation:data.recommendation,evidence:data.evidence,dissent:data.dissent}:{})},request.mode);
  parseOfficeContext(data.context,request.scope);
  if(JSON.stringify(data.context)!==JSON.stringify(context)) throw new Error('context-mismatch');
  return {status:'generated',...answer,ownerId:request.ownerId,mode:request.mode,scope:request.scope,participants:request.participants,lens:null,simulation:data.simulation,version:data.version,model:typeof data.model==='string'?data.model:null,context};
 }catch{return {status:'error',error:'Office 응답을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.'};}
}
