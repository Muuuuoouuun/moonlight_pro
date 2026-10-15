import { fetchSupabaseRowsDetailed } from '../server-read.js';
import { resolveDefaultWorkspaceId } from '../server-write.js';
import { isCanonicalUuid } from '../uuid.js';
import { projectResearchRun, researchSettings, RESEARCH_BRANDS } from '../research-run-contract.js';

export async function listResearchRuns({workspaceId=resolveDefaultWorkspaceId(),brand=null,read=fetchSupabaseRowsDetailed,env=process.env}={}) {
  const empty=status=>({status,runs:[],settings:researchSettings(env)});
  if(!isCanonicalUuid(workspaceId))return empty('preview');
  if(brand&&!RESEARCH_BRANDS.some(item=>item.slug===brand))return empty('error');
  try {const result=await read('research_runs',{select:'id,brand_slug,topic,status,started_at,finished_at,counts,model,usage,reason,brief_ids',filters:[['workspace_id',`eq.${workspaceId}`],...(brand?[['brand_slug',`eq.${brand}`]]:[])],order:'started_at.desc,id.desc',limit:30,dedupe:false});
    if(!result.configured)return empty('preview');if(result.error||!Array.isArray(result.rows))return empty('error');return {status:'live',runs:result.rows.map(projectResearchRun),settings:researchSettings(env)};
  }catch{return empty('error');}
}
