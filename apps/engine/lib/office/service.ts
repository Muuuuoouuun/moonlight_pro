import { OFFICE_VERSION, parseOfficeAnswer, type OfficeRequest, type OfficeContext } from '@com-moon/agent-contracts/office';
import { generateGeminiText } from '../gemini.ts';
import { buildOfficePrompt } from './prompt.ts';
export async function generateOfficeResponse(request:OfficeRequest,context:OfficeContext,generate=generateGeminiText) {
 const meta={ownerId:request.ownerId,mode:request.mode,scope:request.scope,participants:request.participants,lens:null,simulation:request.mode==='council',version:OFFICE_VERSION,context};
 try {
  const result=await generate({...buildOfficePrompt(request,context),maxOutputTokens:8192});
  if(!result.ok) return {...meta,status:result.reason==='missing-api-key'?'preview':'error',error:result.reason==='missing-api-key'?'AI 연결이 필요합니다. 입력은 보존됩니다.':'AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.'};
  // Accept one optional JSON fence, never free text or executable model instructions.
  const raw=result.text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/,'$1');
  const answer=parseOfficeAnswer(JSON.parse(raw),request.mode);
  return {...meta,status:'generated',...answer,model:result.model};
 } catch { return {...meta,status:'error',error:'응답 형식을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.'}; }
}
