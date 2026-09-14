import {z} from 'zod';
import {registerMoonlightTools as registerLegacyTools} from './legacy-tools.js';
import {registerAgentTools} from './agent-tools.js';
import {hasAgentToken} from './agent-client.js';
import {projectLegacyPayload} from './legacy-projection.js';
export {errorResult} from './legacy-tools.js';

const PROFILES={
  core:['get_hub_health','get_daily_brief','list_tasks','get_task','create_task','update_task','complete_task','get_command_receipt'],
  pms:['get_hub_health','list_projects','get_project','list_tasks','get_task','create_task','update_task','complete_task','get_command_receipt'],
  sales:['get_hub_health','list_followups','list_work_orders','get_work_order','record_contact_outcome','get_command_receipt','get_revenue'],
  content:['get_hub_health','get_content_queue','create_campaign'],
  jobs:['get_hub_health','list_codex_projects','list_codex_jobs','get_codex_job','start_codex_job','cancel_codex_job','resume_codex_job'],
};
// Export defaults preserve embedding clients; CLI explicitly selects the small core profile.
export function registerMoonlightTools(server,{profile='all',mode='auto'}={}){
  if(profile!=='all'&&!PROFILES[profile])throw new Error(`Unknown MCP profile: ${profile}`);
  if(!['auto','agent','legacy'].includes(mode))throw new Error(`Unknown MCP API mode: ${mode}`);
  const tools=new Map();const collector={registerTool:(name,definition,handler)=>tools.set(name,{definition,handler})};
  registerLegacyTools({registerTool(name,definition,handler){
    const read=/^(get_|list_)/.test(name);
    const schema=read?{...definition.inputSchema,detail:z.enum(['summary','rows','full']).optional(),limit:definition.inputSchema.limit??z.number().int().min(1).max(100).optional(),offset:z.number().int().min(0).optional()}:definition.inputSchema;
    collector.registerTool(name,{...definition,inputSchema:schema,outputSchema:z.object({status:z.string().optional()}).passthrough(),annotations:{readOnlyHint:read,destructiveHint:name==='decide_work_order',idempotentHint:read,openWorldHint:true,...definition.annotations}},async(args={})=>{
      const result=await handler(args);if(result.isError)return result;
      try{let data=JSON.parse(result.content[0].text);if(read)data=projectLegacyPayload(data,args);return {...result,content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};}catch{return result;}
    });
  }});
  registerAgentTools(collector,{replaceLegacy:mode==='agent'||mode==='auto'&&hasAgentToken()});
  const allowed=profile==='all'?null:new Set(PROFILES[profile]);
  for(const [name,{definition,handler}] of tools)if(!allowed||allowed.has(name))server.registerTool(name,definition,handler);
  return [...tools.keys()].filter(name=>!allowed||allowed.has(name));
}
