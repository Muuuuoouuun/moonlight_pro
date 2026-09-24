import {z} from 'zod';
import {registerMoonlightTools as registerLegacyTools} from './legacy-tools.js';
import {registerAssistanceTools} from './assistance-tools.js';
import {registerAgentTools} from './agent-tools.js';
import {hasAgentToken} from './agent-client.js';
import {projectLegacyPayload} from './legacy-projection.js';
import {projectWeeklyPayload} from './weekly-projection.js';
export {errorResult} from './legacy-tools.js';

const PROFILES={
  assistant:['get_hub_health','get_work_context','get_ai_candidate','search_knowledge','get_weekly_report','get_goals','record_goal_command','get_goal_receipt','save_ai_candidate','request_ai_assist','record_assist_outcome','recover_ai_candidate','get_assistance_receipt'],
  core:['get_hub_health','get_daily_brief','list_tasks','get_task','create_task','update_task','complete_task','get_command_receipt','get_skill_request','record_skill_receipt'],
  pms:['get_hub_health','list_projects','get_project','list_tasks','get_task','create_task','update_task','complete_task','get_command_receipt'],
  sales:['get_hub_health','list_followups','list_work_orders','get_work_order','record_contact_outcome','get_command_receipt','get_revenue'],
  content:['get_hub_health','get_content_queue','create_campaign'],
  jobs:['get_hub_health','list_codex_projects','list_codex_jobs','get_codex_job','start_codex_job','cancel_codex_job','resume_codex_job'],
};
export const PROFILE_NAMES=[...Object.keys(PROFILES),'all'];
// Export defaults preserve embedding clients; CLI explicitly selects the small core profile.
// readOnly keeps only tools annotated readOnlyHint — the same hint clients use for approval UI.
export function registerMoonlightTools(server,{profile='all',mode='auto',readOnly=false}={}){
  if(profile!=='all'&&!PROFILES[profile])throw new Error(`Unknown MCP profile: ${profile}`);
  if(!['auto','agent','legacy'].includes(mode))throw new Error(`Unknown MCP API mode: ${mode}`);
  const tools=new Map();const collector={registerTool:(name,definition,handler)=>tools.set(name,{definition,handler})};
  registerLegacyTools({registerTool(name,definition,handler){
    const read=/^(get_|list_)/.test(name);
    const schema=read?{...definition.inputSchema,detail:z.enum(['summary','rows','full']).optional(),limit:definition.inputSchema.limit??z.number().int().min(1).max(100).optional(),offset:z.number().int().min(0).optional()}:definition.inputSchema;
    collector.registerTool(name,{...definition,inputSchema:schema,outputSchema:z.object({status:z.string().optional()}).passthrough(),annotations:{readOnlyHint:read,destructiveHint:name==='decide_work_order',idempotentHint:read,openWorldHint:true,...definition.annotations}},async(args={})=>{
      const result=await handler(args);if(result.isError)return result;
      try{let data=JSON.parse(result.content[0].text);if(read)data=name==='get_weekly_report'?projectWeeklyPayload(data):projectLegacyPayload(data,args);return {...result,content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};}catch{return result;}
    });
  }});
  registerAgentTools(collector,{replaceLegacy:mode==='agent'||mode==='auto'&&hasAgentToken()});
  registerAssistanceTools(collector);
  const allowed=profile==='all'?null:new Set(PROFILES[profile]);
  const selected=[...tools].filter(([name,{definition}])=>(!allowed||allowed.has(name))&&(!readOnly||definition.annotations?.readOnlyHint===true));
  for(const [name,{definition,handler}] of selected)server.registerTool(name,definition,handler);
  return selected.map(([name])=>name);
}
