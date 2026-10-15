import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { getJournalSearch } from './journal-search-ledger.js';
const W = '11111111-1111-4111-8111-111111111111', O = '22222222-2222-4222-8222-222222222222';
const id = n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const row = (n = 1, extra = {}) => ({ workspace_id: W, entry_kind: 'note', id: id(n), title: '', excerpt: '원문', occurredAt: '2026-09-13T01:00:00.123456+00:00', updatedAt: '2026-09-13T01:00:00Z', noteMeta: {kind:'note'}, revision: 1, match: null, used: false, ...extra });
const keys = ['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','COM_MOON_DEFAULT_WORKSPACE_ID','DEFAULT_WORKSPACE_ID'];
const env = Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const originalFetch = globalThis.fetch, originalError = console.error;
let state;
beforeEach(()=>{
  keys.forEach(k=>delete process.env[k]);
  process.env.SUPABASE_URL='https://journal-search.example.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'; process.env.COM_MOON_DEFAULT_WORKSPACE_ID=W;
  state={calls:[],data:{status:'live',workspaceId:W,context:null,entries:[]},failure:false};
  console.error=()=>{};
  globalThis.fetch=async (url,options={})=>{
    state.calls.push({url:String(url),options,body:options.body?JSON.parse(options.body):null});
    if(state.failure)return new Response('private credentials',{status:500});
    if (String(url).includes('/journal_entries?')) {
      const ids = new URL(String(url)).searchParams.get('id').slice(4, -1).split(',');
      return Response.json(state.metadata || state.data.entries.filter(entry => ids.includes(entry.id)).map(entry => ({ id: entry.id, workspace_id: W, entry_kind: 'note', note_revision: entry.revision, note_meta: entry.noteMeta })));
    }
    return Response.json(state.data);
  };
});
after(()=>{globalThis.fetch=originalFetch;console.error=originalError;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}});
test('preview and invalid requests perform no unscoped reads',async()=>{
  for(const input of [{kind:'bad'},{cursor:'bad'},{dateFrom:'2026-02-30'}])assert.equal((await getJournalSearch(input)).status,'error');
  assert.equal(state.calls.length,0);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result=await getJournalSearch();assert.equal(result.status,'preview');assert.deepEqual(result.entries,[]);assert.equal(result.nextCursor,null);assert.equal(state.calls.length,0);
});
test('parameterized RPC receives literal query, KST boundaries and only the server workspace',async()=>{
  const result=await getJournalSearch({q:' a%_\\* ',dateFrom:'2026-09-13',dateTo:'2026-09-13',kind:'idea',used:'unused',limit:'3',workspaceId:O});
  assert.equal(result.status,'live');assert.equal(result.workspaceId,W);assert.equal(result.filters.q,'a%_\\*');
  assert.equal(state.calls.length,1);assert.ok(state.calls[0].url.endsWith('/rpc/journal_search_v1'));
  assert.deepEqual(state.calls[0].body,{p_workspace_id:W,p_query:'a%_\\*',p_date_from:'2026-09-12T15:00:00.000Z',p_date_to:'2026-09-13T15:00:00.000Z',p_kind:'idea',p_context_type:'',p_context_id:null,p_used:'unused',p_before:null,p_before_id:null,p_limit:3});
  assert.equal(state.calls[0].options.cache,'no-store');
});
test('cursor preserves microseconds and binds filters, workspace, limit and integrity',async()=>{
  state.data.entries=[4,3,2,1].map(n=>row(n));
  const first=await getJournalSearch({limit:3});assert.equal(first.status,'live');assert.equal(first.entries.length,3);assert.equal(typeof first.nextCursor,'string');
  assert.deepEqual(Object.keys(first.entries[0]).sort(),['id','title','excerpt','occurredAt','updatedAt','noteMeta','revision','match','used'].sort());
  state.data.entries=[row(1)];
  const next=await getJournalSearch({limit:3,cursor:first.nextCursor});assert.equal(next.status,'live');assert.equal(next.nextCursor,null);
  assert.equal(state.calls.filter(call => call.body).at(-1).body.p_before,'2026-09-13T01:00:00.123456+00:00');assert.equal(state.calls.filter(call => call.body).at(-1).body.p_before_id,id(2));
  const count=state.calls.length;
  for(const input of [{q:'changed',limit:3},{limit:40},{limit:3,cursor:first.nextCursor.slice(0,-3)+'xxx'}]) assert.equal((await getJournalSearch({cursor:first.nextCursor,...input})).status,'error');
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID=O;
  assert.equal((await getJournalSearch({limit:3,cursor:first.nextCursor})).status,'error');assert.equal(state.calls.length,count);
});
test('valid context and enhancement match expose compact source data',async()=>{
  state.data.context={type:'project',id:id(100),label:'프로젝트',href:`/dashboard/work/projects?project=${id(100)}`};
  state.data.entries=[row(1,{match:{field:'enhancement',text:'찾은 문장'},used:true})];
  const result=await getJournalSearch({q:'찾은',contextType:'project',contextId:id(100)});
  assert.equal(result.status,'live');assert.deepEqual(result.context,state.data.context);assert.equal(result.entries[0].match.field,'enhancement');
});
test('malformed, foreign, duplicated and oversized results fail closed without private data',async()=>{
  for(const entry of [row(1,{workspace_id:O}),row(1,{entry_kind:'daily_review'}),row(1,{revision:0}),row(1,{excerpt:'x'.repeat(181)}),row(1,{noteMeta:{kind:'bad'}}),row(1,{used:'false'}),row(1,{match:{field:'body',text:'unmatched'}}),row(1,{occurredAt:'today'})]) {
    state.data.entries=[entry];assert.equal((await getJournalSearch()).status,'error');
  }
  state.data.entries=[row(1),row(1)];assert.equal((await getJournalSearch()).status,'error');
  state.data.entries=[row(1),row(2)];assert.equal((await getJournalSearch()).status,'error');
  state.data.entries=[];state.data.context={type:'project',id:id(100),label:'foreign',href:null};assert.equal((await getJournalSearch({contextType:'project',contextId:id(100)})).status,'error');
  for(const data of [null,{status:'error',error:'private credentials'},{status:'live',workspaceId:O,context:null,entries:[]}]) {state.data=data;const result=await getJournalSearch();assert.equal(result.status,'error');assert.equal(JSON.stringify(result).includes('private'),false);}
  state.failure=true;assert.equal((await getJournalSearch()).status,'error');
});


