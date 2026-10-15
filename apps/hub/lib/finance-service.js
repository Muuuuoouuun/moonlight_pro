import { invokeSupabaseRpc, resolveDefaultWorkspaceId } from './server-write.js';
import { validateFinanceChanges, validateFinanceImport } from './finance-ledger.js';
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function runFinanceCommand(input, { workspaceId = resolveDefaultWorkspaceId(), invoke = invokeSupabaseRpc } = {}) {
 const invalid = () => ({status:'error',httpStatus:400,error:'입력 또는 기록 버전을 확인하세요.'});
 let name,params;
 if(input?.action==='import') {
  if(!validateFinanceImport(input.payload).ok)return invalid();
  name='finance_import_v1';params={p_workspace_id:workspaceId,p_payload:input.payload};
 } else if(input?.action==='review') {
  if(!uuid(input.id)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||!validateFinanceChanges(input.entity,input.changes).ok)return invalid();
  name='finance_review_v1';params={p_workspace_id:workspaceId,p_entity:input.entity,p_id:input.id,p_expected_revision:input.expectedRevision,p_changes:input.changes};
 } else return invalid();
 if(!workspaceId)return {status:'preview',httpStatus:503,error:'저장소 연결이 필요합니다.'};
 try {
  const r=await invoke(name,params);
  if(!r?.ok)return {status:'failed',httpStatus:502,error:'저장에 실패했습니다. 입력을 유지하고 다시 시도하세요.'};
  const data=r.data;
  const status=data?.status;
  const code={saved:200,imported:200,duplicate:200,conflict:409,'not-found':404,error:400}[status];
  if(!code)return {status:'failed',httpStatus:502,error:'저장 결과를 확인할 수 없습니다.'};
  return {...data,httpStatus:code};
 } catch {return {status:'failed',httpStatus:502,error:'저장 결과를 확인할 수 없습니다. 다시 조회하세요.'};}
}
