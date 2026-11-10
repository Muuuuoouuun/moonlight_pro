import { OFFICE_BRAND_CONTEXT_MAX } from '@com-moon/agent-contracts/office';
import { fetchSupabaseRowsDetailed, inFilter } from '../server-read.js';
import { resolveDefaultWorkspaceId } from '../server-write.js';
import { BRAND_IDENTITY_FIELDS, BRAND_OPERATING_STATES, mapBrandIdentity } from '../brand-identity.js';
import { buildContentLogEntries } from '../brand-content-log.js';
// 브랜드 기록 부착(읽기 전용, 2026-10-29 오피스 탭 개선안 P4): 원천 = brands(설명·meta 칸) + content_items 최근 5줄(dashboard/brands/log와 같은 원천).
const LOG_LIMIT=5, FIELD_MAX=400;
const clip=(value,max)=>{const text=String(value||'').replace(/\s+/g,' ').trim();return text.length>max?`${text.slice(0,max-1)}…`:text;};
const brandNote=(status,reason)=>({status,name:null,lines:0,truncated:false,reason});
function brandLines(brand){
 const state=BRAND_OPERATING_STATES.find(item=>item.value&&item.value===brand.operatingState)?.label;
 const labelOf=Object.fromEntries(BRAND_IDENTITY_FIELDS.map(([key,label])=>[key,label]));
 const field=(key,value)=>value?`${labelOf[key]||key}: ${clip(Array.isArray(value)?value.join(' / '):value,FIELD_MAX)}`:'';
 return {
  head:[brand.description&&`설명: ${clip(brand.description,FIELD_MAX)}`,state&&`운영 상태: ${state}`,field('currentFocus',brand.currentFocus)].filter(Boolean),
  identity:[['audience'],['promise'],['philosophy'],['direction'],['offer'],['keywords'],['voice'],['voiceExamples'],['rules'],['forbidden']].map(([key])=>field(key,brand[key])).filter(Boolean),
 };
}
// 줄 단위로 2,000자 안에서 자른다. 못 담은 줄이 하나라도 있으면 truncated.
function fitLines(lines){
 const kept=[];let size=0;
 for(const line of lines){const next=size+(kept.length?1:0)+line.length;if(next>OFFICE_BRAND_CONTEXT_MAX)return {kept,truncated:true};kept.push(line);size=next;}
 return {kept,truncated:false};
}
async function readBrandContext(request,{read,workspaceId}){
 if(!workspaceId) return brandNote('error','not-configured');
 const scoped=[['workspace_id',`eq.${workspaceId}`]];
 try{
  const found=await read('brands',{select:'id,slug,name,description,meta,updated_at',filters:[...scoped,['id',`eq.${request.brandId}`]],limit:1,timeoutMs:2500,strictRows:true});
  if(!found.configured) return brandNote('error','not-configured');
  if(found.error||!Array.isArray(found.rows)) return brandNote('error','read-failed');
  if(!found.rows.length) return brandNote('error','not-found');
  const brand=mapBrandIdentity(found.rows[0]);
  // 레인: 회사 요청에는 회사 브랜드만, 개인 요청에는 개인 브랜드만. 다른 레인이면 이름도 싣지 않는다.
  if(brand.orgScope!==request.scope) return brandNote('rejected','scope');
  const logRead=await read('content_items',{select:'id,title,summary,source_idea,status,scheduled_at,published_at,created_at,updated_at',filters:[...scoped,['brand_id',`eq.${brand.id}`],['status',inFilter(['idea','draft','review','scheduled','published'])]],limit:LOG_LIMIT,order:'updated_at.desc',timeoutMs:2500,strictRows:true});
  const logUnread=!!logRead.error||!Array.isArray(logRead.rows);
  const entries=logUnread?[]:buildContentLogEntries(logRead.rows.map(r=>({id:r.id,status:r.status,title:String(r.title||'').trim()||'제목 없음',summary:r.summary||r.source_idea||'',publishedAt:r.published_at,scheduledAt:r.scheduled_at,updatedAt:r.updated_at,createdAt:r.created_at,brandKey:brand.key,brandName:brand.name})),[brand]);
  const parts=brandLines(brand);
  const log=entries.length?['최근 컨텐츠 로그:',...entries.map(e=>`- ${e.when} ${e.statusLabel} · ${clip(e.title,80)}${e.memo?` — ${clip(e.memo,80)}`:''}`)]:[];
  const {kept,truncated}=fitLines([`브랜드: ${brand.name}`,...parts.head,...log,...parts.identity]);
  return {status:truncated||logUnread?'partial':'live',name:brand.name,lines:kept.length-1,truncated,...(logUnread?{logUnread:true}:{}),text:kept.join('\n')};
 }catch{return brandNote('error','read-failed');}
}
// Deliberately narrow: only explicitly classified recent projects, no CRM/memo fallback.
export async function readOfficeContext(request,{read=fetchSupabaseRowsDetailed,workspaceId=resolveDefaultWorkspaceId()}={}) {
 const base=await readProjectContext(request,{read,workspaceId});
 return request.brandId&&request.scope!=='all'?{...base,brand:await readBrandContext(request,{read,workspaceId})}:base;
}
async function readProjectContext(request,{read,workspaceId}) {
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
