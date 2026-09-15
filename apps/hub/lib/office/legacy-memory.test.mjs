import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const state={queries:[]};globalThis.__officeMemoryTest=state;
const stubs={
 '@/lib/server-read':`export const eqFilter=v=>'eq.'+v;export const withWorkspaceFilter=x=>[['workspace_id','eq.test'],...x];export async function fetchSupabaseRows(table,options){globalThis.__officeMemoryTest.queries.push({table,...options});return [];}`,
 '@/lib/server-write':`export const resolveDefaultWorkspaceId=()=> 'test';export const resolveSupabaseConfig=()=>({});export async function insertSupabaseRecord(){return {persisted:true}};export async function updateSupabaseRecord(){return {persisted:true}};`
};
registerHooks({resolve(specifier,context,next){if(stubs[specifier])return {url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true};return next(specifier,context);}});
const {getRecentAgentRuns}=await import('../sales-os/agent-runs.js');
test('unqualified legacy memory excludes Office before limiting results',async()=>{
 state.queries=[];await getRecentAgentRuns({limit:5});
 assert.ok(state.queries[0].filters.some(([key,value])=>key==='agent'&&value==='not.like.office.*'));
 assert.equal(state.queries[0].limit,5);
});
test('explicit Guru and brand Council queries keep their exact IDs',async()=>{
 for(const agent of ['guru','council']){state.queries=[];await getRecentAgentRuns({agent});assert.deepEqual(state.queries[0].filters.find(([key])=>key==='agent'),['agent',`eq.${agent}`]);}
});
test('Office reads require an explicit namespace and retain their scope reference',async()=>{
 state.queries=[];await getRecentAgentRuns({agent:'office.flareon',ref:'office:personal'});
 assert.ok(state.queries[0].filters.some(([key,value])=>key==='agent'&&value==='eq.office.flareon'));
 assert.ok(state.queries[0].filters.some(([key,value])=>key==='ref'&&value==='eq.office:personal'));
});
test('legacy roster filters Office activity before its recent-row limit',()=>{
 const route=readFileSync(new URL('../../app/api/hub/agents/route.js',import.meta.url),'utf8');
 assert.match(route,/withWorkspaceFilter\(\[\["agent", "not.like.office\.\*"\]\]\)/);
});
