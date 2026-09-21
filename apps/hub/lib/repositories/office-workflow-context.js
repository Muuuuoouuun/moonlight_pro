// A bounded, server-owned view of one work item. Never accepts client facts.
import { createHash } from 'node:crypto';
import { parseOfficeWorkflowContext } from '@com-moon/agent-contracts/office-workflow';
import { fetchSupabaseRowsDetailed } from '../server-read.js';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '../server-write.js';
import { createMetricReader, metricPeriodWindow } from '../metrics/source-adapters.js';
import { getWeeklyReport } from './weekly-report.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_TABLES = { lead: 'leads', customer_account: 'customer_accounts', deal: 'deals' };
const ACTIVITY_LINKS = { lead: 'lead_id', customer_account: 'account_id', deal: 'deal_id' };
const CONTACT_KINDS = new Set(['call','meeting','info_session','demo','visit','email','kakao','quote','note']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const fail = (error, status='error') => ({status,error,capabilities:{generate:false,applyTask:false}});

export function normalizeOfficeOrigin({intent,scope,originRef}={}) {
  if (!['personal','classin'].includes(scope) || !object(originRef)) return null;
  if (intent === 'weekly_report') {
    const {periodStart,periodEnd,timezone='Asia/Seoul'}=originRef;
    if (Object.keys(originRef).some(key=>!['periodStart','periodEnd','timezone'].includes(key)) || !metricPeriodWindow({periodStart,periodEnd,timezone}) || Date.parse(periodEnd)-Date.parse(periodStart)!==6*86400000) return null;
    return {originRef:{periodStart,periodEnd,timezone},originKey:`weekly_report:${scope}:${periodStart}:${periodEnd}:${timezone}`};
  }
  if (intent === 'customer_reply') {
    const {entityType,entityId}=originRef;
    if (Object.keys(originRef).some(key=>!['entityType','entityId'].includes(key)) || !CUSTOMER_TABLES[entityType] || typeof entityId!=='string' || !UUID.test(entityId)) return null;
    return {originRef:{entityType,entityId:entityId.toLowerCase()},originKey:`customer_reply:${scope}:${entityType}:${entityId.toLowerCase()}`};
  }
  return null;
}

export function officeContextHash({scope,originRef,facts,sourceRefs,missing}) {
  return createHash('sha256').update(JSON.stringify(canonical({version:1,scope,originRef,facts,missing,
    sourceRefs:[...sourceRefs].sort((a,b)=>`${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)),
  }))).digest('hex');
}

function finishContext(input, normalized, data, now) {
  const context = {scope:input.scope,...normalized,...data,asOf:now.toISOString(),capabilities:{generate:true,applyTask:true}};
  if (context.sourceRefs.length>80 || Buffer.byteLength(JSON.stringify({facts:context.facts,sourceRefs:context.sourceRefs,missing:context.missing}),'utf8')>24*1024) return fail('context-too-large');
  const ready={status:'ready',...context,contextHash:officeContextHash(context)};
  try { return parseOfficeWorkflowContext(ready,{...input,originRef:normalized.originRef,expectedContextHash:ready.contextHash}); }
  catch { return fail('office-context-invalid'); }
}

export async function getOfficeWorkflowContext(input, {
  workspaceId=resolveDefaultWorkspaceId(), actorId,
  configured=Boolean(resolveSupabaseConfig()), now=new Date(),
  readRows=fetchSupabaseRowsDetailed, weeklyReport=getWeeklyReport,
  reader=createMetricReader({workspaceId,readRows,now}),
}={}) {
  const normalized=normalizeOfficeOrigin(input);
  if (!normalized) return fail('invalid-office-origin');
  if (!configured || !workspaceId) return fail('missing-context-connection','preview');
  if (!UUID.test(workspaceId) || (actorId!=null && (typeof actorId!=='string' || !/^[a-zA-Z0-9._:@/-]{1,128}$/.test(actorId)))) return fail('invalid-office-context');
  const metricScope=input.scope==='classin'?'company':'personal';
  try {
    if (input.intent==='weekly_report') {
      const report=await weeklyReport({scope:metricScope,...normalized.originRef,workspaceId,now});
      if (!report || report.source==='error' || !report.stats) return fail('weekly-report-read-failed');
      const measurements=(report.measurements||[]).map(item=>({sourceKey:item.sourceKey,value:item.value,coverage:item.coverage,reason:item.reason||null,
        evidence:(item.evidence||[]).map(({asOf,observedAt,...ref})=>ref)}));
      const goals=(report.goals?.objectives||[]).map(item=>({id:item.id,title:item.title,status:item.status,revision:item.revision??null,updatedAt:item.updatedAt??item.updated_at??null}));
      const sourceRefs=[{id:'weekly:report',type:'aggregate',label:'선택 기간의 주간 기록'},
        ...measurements.map(item=>({id:`weekly:${item.sourceKey}`,type:'metric',label:item.sourceKey})),
        ...goals.map(item=>({id:`goal:${item.id}`,type:'objective',entityId:item.id,...(item.updatedAt?{updatedAt:item.updatedAt}:{}),label:item.title||'연결 목표'})),
      ];
      const facts={definitionVersion:1,period:normalized.originRef,stats:report.stats,definitions:report.definitions||{},measurements,goals};
      return finishContext(input,normalized,{facts,sourceRefs,missing:[...(report.failedSources||[])]},now);
    }
    const {entityType,entityId}=normalized.originRef;
    const table=CUSTOMER_TABLES[entityType];
    const answer=await readRows(table,{select:'*',filters:[['workspace_id',`eq.${workspaceId}`],['id',`eq.${entityId}`]],limit:1,strictRows:true});
    if (answer?.error || !Array.isArray(answer?.rows)) return fail('customer-read-failed');
    if (!answer.rows.length) return fail('customer-not-found');
    const row=answer.rows[0];
    if (row.id!==entityId || row.workspace_id!==workspaceId) return fail('customer-access-denied');
    const meta=row.meta||{};
    const knownScopeValues=['classin','company','business','personal','brand','individual'];
    const scopeEvidence=row.company_id || row.brand_id || meta.lane==='classin_sales' || meta.brand || meta.brand_key || meta.brandKey || meta.brand_slug
      || [row.org_scope,meta.org_scope,meta.workspace,meta.account_kind,meta.type,meta.kind].some(value=>knownScopeValues.includes(value));
    if (!scopeEvidence) return fail('customer-scope-unavailable');
    const scope=await reader.resolveEntityScope(table,row);
    if (!scope) return fail('customer-scope-unavailable');
    if (scope!==metricScope) return fail('customer-scope-mismatch');
    const activity=await readRows('crm_activities',{
      select:'id,workspace_id,kind,body,occurred_at,created_at,lead_id,deal_id,account_id',
      filters:[['workspace_id',`eq.${workspaceId}`],[ACTIVITY_LINKS[entityType],`eq.${entityId}`],['kind',`in.(${[...CONTACT_KINDS].join(',')})`]],
      order:'occurred_at.desc,id.desc',limit:6,strictRows:true,
    });
    if (activity?.error || !Array.isArray(activity?.rows)) return fail('customer-activities-read-failed');
    if (activity.rows.some(item=>item.workspace_id!==workspaceId || item[ACTIVITY_LINKS[entityType]]!==entityId || !CONTACT_KINDS.has(item.kind))) return fail('customer-activities-scope-mismatch');
    const activities=activity.rows.slice(0,5).map(item=>({id:item.id,kind:item.kind,body:item.body||'',occurredAt:item.occurred_at||item.created_at,updatedAt:item.updated_at||item.created_at}));
    const facts={customer:{id:entityId,entityType,name:row.name||row.title||'',stage:row.meta?.stage_detail||row.stage||null,
      nextAction:row.next_action||row.meta?.next_action||'',nextContactAt:row.next_action_at||row.meta?.next_action_at||null},activities,
      activityWindow:{limit:5,hasMore:activity.rows.length>5,relationship:'direct-entity-only'}};
    const sourceRefs=[{id:`${table}:${entityId}`,type:table,entityId,updatedAt:row.updated_at||row.created_at,label:facts.customer.name||'선택 고객'},
      ...activities.map(item=>({id:`crm_activities:${item.id}`,type:'crm_activities',entityId:item.id,updatedAt:item.updatedAt,label:item.kind}))];
    const missing=[];
    if (!activities.some(item=>item.body.trim())) missing.push('recorded-customer-words-unavailable');
    if (activity.rows.length>5) missing.push('activities-limited-to-latest-five');
    return finishContext(input,normalized,{facts,sourceRefs,missing},now);
  } catch { return fail('office-context-read-failed'); }
}
