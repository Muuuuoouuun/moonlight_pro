import {parseOfficeRequest,parseOfficeAnswer,parseOfficeContext,parseOfficeDiscussion,OFFICE_VERSION} from '@com-moon/agent-contracts/office';
export async function requestOffice(input,{fetcher=fetch,signal}={}) {
 try {
  const request=parseOfficeRequest(input);
  const response=await fetcher('/api/hub/office/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
  const data=await response.json();
  if(response.ok && data?.status==='generated') {
   if(data.version!==OFFICE_VERSION||data.ownerId!==request.ownerId||data.scope!==request.scope||data.mode!==request.mode||data.lens!==null||data.simulation!==(request.mode==='council')||JSON.stringify(data.participants)!==JSON.stringify(request.participants))throw new Error('담당 응답이 일치하지 않습니다.');
   parseOfficeAnswer({answer:data.answer,nextAction:data.nextAction,...(request.mode==='council'?{recommendation:data.recommendation,evidence:data.evidence,dissent:data.dissent}:{})},request.mode);
   parseOfficeContext(data.context,request.scope);
   if(data.discussion!==undefined || request.deliberation!==undefined) data.discussion=parseOfficeDiscussion(data.discussion,request);
   return data;
  }
  return {status:data?.status==='preview'?'preview':'error',error:data?.error||'응답을 받지 못했습니다. 입력은 보존됩니다.'};
 }catch(error){return {status:'error',error:error?.name==='AbortError'?'요청을 중단했습니다. 입력은 보존됩니다.':'Office 응답을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.'};}
}
export function officeHistory(turns) {
 return turns.slice(-4).flatMap(turn=>[{role:'user',text:turn.message.slice(0,2000)},{role:'assistant',text:turn.result.answer.slice(0,2000)}]);
}
