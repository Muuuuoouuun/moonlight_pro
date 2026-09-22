import { fetchSupabaseRowsDetailed } from '../server-read.js';
import { resolveDefaultWorkspaceId } from '../server-write.js';
// Deliberately narrow: only explicitly classified recent projects, no CRM/memo fallback.
export async function readOfficeContext(request,{read=fetchSupabaseRowsDetailed,workspaceId=resolveDefaultWorkspaceId()}={}) {
 const empty={source:'provided',scope:request.scope,projects:[],note:'입력한 내용만 참고합니다. 일정·고객·전체 원장은 조회하지 않았습니다.'};
 if(!request.includeProjects) return empty;
 if(!workspaceId) return {...empty,source:'preview',note:'업무 원장 연결이 없어 입력한 내용만 참고합니다.'};
 const filters=[['workspace_id',`eq.${workspaceId}`]];
 if(request.scope!=='all') filters.push(['meta->>org_scope',`eq.${request.scope}`]);
 try {
  const result=await read('projects',{select:'id,name,status,meta',filters,limit:9,order:'updated_at.desc',timeoutMs:2500,strictRows:true});
  if(!result.configured) return {...empty,source:'preview',note:'업무 원장 연결이 없어 입력한 내용만 참고합니다.'};
  if(result.error || !Array.isArray(result.rows)) return {...empty,source:'error',note:'프로젝트 조회 실패. 프로젝트가 없다는 뜻은 아닙니다. 입력한 내용만 참고합니다.'};
  const valid=result.rows.filter(r=>typeof r.id==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(r.id) && typeof r.name==='string' && r.name.trim() && (request.scope==='all'||r.meta?.org_scope===request.scope));
  const projects=valid.slice(0,8).map(r=>({id:r.id,name:r.name.slice(0,300),status:String(r.status||'unknown').slice(0,80),scope:['classin','personal'].includes(r.meta?.org_scope)?r.meta.org_scope:'unknown'}));
  const partial=valid.length!==result.rows.length || result.rows.length>8;
  return {source:partial?'partial':'live',scope:request.scope,projects,note:`최근 프로젝트 최대 8개만 참고합니다.${request.scope==='all'?' 미분류는 unknown으로 표시합니다.':' 범위가 명시된 프로젝트만 포함합니다.'} 일정·고객·전체 프로젝트를 조회한 결과가 아닙니다.${partial?' 일부 항목은 생략했습니다.':''}`};
 }catch{return {...empty,source:'error',note:'프로젝트 조회 실패. 입력한 내용만 참고합니다.'};}
}
