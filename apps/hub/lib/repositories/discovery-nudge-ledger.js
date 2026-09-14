import { invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '../server-write.js';
import { isCanonicalUuid } from '../uuid.js';
import { validNudgeContext, validateNudgeCommand } from '../discovery-nudge.js';
const configured=()=>Boolean(resolveSupabaseConfig() && isCanonicalUuid(resolveDefaultWorkspaceId()));
const readError=()=>({status:'error',context:null,message:'다음 행동의 표시 설정을 확인하지 못했어요. 다시 시도해 주세요.'});
export async function getDiscoveryNudge(recordId) {
  if(!isCanonicalUuid(recordId))return {...readError(),message:'기회 기록을 확인해 주세요.'};
  if(!configured())return {status:'preview',context:null};
  try {
    const r=await invokeSupabaseRpc('read_discovery_nudge_v1',{p_workspace_id:resolveDefaultWorkspaceId(),p_record_id:recordId});
    if(r.ok && r.data?.status==='live' && validNudgeContext(r.data.context,recordId))return r.data;
  }catch{}
  return {...readError(),message:'다음 행동의 표시 설정을 확인하지 못했어요. 다시 시도해 주세요.'};
}
export async function saveDiscoveryNudge(payload) {
  if(!validateNudgeCommand(payload))return {status:'invalid-input',context:null,httpStatus:400,message:'제안과 미룰 날짜를 확인해 주세요.'};
  if(!configured())return {status:'error',context:null,httpStatus:503,message:'표시 설정 저장 연결이 준비되지 않았어요.'};
  try {
    const r=await invokeSupabaseRpc('save_discovery_nudge_v1',{p_workspace_id:resolveDefaultWorkspaceId(),p_payload:payload});
    if(r.ok && ['saved','duplicate','conflict','invalid-input'].includes(r.data?.status)) {
      const {status,context}=r.data;
      if(status==='invalid-input')return {status,context:null,httpStatus:400,message:'제안이 바뀌었거나 날짜가 유효하지 않아요. 다시 확인해 주세요.'};
      if(validNudgeContext(context,payload.recordId))return {status,context,httpStatus:status==='conflict'?409:200,message:status==='conflict'?'다른 창에서 표시 설정이 바뀌었어요. 최신 내용을 확인해 주세요.':undefined};
    }
  }catch{}
  return {status:'error',context:null,httpStatus:502,message:'설정을 저장하지 못했어요. 같은 선택으로 다시 시도할 수 있어요.'};
}
