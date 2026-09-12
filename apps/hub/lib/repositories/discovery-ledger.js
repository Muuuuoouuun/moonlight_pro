import { eqFilter, fetchSupabaseRows } from '../server-read.js';
import { invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '../server-write.js';
import { validateDiscoveryInput } from '../discovery.js';
import { isCanonicalUuid } from '../uuid.js';

const TARGETS = {
  task: { table:'tasks', field:'title', href:'/dashboard/work/my?task=' },
  project: { table:'projects', field:'name', href:'/dashboard/work/projects?project=' },
  lead: { table:'leads', field:'name', href:'/dashboard/revenue/leads?lead=' },
  deal: { table:'deals', field:'title', href:'/dashboard/revenue/deals?deal=' },
};
const configured = () => Boolean(resolveSupabaseConfig() && resolveDefaultWorkspaceId());
const envelope = (key, status, message) => ({status,configured:configured(),[key]:[],...(message?{message}:{})});
const readError = (key) => envelope(key,'error','기회 탐색 기록을 불러오지 못했어요. 다시 시도해 주세요.');

async function context() {
  if (!configured()) return {status:'preview'};
  const workspaceId=resolveDefaultWorkspaceId();
  if (!isCanonicalUuid(workspaceId)) throw new Error('workspace-unavailable');
  const rows=await fetchSupabaseRows('workspaces',{strictRows:true,select:'id',filters:[['id',eqFilter(workspaceId)]],limit:1});
  if (!Array.isArray(rows)||rows.length!==1||rows[0]?.id!==workspaceId) throw new Error('workspace-unavailable');
  return {status:'live',workspaceId};
}

// Stored target labels are snapshots verified by the atomic RPC. Revisions keep
// these original labels even if the execution item is renamed or later removed.
function recordFromRow(row,workspaceId) {
  if (!row || row.workspace_id!==workspaceId || !isCanonicalUuid(row.id) || !Number.isSafeInteger(row.revision) || row.revision<1
    || typeof row.updated_at!=='string' || Number.isNaN(Date.parse(row.updated_at))) return null;
  const validation=validateDiscoveryInput({...row.snapshot,id:row.id,requestId:row.id,expectedRevision:row.revision});
  if (!validation.ok) return null;
  if (row.snapshot.links.some(link=>!TARGETS[link.type]||typeof link.title!=='string'||!link.title.trim()||link.href!==TARGETS[link.type].href+link.id)) return null;
  const {requestId,expectedRevision,...value}=validation.value;
  return {...value,links:row.snapshot.links.map(({type,id,title,href})=>({type,id,title,href})),revision:row.revision,updatedAt:row.updated_at};
}

export async function getDiscoveryLedger({id=null,offset=0}={}) {
  try {
    if ((id!==null&&!isCanonicalUuid(id)) || !Number.isSafeInteger(offset) || offset<0 || offset>1000000) return readError('records');
    const ctx=await context();if(ctx.status!=='live')return envelope('records',ctx.status);
    const filters=[['workspace_id',eqFilter(ctx.workspaceId)],['offset',String(id?0:offset)]];if(id)filters.push(['id',eqFilter(id.toLowerCase())]);
    const rows=await fetchSupabaseRows('discovery_records',{strictRows:true,select:'id,workspace_id,snapshot,revision,updated_at',filters,order:'updated_at.desc,id.desc',limit:id?2:201});
    if(!Array.isArray(rows)||(id&&rows.length>1))return readError('records');
    const records=rows.map(row=>recordFromRow(row,ctx.workspaceId));
    if(records.some(record=>!record||(id&&record.id!==id.toLowerCase()))||new Set(records.map(r=>r.id)).size!==records.length)return readError('records');
    return {...envelope('records','live'),records:records.slice(0,200),hasMore:records.length>200};
  }catch{return readError('records');}
}

export async function getDiscoveryHistory(id,{offset=0}={}) {
  try {
    if(!isCanonicalUuid(id)||!Number.isSafeInteger(offset)||offset<0||offset>1000000)return readError('history');
    const ctx=await context();if(ctx.status!=='live')return envelope('history',ctx.status);
    const rows=await fetchSupabaseRows('discovery_revisions',{strictRows:true,select:'workspace_id,record_id,snapshot,revision,updated_at',filters:[['workspace_id',eqFilter(ctx.workspaceId)],['record_id',eqFilter(id.toLowerCase())],['offset',String(offset)]],order:'revision.desc',limit:101});
    if(!Array.isArray(rows))return readError('history');
    const history=rows.map(row=>recordFromRow({...row,id:row.record_id},ctx.workspaceId));
    if(history.some(row=>!row||row.id!==id.toLowerCase())||new Set(history.map(row=>row.revision)).size!==history.length)return readError('history');
    return {...envelope('history','live'),history:history.slice(0,100),hasMore:history.length>100};
  }catch{return readError('history');}
}

export async function getDiscoveryTargets({type,q=''}={}) {
  try {
    const target=Object.hasOwn(TARGETS,type)?TARGETS[type]:null;
    if(!target||typeof q!=='string'||q.length>300)return readError('targets');
    const ctx=await context();if(ctx.status!=='live')return envelope('targets',ctx.status);
    const filters=[['workspace_id',eqFilter(ctx.workspaceId)]];
    if(q.trim())filters.push([target.field,`ilike.%${q.trim().replace(/[\\%_*]/g,'\\$&')}%`]);
    const rows=await fetchSupabaseRows(target.table,{strictRows:true,select:`id,workspace_id,${target.field}`,filters,order:'updated_at.desc,id.desc',limit:31});
    if(!Array.isArray(rows)||rows.some(row=>row.workspace_id!==ctx.workspaceId||!isCanonicalUuid(row.id)||(row[target.field]!==null&&typeof row[target.field]!=='string'))||new Set(rows.map(row=>row.id)).size!==rows.length)return readError('targets');
    return {...envelope('targets','live'),targets:rows.slice(0,30).map(row=>({type,id:row.id,title:row[target.field]?.trim()||'이름 없음',href:target.href+row.id})),hasMore:rows.length>30};
  }catch{return readError('targets');}
}

function writeError(httpStatus=502) {
  return {status:'error',configured:configured(),record:null,httpStatus,retryable:true,message:httpStatus===503?'저장 연결이 준비되지 않았어요. 입력은 그대로 남아 있어요.':'저장을 확인하지 못했어요. 같은 요청으로 다시 시도해 주세요.'};
}

export async function saveDiscovery(payload) {
  const validation=validateDiscoveryInput(payload);
  if(!validation.ok)return {status:'invalid-input',record:null,httpStatus:400,retryable:false,message:validation.message};
  try {
    const ctx=await context();if(ctx.status!=='live')return writeError(503);
    const response=await invokeSupabaseRpc('save_discovery_v1',{p_workspace_id:ctx.workspaceId,p_payload:validation.value});
    if(!response.ok)return writeError();
    const data=response.data;
    if(!data||!['saved','duplicate','conflict','invalid-input'].includes(data.status))return writeError();
    if(data.status==='invalid-input')return {status:'invalid-input',record:null,httpStatus:400,retryable:false,message:'입력과 연결할 항목을 확인해 주세요. 대상이 삭제되었거나 다른 워크스페이스에 있을 수 있어요.'};
    const record=data.record===null?null:recordFromRow(data.record,ctx.workspaceId);
    if((data.record!==null&&!record)||(record&&validation.value.id&&record.id!==validation.value.id))return writeError();
    if(data.status==='conflict')return {status:'conflict',record,httpStatus:409,retryable:false,message:'다른 저장 내용이 있어요. 현재 기록을 확인한 뒤 다시 저장해 주세요.'};
    if(!record)return writeError();
    return {status:data.status,record};
  }catch{return writeError();}
}
