import {AgentInputError,openAgentCursor,sealAgentCursor} from '@com-moon/agent-contracts';
import {GOAL_ENTITY_TYPES,isGoalUuid} from '@com-moon/goal-contracts';

const MAX_BYTES=32768;
const text=(value,max)=>typeof value==='string'?value.slice(0,max):null;
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value||{},key)).map(key=>[key,value[key]]));
export function parseAgentGoalsQuery(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['scope','objectiveId','entityType','entityId','limit','cursor'].includes(key)))throw new AgentInputError('Invalid goal query.');
  const limit=Number(input.limit??10);
  if(!Number.isInteger(limit)||limit<1||limit>20)throw new AgentInputError('Goal limit must be between 1 and 20.');
  if(input.scope!=null&&!['personal','company'].includes(input.scope))throw new AgentInputError('Invalid goal scope.');
  if(input.objectiveId!=null&&!isGoalUuid(input.objectiveId))throw new AgentInputError('Invalid objective ID.');
  if((input.entityType!=null||input.entityId!=null)&&(!GOAL_ENTITY_TYPES.includes(input.entityType)||!isGoalUuid(input.entityId)))throw new AgentInputError('Invalid linked entity.');
  if(input.cursor!=null&&(typeof input.cursor!=='string'||input.cursor.length>4096))throw new AgentInputError('Invalid goal cursor.');
  return {...pick(input,['scope','objectiveId','entityType','entityId','cursor']),limit};
}
function objectiveSummary(objective,ledger) {
  const metrics=(ledger.metrics||[]).filter(row=>row.objectiveId===objective.id);
  return {...pick(objective,['id','title','scope','periodStart','periodEnd','timezone','status','revision']),description:text(objective.description,500),descriptionTruncated:(objective.description?.length||0)>500,
    metricCount:metrics.length,activeMetricCount:metrics.filter(row=>row.status!=='archived').length,
    detailQuery:{objectiveId:objective.id,scope:objective.scope},detailHref:`/dashboard/overview?view=goals&goal=${objective.id}&scope=${objective.scope==='company'?'classin':'personal'}`};
}
function evidenceSummary(entry) {
  const result=pick(entry,['count','periodStart','periodEnd','scope']);
  for(const [key,max] of [['type',40],['table',80],['id',80],['label',240],['occurredAt',60],['asOf',60]])if(typeof entry?.[key]==='string')result[key]=text(entry[key],max);
  if(typeof entry?.href==='string'&&entry.href.length<=2048)result.href=entry.href;
  return result;
}
function metricSummary(metric) {
  const value=pick(metric,['id','objectiveId','name','unit','role','direction','baseline','target','targetMin','targetMax','sourceKey','revision','status']);
  if(metric.measurement) {
    const measured=metric.measurement,evidence=Array.isArray(measured.evidence)?measured.evidence:[];
    // Always retain the aggregate query receipt when evidence is sampled.
    const query=evidence.find(entry=>entry.type==='query');
    const selected=evidence.filter(entry=>entry!==query).slice(0,query?2:3);
    if(query)selected.push(query);
    value.measurement={...pick(measured,['value','coverage','observedAt','sourceKey','periodStart','periodEnd']),reason:text(measured.reason,160),definitionNote:text(measured.definitionNote,400),note:text(measured.note,500),noteTruncated:(measured.note?.length||0)>500,
      evidence:selected.map(evidenceSummary),evidenceCount:evidence.length,evidenceTruncated:evidence.length>selected.length||selected.some(entry=>(entry.label?.length||0)>240||(entry.href?.length||0)>2048)};
  }
  value.progress=pick(metric.progress,['value','achieved','state']);
  return value;
}

// A two-step read: page the objective directory, then request objectiveId for
// metric pages. Full append-only history remains available in the Hub. No total
// progress or achievement is invented when a page or source is incomplete.
export function projectAgentGoals(ledger,input,context,{secret=process.env.COM_MOON_AGENT_API_TOKEN?.trim()||''}={}) {
  const query=parseAgentGoalsQuery(input);
  const {cursor,...boundQuery}=query;
  const kind=query.objectiveId?'metrics':'objectives';
  const binding={kind:'operating-goals-v1',workspaceId:context.workspaceId,actorId:context.actorId,scopes:[...(context.scopes||[])].sort(),query:boundQuery};
  const anchor=cursor?openAgentCursor(cursor,binding,secret):null;
  if(anchor&&(!isGoalUuid(anchor.afterId)||anchor.kind!==kind))throw new AgentInputError('Invalid goal cursor.','invalid-cursor');
  const sourceIncomplete=ledger.status==='error'||ledger.status==='partial'||Boolean(ledger.failedSources?.length||ledger.truncatedSources?.length);
  const base={status:ledger.status,source:ledger.source,asOf:ledger.asOf,entityScope:ledger.entityScope??null,error:ledger.error??null,
    failedSources:ledger.failedSources||[],truncatedSources:ledger.truncatedSources||[],sourceIncomplete,
    objectives:[],metrics:[],observations:[],links:[],historyAvailableViaHub:true,historyNote:'Observation history is omitted from this bounded Agent response; use the goal detail in Hub for recorded snapshots.',
    consistency:'Live keyset pages; not a database snapshot.',metricsAvailableViaObjectiveId:true};
  const objectives=Array.isArray(ledger.objectives)?ledger.objectives:[];
  const objective=query.objectiveId?objectives.find(row=>row.id===query.objectiveId):null;
  const all=(kind==='metrics'?(ledger.metrics||[]).filter(row=>row.objectiveId===query.objectiveId):objectives).slice().sort((a,b)=>a.id.localeCompare(b.id));
  const after=all.filter(row=>!anchor||row.id>anchor.afterId);
  if(objective)base.objectives=[objectiveSummary(objective,ledger)];
  if(objective) {
    const links=(ledger.links||[]).filter(row=>row.objectiveId===objective.id);
    base.links=links.slice(0,8).map(row=>pick(row,['objectiveId','entityType','entityId','entityHref','entryKind','reviewDate','linkStatus','stale','staleReason','entityScope']));
    base.linkCount=links.length;base.linksTruncated=links.length>base.links.length;
  }
  let count=Math.min(query.limit,after.length);
  for(;;) {
    const selected=after.slice(0,count);
    const hasMore=after.length>selected.length;
    const data={...base,[kind]:selected.map(row=>kind==='metrics'?metricSummary(row):objectiveSummary(row,ledger)),
      page:{resource:kind,returnedCount:selected.length,totalCount:sourceIncomplete?null:all.length,hasMore,nextCursor:hasMore&&selected.length?sealAgentCursor({kind,afterId:selected.at(-1).id},binding,secret):null},
      projectionTruncated:kind==='objectives'||(ledger.observations?.length||0)>0||Boolean(base.linksTruncated)||selected.some(row=>kind==='metrics'&&(row.measurement?.evidence?.length||0)>3)};
    if(Buffer.byteLength(JSON.stringify(data),'utf8')<=MAX_BYTES)return data;
    if(count>1){count-=1;continue;}
    throw new AgentInputError('Goal detail exceeds the bounded projection. Open this goal in Hub.','goal-response-too-large');
  }
}
