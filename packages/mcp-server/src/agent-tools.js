import {z} from 'zod';
import {AGENT_RESOURCES} from '@com-moon/agent-contracts';
import {agentRequest,agentToolResult} from './agent-client.js';
const uuid=()=>z.string().uuid();
const text=(max)=>z.string().max(max);
const utf8Text=(maxBytes)=>z.string().max(maxBytes).refine(value=>Buffer.byteLength(value,'utf8')<=maxBytes,`Must fit ${maxBytes} UTF-8 bytes`).describe(`Maximum ${maxBytes} UTF-8 bytes.`);
const outputSchema=z.object({status:z.string()}).passthrough();
const listSchema={detail:z.enum(['summary','rows','full']).optional(),limit:z.number().int().min(1).max(100).optional(),cursor:text(4096).optional(),fields:z.array(text(80)).max(30).optional(),fresh:z.boolean().optional()};
const checklist=z.array(z.object({id:uuid(),title:z.string().min(1).max(200),done:z.boolean(),note:text(500).optional()})).max(50).optional();
const taskFields={checklist,title:text(300).optional(),description:text(4000).nullable().optional(),projectId:uuid().nullable().optional(),dealId:uuid().nullable().optional(),status:z.enum(['inbox','todo','doing','blocked','done']).optional(),priority:z.enum(['low','medium','high','critical']).optional(),nextAction:text(1000).nullable().optional(),dueAt:text(100).nullable().optional()};
const {dealId: _createOnlyDealId,...taskUpdateFields}=taskFields;
const output=(result)=>agentToolResult(result);
function register(server,name,description,inputSchema,handler,{write=false,idempotent=true}={}){
  server.registerTool(name,{title:name.replaceAll('_',' '),description,inputSchema,outputSchema,annotations:{readOnlyHint:!write,destructiveHint:false,idempotentHint:idempotent,openWorldHint:write}},handler);
}
export function registerAgentTools(server,{replaceLegacy=true}={}){
  register(server,'get_hub_health','Check Agent API authentication, sources, granted actions, and worker availability. No writes.',{},async()=>output(await agentRequest('/capabilities')));
  const lists=[['list_tasks','tasks'],['list_projects','projects'],['list_followups','followups'],['list_work_orders','work-orders']];
  for(const [name,resource] of lists){
    if(!replaceLegacy&&['list_tasks','list_projects','list_work_orders'].includes(name))continue;
    const config=AGENT_RESOURCES[resource];
    const filters=Object.fromEntries(Object.entries(config.filters).map(([key,type])=>[key,(Array.isArray(type)?z.enum(type):type==='uuid'?uuid():text(100)).optional()]));
    register(server,name,`Read bounded ${resource}. Use filters and fields; fetch one entity for its full text.`,{...listSchema,...filters},async(args={})=>{
      const {detail='rows',limit=20,cursor,fields,fresh,...requestedFilters}=args;
      const selectedFilters=Object.fromEntries(Object.entries(requestedFilters).filter(([,v])=>v!==undefined));
      const body={resource,detail,limit,filters:selectedFilters,...(cursor?{cursor}:{}),...(fields?{fields}:{}),...(fresh!==undefined?{fresh}:{})};
      return output(await agentRequest('/query',{method:'POST',body}));
    });
  }
  for(const [name,type] of [['get_task','tasks'],['get_project','projects'],['get_work_order','work-orders']]){
    register(server,name,`Read one ${type} entity with exact version and bounded text. Use section cursor for more.`,{id:uuid(),detail:z.enum(['summary','rows','full']).optional(),nextSectionCursor:text(4096).optional()},async({id,detail='full',nextSectionCursor})=>{
      const params=new URLSearchParams({detail,fresh:'true'});if(nextSectionCursor)params.set('nextSectionCursor',nextSectionCursor);
      return output(await agentRequest(`/entities/${type}/${encodeURIComponent(id)}?${params}`));
    });
  }
  if(replaceLegacy)register(server,'create_task','Create a task. Generate a commandId UUID once and reuse it for retries; check receipt after an unknown outcome.',{commandId:uuid(),...taskFields,title:z.string().min(1).max(300)},async({commandId,...input})=>output(await agentRequest('/commands',{method:'POST',body:{commandId,action:'create_task',input}})),{write:true});
  for(const action of ['update_task','complete_task']){
    register(server,action,`${action==='complete_task'?'Complete':'Update'} a task using its current updatedAt from get_task. Reuse commandId on retries. A conflict requires fresh review.`,{commandId:uuid(),id:uuid(),expectedUpdatedAt:text(100),...(action==='update_task'?taskUpdateFields:{})},async({commandId,id,expectedUpdatedAt,...input})=>output(await agentRequest('/commands',{method:'POST',body:{commandId,action,targetId:id,expectedUpdatedAt,input}})),{write:true});
  }
  register(server,'record_contact_outcome','Record a contact action the operator actually performed. Does not send a message. Reuse commandId on retry.',{commandId:uuid(),entityType:z.enum(['lead','deal','account']),entityId:uuid(),contactId:uuid().nullable().optional(),kind:z.enum(['call','meeting','info_session','demo','visit','email','update','note','kakao','quote']).optional(),summary:z.string().min(1).max(4000),reaction:z.enum(['positive','neutral','concern','rejected','no_response']),nextAction:text(1000).nullable().optional(),nextActionAt:text(100).nullable().optional(),dormant:z.boolean().optional()},async({commandId,...input})=>output(await agentRequest('/commands',{method:'POST',body:{commandId,action:'record_contact_outcome',input}})),{write:true});
  register(server,'get_command_receipt','Check whether a prior command was persisted before considering a retry.',{commandId:uuid()},async({commandId})=>output(await agentRequest(`/commands/${encodeURIComponent(commandId)}`)));
  register(server,'get_skill_request','Read an operator-approved local skill request by its exact ID. The skill itself runs only in the local Codex or Claude Code session.',{requestId:uuid()},async({requestId})=>output(await agentRequest(`/skill-requests/${encodeURIComponent(requestId)}`)));
  register(server,'record_skill_receipt','Record the actual local skill outcome with evidence. This never completes the linked task. If a separate complete_task command was saved, include its commandId for same-task verification.',{requestId:uuid(),state:z.enum(['completed','failed','unconfirmed']),summary:z.string().min(1).max(2000),evidence:z.array(z.object({kind:z.enum(['path','url','note']),value:z.string().min(1).max(1024)})).max(8),commandId:uuid().optional()},async({requestId,...body})=>output(await agentRequest(`/skill-requests/${encodeURIComponent(requestId)}/receipts`,{method:'POST',body})),{write:true});
  register(server,'search_knowledge','Search operator knowledge base (memos, reviews, customer outcomes) with hybrid relevance scoring and attributed quotes.',{query:text(200),limit:z.number().int().min(1).max(20).optional(),kinds:z.array(text(40)).max(5).optional()},async({query,limit=5,kinds})=>output(await agentRequest('/search',{method:'POST',body:{query,limit,kinds}})));
  register(server,'list_codex_projects','List worker-registered projects and availability. Returns no local paths or secrets.',{},async()=>output(await agentRequest('/jobs?view=projects')));
  register(server,'list_codex_jobs','Read recent Codex jobs and their actual completion states.',{},async()=>output(await agentRequest('/jobs')));
  register(server,'get_codex_job','Read a job, its results and reported usage.',{id:uuid()},async({id})=>output(await agentRequest(`/jobs/${encodeURIComponent(id)}`)));
  register(server,'start_codex_job','Queue a Codex task in a registered project. Explicit request only; may use model usage. Reuse requestId on retry.',{requestId:uuid(),projectId:text(100),prompt:utf8Text(16384),mode:z.enum(['read','draft','apply']).default('read'),contextRefs:z.array(text(100)).max(8).optional(),budget:z.object({wallClockSeconds:z.number().int().min(10).max(3600).optional(),maxTokens:z.number().int().min(100).max(1000000).nullable().optional(),maxTurns:z.number().int().min(1).max(10).optional()}).optional(),queueIfOffline:z.boolean().optional()},async(body)=>output(await agentRequest('/jobs',{method:'POST',body})),{write:true});
  register(server,'cancel_codex_job','Request cancellation of the observed job turn; already persisted work remains visible.',{id:uuid(),expectedTurnCount:z.number().int().min(0)},async({id,...body})=>output(await agentRequest(`/jobs/${encodeURIComponent(id)}/cancel`,{method:'POST',body})),{write:true});
  register(server,'resume_codex_job','Continue an existing job only on explicit request. For needs_attention, first review changed files and receipts and record reconciliation.',{id:uuid(),requestId:uuid(),expectedTurnCount:z.number().int().min(0),prompt:utf8Text(16384).optional(),queueIfOffline:z.boolean().optional(),reconciliation:z.object({confirmed:z.literal(true),note:utf8Text(2048).refine(value=>value.trim().length>=16,'At least 16 characters required'),checkedThreadId:text(200).nullable()}).optional()},async({id,...body})=>output(await agentRequest(`/jobs/${encodeURIComponent(id)}/resume`,{method:'POST',body})),{write:true});
}
