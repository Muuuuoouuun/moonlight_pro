import { fetchSupabaseRowsDetailed, invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@com-moon/supabase-rest';
import { GOAL_ENTITY_TYPES, isGoalUuid, validateGoalCommand, calculateGoalProgress, projectObjective, projectMetric, projectObservation, projectGoalLink } from '@com-moon/goal-contracts';
import { createMetricReader } from '../metrics/source-adapters.js';

const empty = () => ({objectives:[],metrics:[],observations:[],links:[],asOf:new Date().toISOString()});
const readError = error => ({...empty(),status:'error',source:'error',error,retryable:true});
function resolveContext(context) {
  const workspaceId = context?.workspaceId ?? resolveDefaultWorkspaceId();
  const actorId = context?.actorId ?? 'operator';
  return isGoalUuid(workspaceId) && typeof actorId === 'string' && /^[a-zA-Z0-9._:@/-]{1,128}$/.test(actorId) ? {workspaceId:workspaceId.toLowerCase(),actorId} : null;
}
const configured = dependencies => dependencies.configured ?? Boolean(resolveSupabaseConfig());
const noMeasurement = (metric,objective,reason) => ({value:null,coverage:'unmeasured',evidence:[],observedAt:null,sourceKey:metric.sourceKey,periodStart:objective.periodStart,periodEnd:objective.periodEnd,reason});

// Context is supplied only by authenticated server handlers. Query options never
// select a workspace. count=exact catches PostgREST's own lower response cap too.
export async function getGoalsLedger(options = {}, context = {}, dependencies = {}) {
  const ctx = resolveContext(context);
  if (!configured(dependencies) || (!ctx && !context.workspaceId && !resolveDefaultWorkspaceId())) return {...empty(),status:'preview',source:'preview'};
  if (!ctx) return readError('invalid-workspace');
  const {scope,objectiveId,entityType,entityId} = options;
  if ((scope != null && !['personal','company'].includes(scope)) || (objectiveId != null && !isGoalUuid(objectiveId)) || ((entityType != null || entityId != null) && (!GOAL_ENTITY_TYPES.includes(entityType) || !isGoalUuid(entityId)))) return readError('invalid-goal-filter');
  const fetchRows = dependencies.fetchRows ?? fetchSupabaseRowsDetailed;
  const now = new Date(dependencies.now ?? Date.now());
  const reader = dependencies.metricReader ?? createMetricReader({workspaceId:ctx.workspaceId,now});
  let entityScope = null;
  const failedSources = [], truncatedSources = [];
  const read = async (table,filters=[],limit=1000,order='id.asc') => {
    try {
      const result = await fetchRows(table,{select:'*',filters:[['workspace_id',`eq.${ctx.workspaceId}`],...filters],limit,order,count:'exact',strictRows:true});
      if (result.error || !Array.isArray(result.rows) || result.rows.some(row=>row.workspace_id!==ctx.workspaceId)) {failedSources.push(table);return null;}
      if ((Number.isFinite(result.count) && result.count>result.rows.length) || (!Number.isFinite(result.count) && result.rows.length>=limit)) truncatedSources.push(table);
      return result.rows;
    } catch {failedSources.push(table);return null;}
  };
  try {
    let entityLinks = null;
    if (entityType) {
      const table = entityType==='memos'?'journal_entries':entityType;
      const entity = await reader.get(table,entityId);
      entityScope = await reader.resolveEntityScope(table,entity);
      if (!entityScope) return readError('entity-scope-unavailable');
      entityLinks = await read('operating_goal_links',[['entity_type',`eq.${entityType}`],['entity_id',`eq.${entityId}`]],200,'objective_id.asc');
      if (!entityLinks) return readError('goal-links-read-failed');
      if (!entityLinks.length || (scope && scope!==entityScope)) return {...empty(),status:'live',source:'supabase',entityScope};
    }
    const linkedIds = entityLinks ? [...new Set(entityLinks.map(link=>link.objective_id))] : null;
    if (linkedIds?.some(id=>!isGoalUuid(id))) return readError('invalid-goal-links');
    const selectedScope=entityScope||scope;
    const filters = [...(selectedScope?[['scope',`eq.${selectedScope}`]]:[]),...(objectiveId?[['id',`eq.${objectiveId}`]]:[]),...(linkedIds?[['id',`in.(${linkedIds.join(',')})`]]:[])];
    const objectiveRows = await read('operating_objectives',filters,200,'created_at.desc,id.desc');
    if (!objectiveRows || objectiveRows.some(row=>!isGoalUuid(row.id) || (selectedScope && row.scope!==selectedScope) || (objectiveId && row.id!==objectiveId) || (linkedIds && !linkedIds.includes(row.id)))) return readError('goals-read-failed');
    const objectives = objectiveRows.map(projectObjective);
    const objectiveMap = new Map(objectives.map(value=>[value.id,value]));
    if (!objectives.length) return {...empty(),status:truncatedSources.length?'partial':'live',source:'supabase',truncatedSources,entityScope};
    const ids = objectives.map(value=>value.id).join(',');
    const [metricRows,linkRows] = await Promise.all([
      read('operating_metrics',[['objective_id',`in.(${ids})`]],1000),
      read('operating_goal_links',[['objective_id',`in.(${ids})`]],1000,'objective_id.asc,entity_type.asc,entity_id.asc'),
    ]);
    if (metricRows?.some(row=>!isGoalUuid(row.id)||!objectiveMap.has(row.objective_id)) || linkRows?.some(row=>!objectiveMap.has(row.objective_id)||!GOAL_ENTITY_TYPES.includes(row.entity_type)||!isGoalUuid(row.entity_id))) return readError('invalid-goal-relationship');
    const metrics = (metricRows || []).map(projectMetric);
    const metricIds = metrics.map(value=>value.id);
    const observationRows = metricIds.length ? await read('operating_observations',[['metric_id',`in.(${metricIds.join(',')})`]],1000,'created_at.desc,id.desc') : [];
    if (observationRows?.some(row=>!isGoalUuid(row.id)||!metricIds.includes(row.metric_id))) return readError('invalid-goal-observation');
    const observations = (observationRows || []).map(projectObservation);
    const observationCoverage = observationRows === null ? 'unmeasured' : truncatedSources.includes('operating_observations') ? 'partial' : 'complete';
    const measurementCache = new Map();
    const projectedMetrics = await Promise.all(metrics.map(async metric=>{
      const objective = objectiveMap.get(metric.objectiveId);
      let measurement;
      if (metric.sourceKey === 'manual') {
        const dateKey = timestamp => new Intl.DateTimeFormat('en-CA',{timeZone:objective.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
        const matching = observations.filter(row=>row.metricId===metric.id && row.periodStart===objective.periodStart && row.periodEnd===objective.periodEnd)
          .sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||String(b.createdAt).localeCompare(String(a.createdAt))||b.id.localeCompare(a.id));
        measurement = matching[0] ? {...matching[0]} : noMeasurement(metric,objective,'not-recorded');
        if (observationCoverage!=='complete') measurement = {...measurement,value:observationCoverage==='unmeasured'?null:measurement.value,coverage:observationCoverage,reason:'observation-history-incomplete'};
        // Preserve the append-only record for audit, but never count an invalid
        // legacy timestamp as evidence for the present objective period.
        if (matching.length&&(!Number.isFinite(Date.parse(measurement.observedAt))||Date.parse(measurement.observedAt)>now.getTime()||dateKey(measurement.observedAt)<objective.periodStart)) measurement={...measurement,value:null,coverage:'partial',reason:'invalid-observation-time'};
        if (measurement.coverage==='complete' && measurement.observedAt) {
          const today = dateKey(now);
          if (today>objective.periodEnd && dateKey(measurement.observedAt)<objective.periodEnd) measurement={...measurement,coverage:'partial',reason:'period-not-fully-observed'};
        }
      } else {
        const input = {sourceKey:metric.sourceKey,scope:objective.scope,periodStart:objective.periodStart,periodEnd:objective.periodEnd,timezone:objective.timezone,workspaceId:ctx.workspaceId};
        const key = JSON.stringify(input);
        if (!measurementCache.has(key)) measurementCache.set(key,Promise.resolve().then(()=>dependencies.measure ? dependencies.measure(input) : reader.measure(input)).catch(()=>noMeasurement(metric,objective,'measurement-read-failed')));
        measurement = await measurementCache.get(key);
        if (!measurement || !['complete','partial','unmeasured'].includes(measurement.coverage)) measurement = noMeasurement(metric,objective,'invalid-measurement');
      }
      return {...metric,measurement,progress:calculateGoalProgress(metric,measurement)};
    }));
    const links=[];
    if(reader.getMany){
      const groups=new Map();
      for(const row of linkRows||[]){
        const table=row.entity_type==='memos'?'journal_entries':row.entity_type;
        if(!groups.has(table))groups.set(table,new Set());
        groups.get(table).add(row.entity_id);
      }
      await Promise.all([...groups].map(([table,ids])=>reader.getMany(table,[...ids])));
    }
    const hydrateLink=async row=>{
      const link=projectGoalLink(row);
      const table=link.entityType==='memos'?'journal_entries':link.entityType;
      let entity=null,currentScope=null;
      try {entity=await reader.get(table,link.entityId);currentScope=await reader.resolveEntityScope(table,entity);} catch {}
      const linkStatus=!currentScope?'unavailable':currentScope!==objectiveMap.get(link.objectiveId).scope?'scope-mismatch':'current';
      const resolved={...link,linkStatus,stale:linkStatus!=='current',entityScope:currentScope,staleReason:linkStatus==='unavailable'?'entity-source-unavailable':linkStatus==='scope-mismatch'?'entity-scope-mismatch':null};
      if(resolved.stale)return {...resolved,entityHref:null};
      if(table!=='journal_entries')return resolved;
      return {...resolved,entryKind:entity.entry_kind,reviewDate:entity.review_date||null,entityTitle:entity.title||null,
        entityHref:entity.entry_kind==='daily_review'&&/^\d{4}-\d{2}-\d{2}$/.test(entity.review_date)?`/dashboard/work/daily-review?date=${entity.review_date}`:`/dashboard/work/memos?note=${link.entityId}`};
    };
    for(let offset=0;offset<(linkRows?.length||0);offset+=20)links.push(...await Promise.all(linkRows.slice(offset,offset+20).map(hydrateLink)));
    const partial = failedSources.length>0 || truncatedSources.length>0 || links.some(link=>link.stale) || projectedMetrics.some(metric=>metric.measurement.coverage==='partial' || (metric.sourceKey!=='manual' && metric.measurement.coverage!=='complete'));
    return {...empty(),status:partial?'partial':'live',source:'supabase',objectives,metrics:projectedMetrics,observations,links,entityScope,failedSources:[...new Set(failedSources)],truncatedSources:[...new Set(truncatedSources)]};
  } catch {return readError('goals-read-failed');}
}

const writeError = (httpStatus,error,extra={}) => ({status:'error',httpStatus,error,persisted:false,retryable:false,...extra});
const unknownWrite = commandId => writeError(502,'command-outcome-unknown',{commandId,persisted:null,nextAction:'get_goal_command_receipt',retryPolicy:'same-command-id-and-input-only'});
const unknownReceipt = (commandId,httpStatus=502,error='receipt-read-unavailable') => writeError(httpStatus,error,{commandId,persisted:null,nextAction:'get_goal_command_receipt',retryPolicy:'same-command-id-and-input-only',retryable:true});
function commandResponse(data,commandId,write) {
  if (data?.status==='saved' && data.persisted===true && data.commandId===commandId && data.entity && typeof data.entity==='object' && typeof data.replayed==='boolean') return {...data,httpStatus:200};
  if (data?.status==='conflict') return {...data,httpStatus:409,persisted:false,retryable:false};
  if (data?.status==='invalid-input') return {...data,httpStatus:400,persisted:false,retryable:false};
  if (!write && data?.error==='receipt-not-found') return unknownReceipt(commandId,404,'receipt-not-found');
  return write ? unknownWrite(commandId) : unknownReceipt(commandId);
}
async function runRpc(name,params,commandId,write,dependencies) {
  try {
    const result = await (dependencies.rpc ?? invokeSupabaseRpc)(name,params,{timeoutMs:10000});
    if (result.ok) return commandResponse(result.data,commandId,write);
    if (result.error==='missing-config') return write ? writeError(503,'missing-persistence',{commandId}) : unknownReceipt(commandId,503,'missing-persistence');
    if ([401,403,404].includes(result.status)) {
      const error=result.status===404?'goals-migration-required':'goal-storage-unavailable';
      return write ? writeError(503,error,{commandId}) : unknownReceipt(commandId,503,error);
    }
    return write ? unknownWrite(commandId) : unknownReceipt(commandId);
  } catch {return write ? unknownWrite(commandId) : unknownReceipt(commandId);}
}
export async function executeGoalCommand(payload,context={},dependencies={}) {
  const validated = validateGoalCommand(payload);
  if (!validated.ok) return {status:'invalid-input',httpStatus:400,error:validated.error,persisted:false,retryable:false};
  const ctx = resolveContext(context);
  if (!configured(dependencies) || !ctx) return writeError(503,'missing-persistence',{commandId:validated.value.commandId});
  return runRpc('operating_goal_command_v1',{p_workspace_id:ctx.workspaceId,p_actor_id:ctx.actorId,p_command:validated.value},validated.value.commandId,true,dependencies);
}
export async function getGoalCommandReceipt(commandId,context={},dependencies={}) {
  if (!isGoalUuid(commandId)) return writeError(400,'invalid-command-id');
  const ctx = resolveContext(context);
  if (!configured(dependencies) || !ctx) return unknownReceipt(commandId,503,'missing-persistence');
  return runRpc('operating_goal_receipt_v1',{p_workspace_id:ctx.workspaceId,p_actor_id:ctx.actorId,p_command_id:commandId.toLowerCase()},commandId.toLowerCase(),false,dependencies);
}
