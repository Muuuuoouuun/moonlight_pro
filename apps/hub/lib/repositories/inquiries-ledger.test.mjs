import test from 'node:test';
import assert from 'node:assert/strict';
import { getInquiriesLedger, getInquiryDetail, getInquiryReferences, inquiryFilters } from './inquiries-ledger.js';
const workspaceId='11111111-1111-4111-8111-111111111111';
const configured=()=>({url:'http://test'});
test('repository accepts the actual seeded workspace UUID used by Engine and Postgres', async () => {
 const seeded = '11111111-1111-1111-1111-111111111111';
 const deps = { config: configured, read: async () => ({ rows: [], count: 0 }), count: async () => 0 };
 assert.equal((await getInquiriesLedger({ workspaceId: seeded }, deps)).status, 'live');
 assert.equal((await getInquiryDetail(seeded, { workspaceId: seeded }, deps)).status, 'not-found');
 assert.equal((await getInquiryReferences({ workspaceId: seeded }, deps)).status, 'live');
});
test('active unread count excludes closed and ignored inquiries without changing read state', () => {
 const filters = inquiryFilters({ workspaceId, filter: 'unread' });
 assert.ok(filters.some(([k,v]) => k === 'status' && v === 'in.(new,in_progress,waiting)'));
 assert.ok(filters.some(([k,v]) => k === 'classification' && v === 'neq.ignored'));
});
test('CRM choices are scoped and partial read failure does not become an empty selector', async () => {
 const calls=[];
 const r=await getInquiryReferences({workspaceId,query:'A,B'}, {config:configured,read:async(table,options)=>{calls.push([table,options]);return {rows:table==='operation_cases'?null:[]};}});
 assert.equal(r.status,'error'); assert.equal(calls.length,3);
 assert.ok(calls.every(([,o])=>o.filters.some(([k,v])=>k==='workspace_id'&&v.includes(workspaceId))));
});
test('missing config is preview without querying',async()=>{
 const r=await getInquiriesLedger({workspaceId},{config:()=>null,read:()=>assert.fail()}); assert.equal(r.status,'preview'); assert.equal(r.total,null);
});
test('configured read failures remain error rather than empty or preview',async()=>{
 const r=await getInquiriesLedger({workspaceId},{config:configured,read:async()=>({rows:null,error:{reason:'timeout'}}),count:async()=>null}); assert.equal(r.status,'error'); assert.equal(r.total,null);
});
test('counts use complete filtered set and offset never enters unread filters',async()=>{
 const calls=[];
 const r=await getInquiriesLedger({workspaceId,scope:'personal',page:3,pageSize:2},{config:configured,read:async(t,o)=>{calls.push(o);return {rows:[{id:'i',unread:true}],count:11};},count:async(t,f)=>{assert.equal(f.some(([k])=>k==='offset'),false);return 7;}});
 assert.equal(r.total,11);assert.equal(r.unreadCount,7);assert.equal(r.hasMore,true);assert.ok(calls[0].filters.some(([k,v])=>k==='offset'&&v==='4'));
});
test('unclassified remains explicit and user cannot inject query operators',()=>{
 assert.ok(inquiryFilters({workspaceId,scope:'unclassified'}).some(([k,v])=>k==='org_scope'&&v==='eq.unclassified'));
 assert.throws(()=>inquiryFilters({workspaceId,source:'gmail),or(id.gt.0'}));
});
test('detail scopes parent and events and preserves missing-vs-error',async()=>{
 const calls=[];const r=await getInquiryDetail('22222222-2222-4222-8222-222222222222',{workspaceId},{config:configured,read:async(t,o)=>{calls.push(o);return {rows:[],count:0};}});
 assert.equal(r.status,'not-found');assert.equal(calls.length,1);assert.ok(calls[0].filters.some(([k])=>k==='workspace_id'));
});
test('historical detail is chronological and linked records are resolved by exact tenant-scoped ID', async () => {
 const id = '22222222-2222-2222-2222-222222222222', lead = '33333333-3333-3333-3333-333333333333';
 const calls=[];
 const result = await getInquiryDetail(id, {workspaceId}, {config:configured,read:async(table,options)=>{
  calls.push([table,options]);
  return table==='inquiries'?{rows:[{id,lead_id:lead}]}:table==='inquiry_events'?{rows:[{inbound_seq:0,received_at:'2026-09-12T00:00:00Z'}],count:1}:{rows:[{id:lead,name:'Linked customer'}]};
 }});
 assert.equal(result.status,'live');
 assert.equal(calls.find(([t])=>t==='inquiry_events')[1].order,'received_at.desc,inbound_seq.desc,id.desc');
 const linkQuery=calls.find(([t])=>t==='leads')[1];
 assert.ok(linkQuery.filters.some(([k,v])=>k==='id'&&v.includes(lead)));
 assert.ok(linkQuery.filters.some(([k,v])=>k==='workspace_id'&&v.includes(workspaceId)));
 assert.equal(result.links[0].label,'Linked customer');
 assert.match(result.links[0].href,/leads\?lead=/);
});