test('tag-only matches pass the summary boundary with an explicit match field', async () => {
  state.data.entries = [row(1, { match: { field: 'tags', text: '고객 이해' } })];
  const result = await getJournalSearch({ q: '고객' });
  assert.equal(result.status, 'live');
  assert.deepEqual(result.entries[0].match, { field: 'tags', text: '고객 이해' });
});


test('personal/company/unclassified search is classified by existing metadata and binds cursor scope', async () => {
  state.data.entries = [row(3, {noteMeta: {kind:'note',scope:'company'}}), row(2, {noteMeta: {kind:'note',scope:'personal'}}), row(1)];
  for (const [noteScope, n] of [['company',3],['personal',2],['unclassified',1]]) {
    const result = await getJournalSearch({noteScope});
    assert.equal(result.status, 'live'); assert.deepEqual(result.entries.map(r=>r.id), [id(n)]);
    const read = state.calls.find(call=>call.url.includes('/journal_entries?'));
    assert.equal(new URL(read.url).searchParams.get('workspace_id'), `eq.${W}`);
  }
  state.metadata = [{id:id(3),workspace_id:O,entry_kind:'note',note_revision:1,note_meta:{kind:'note',scope:'personal'}}];
  assert.equal((await getJournalSearch({noteScope:'personal'})).status,'error');
});

test('sparse scope pages disclose partial and continue without falsely claiming empty', async () => {
  globalThis.fetch = async (url, options={}) => {
    const target = new URL(url);
    if (target.pathname.endsWith('/rpc/journal_search_v1')) {
      const request = JSON.parse(options.body), before = request.p_before_id ? Number(request.p_before_id.slice(-12)) : 100;
      state.calls.push({url:String(url),body:request});
      state.data.entries = Array.from({length:4}, (_,i)=>row(before-i-1,{noteMeta:{kind:'note',scope:'company'}}));
      return Response.json(state.data);
    }
    return Response.json(state.data.entries.map(entry=>({id:entry.id,workspace_id:W,entry_kind:'note',note_revision:1,note_meta:entry.noteMeta})));
  };
  const result = await getJournalSearch({noteScope:'personal',limit:3});
  assert.equal(result.status,'partial'); assert.equal(result.entries.length,0); assert.ok(result.nextCursor);
  assert.equal(state.calls.length,8);
  assert.equal((await getJournalSearch({noteScope:'company',limit:3,cursor:result.nextCursor})).status,'error');
});
