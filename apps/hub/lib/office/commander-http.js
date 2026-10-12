import {OfficeInputError} from '@com-moon/agent-contracts/office';
import {assertHubWriteAllowed,readHubWriteJson} from '../hub-write-guard.js';
import {officeOperatorIdentity} from './workflow-runtime.js';
import {processOfficeCommanderShadow} from './commander-service.js';
// Includes worst-case JSON escaping of bounded packets, bindings and report.
export const OFFICE_COMMANDER_MAX_BODY_BYTES=1500000;
export function createOfficeCommanderHubHandler({guard=assertHubWriteAllowed,identity=officeOperatorIdentity,process=processOfficeCommanderShadow}={}){return async request=>{const denied=guard(request);if(denied)return denied;const body=await readHubWriteJson(request,{maxBytes:OFFICE_COMMANDER_MAX_BODY_BYTES});if(body.error)return body.error;try{return Response.json(process(body.data,identity(request)),{headers:{'cache-control':'no-store'}});}catch(error){return Response.json({status:'error',error:error instanceof OfficeInputError?error.message:'shadow 상태를 확인하지 못했습니다. 입력을 보존했습니다.',persistence:{persisted:false},providerCalls:0,businessWrites:false},{status:error instanceof OfficeInputError?400:500,headers:{'cache-control':'no-store'}});}};}
