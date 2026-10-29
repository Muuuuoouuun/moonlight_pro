import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficeRequest,parseOfficeContext,OFFICE_BRAND_CONTEXT_MAX,OFFICE_VERSION} from '@com-moon/agent-contracts/office';
import {readOfficeContext} from '../repositories/office-context.js';
import {callOfficeEngine} from './engine-client.js';

const BRAND='33333333-3333-4333-8333-333333333333';
const raw=(scope,extra={})=>parseOfficeRequest({ownerId:'sylveon',message:'새 시리즈 방향',scope,brandId:BRAND,...extra});
const brandRow=(slug,meta={})=>({id:BRAND,slug,name:'Study.Seagull',description:'공부하는 갈매기',meta,updated_at:'2026-10-01T00:00:00Z'});
const contentRow=(i,title)=>({id:`aaaaaaaa-0000-4000-8000-00000000000${i}`,title,summary:'메모',status:'published',published_at:'2026-10-2'+i+'T03:00:00Z',updated_at:'2026-10-2'+i+'T03:00:00Z'});
const reader=(brand,content)=>async(table,opts)=>{
 assert.deepEqual(opts.filters[0],['workspace_id','eq.ws']);
 if(table==='brands'){assert.deepEqual(opts.filters[1],['id',`eq.${BRAND}`]);return brand;}
 assert.equal(table,'content_items');assert.equal(opts.limit,5);assert.deepEqual(opts.filters[1],['brand_id',`eq.${BRAND}`]);return content;
};
const ok=rows=>({configured:true,rows});

test('brandId is optional, must be a uuid, and is dropped for scope all',()=>{
 assert.equal(raw('classin').brandId,BRAND);
 assert.equal('brandId' in parseOfficeRequest({ownerId:'sylveon',message:'x',scope:'personal'}),false);
 assert.equal('brandId' in raw('all'),false);
 assert.equal('brandId' in parseOfficeRequest({message:'x',scope:'personal',brandId:null}),false);
 for(const bad of ['not-a-uuid',7,{}]) assert.throws(()=>parseOfficeRequest({message:'x',scope:'personal',brandId:bad}));
});

test('brand record is attached read-only with name, line count and the recent 5 content log lines',async()=>{
 const rows=[1,2,3,4,5].map(i=>contentRow(i,`글 ${i}`));
 const ctx=await readOfficeContext(raw('personal'),{workspaceId:'ws',read:reader(ok([brandRow('studyseagull',{org_scope:'personal',operating_state:'active',current_focus:'릴스 3편',voice:'담백하게'})]),ok(rows))});
 assert.equal(ctx.brand.status,'live');assert.equal(ctx.brand.name,'Study.Seagull');assert.equal(ctx.brand.truncated,false);
 assert.match(ctx.brand.text,/운영 상태: 운영중/);assert.match(ctx.brand.text,/현재 집중점: 릴스 3편/);
 assert.equal(ctx.brand.text.split('\n').filter(l=>l.startsWith('- ')).length,5);
 assert.equal(ctx.brand.lines,ctx.brand.text.split('\n').length-1);
 assert.deepEqual(parseOfficeContext(ctx,'personal'),ctx);                  // Engine 되돌림 비교(JSON)와 같은 키 순서
 assert.equal(JSON.stringify(parseOfficeContext(ctx,'personal')),JSON.stringify(ctx));
 assert.equal(ctx.source,'provided');assert.deepEqual(ctx.projects,[]);       // 프로젝트 읽기와 독립
});

test('over 2,000 chars is cut on a line boundary and marked partial/truncated',async()=>{
 const long='가'.repeat(390);
 const ctx=await readOfficeContext(raw('personal'),{workspaceId:'ws',read:reader(ok([brandRow('x',{org_scope:'personal',audience:long,promise:long,philosophy:long,direction:long,offer:long,voice:long,voice_examples:long})]),ok([]))});
 assert.equal(ctx.brand.status,'partial');assert.equal(ctx.brand.truncated,true);
 assert.ok(ctx.brand.text.length<=OFFICE_BRAND_CONTEXT_MAX);assert.doesNotMatch(ctx.brand.text,/\n$/);
 parseOfficeContext(ctx,'personal');
});

test('lane check: a company request never carries a personal brand (and no name leaks)',async()=>{
 const ctx=await readOfficeContext(raw('classin'),{workspaceId:'ws',read:async t=>t==='brands'?ok([brandRow('studyseagull',{org_scope:'personal'})]):assert.fail('log must not be read')});
 assert.deepEqual(ctx.brand,{status:'rejected',name:null,lines:0,truncated:false,reason:'scope'});
 // meta.org_scope가 없으면 정본 규칙(classmoon·studyseagull·classin_side = 회사)
 const company=await readOfficeContext(raw('classin'),{workspaceId:'ws',read:reader(ok([brandRow('studyseagull')]),ok([]))});
 assert.equal(company.brand.status,'live');
 const personal=await readOfficeContext(raw('personal'),{workspaceId:'ws',read:async t=>t==='brands'?ok([brandRow('studyseagull')]):assert.fail()});
 assert.equal(personal.brand.reason,'scope');
});

test('unreadable brand is stated, never silently dropped; the request still gets its project context',async()=>{
 for(const [brand,reason] of [[{configured:true,rows:null,error:{}},'read-failed'],[ok([]),'not-found'],[{configured:false},'not-configured']]) {
  const ctx=await readOfficeContext(raw('personal'),{workspaceId:'ws',read:async()=>brand});
  assert.deepEqual(ctx.brand,{status:'error',name:null,lines:0,truncated:false,reason});assert.equal(ctx.source,'provided');parseOfficeContext(ctx,'personal');
 }
 const noWs=await readOfficeContext(raw('personal'),{workspaceId:'',read:async()=>assert.fail()});assert.equal(noWs.brand.reason,'not-configured');
 // 로그만 못 읽으면 기록 본문은 붙이고 partial + logUnread
 const logFail=await readOfficeContext(raw('personal'),{workspaceId:'ws',read:reader(ok([brandRow('x',{org_scope:'personal'})]),{configured:true,rows:null,error:{}})});
 assert.equal(logFail.brand.status,'partial');assert.equal(logFail.brand.logUnread,true);parseOfficeContext(logFail,'personal');
 // brandId 없으면 brands는 읽지 않는다
 const none=await readOfficeContext(parseOfficeRequest({message:'x',scope:'personal'}),{workspaceId:'ws',read:async()=>assert.fail()});assert.equal('brand' in none,false);
});

test('engine client sends the full brand text but keeps only the summary in the returned result',async()=>{
 const ctx=await readOfficeContext(raw('personal'),{workspaceId:'ws',read:reader(ok([brandRow('x',{org_scope:'personal',current_focus:'집중'})]),ok([]))});
 const request=raw('personal');let sent;
 const result=await callOfficeEngine(request,ctx,{engineUrl:'http://engine',secret:'s',fetcher:async(_u,init)=>{sent=JSON.parse(init.body);
  return new Response(JSON.stringify({status:'generated',version:OFFICE_VERSION,ownerId:'sylveon',mode:'chat',scope:'personal',participants:[],lens:null,simulation:false,answer:'a',nextAction:'b',context:sent.context,model:'m'}),{status:200});}});
 assert.equal(result.status,'generated');assert.equal(sent.request.brandId,BRAND);assert.match(sent.context.brand.text,/집중/);
 assert.equal('text' in result.context.brand,false);assert.equal(result.context.brand.name,'Study.Seagull');parseOfficeContext(result.context,'personal');
});
