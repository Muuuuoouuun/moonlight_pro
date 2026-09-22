import { parseOfficeRequest, parseOfficeContext, OfficeInputError } from '@com-moon/agent-contracts/office';
import { generateOfficeResponse } from './service.ts';
export function createOfficeEngineHandler(auth:(request:Request)=>{ok:boolean},generate=generateOfficeResponse) {
 return async (req:Request) => {
  if(!auth(req).ok) return Response.json({status:'error',error:'Office 인증에 실패했습니다.'},{status:401});
  let input;
  try {
   const body=await req.text();
   if(Buffer.byteLength(body)>100000) return Response.json({status:'error',error:'요청이 너무 큽니다.'},{status:413});
   input=JSON.parse(body);
   if(!input || Object.keys(input).some(k=>!['request','context'].includes(k))) throw new OfficeInputError('요청 봉투가 올바르지 않습니다.');
   const request=parseOfficeRequest(input.request);
   const context=parseOfficeContext(input.context,request.scope);
   const result=await generate(request,context);
   return Response.json(result,{status:result.status==='error'?502:result.status==='preview'?202:200});
  } catch(error) {
   return Response.json({status:'error',error:error instanceof OfficeInputError?error.message:'요청을 처리하지 못했습니다.'},{status:error instanceof OfficeInputError||error instanceof SyntaxError?400:502});
  }
 };
}
