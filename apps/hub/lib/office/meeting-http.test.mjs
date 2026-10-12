import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createOfficeMeetingHandler } from './meeting-http.js';
const actor={workspaceId:randomUUID(),operatorId:'operator'};
const request=(method='GET',body)=>new Request('http://localhost:3000/api/hub/office/meetings?scope=personal',{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('every meeting write is guarded before identity/body/service access',async()=>{
 for(const action of ['create','update','turn']) {
  const handler=createOfficeMeetingHandler(action,{guard:()=>Response.json({status:'forbidden'},{status:403}),identity:()=>assert.fail('identity read before guard'),service:{}});
  assert.equal((await handler(request('POST',{}))).status,403);
 }
});
test('meeting read failures are HTTP 200 error envelopes with no-store',async()=>{
 for(const action of ['get','list']) {
  const handler=createOfficeMeetingHandler(action,{identity:()=>actor,service:{[action]:async()=>({status:'not-found',error:'missing'})}});
  const response=await handler(request(),{params:Promise.resolve({id:randomUUID()})});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{status:'error',source:'error',error:'missing'});
 }
});
test('turn write preserves canonical envelope and maps ambiguous/conflict states',async()=>{
 for(const [status,http] of [['generated',200],['running',202],['unknown',202],['preview',202],['conflict',409],['invalid-input',400]]) {
  const id=randomUUID(),body={requestId:randomUUID(),expectedRevision:1,message:'검토'},output={status,meeting:{meetingId:id},turn:{id:body.requestId}};
  const handler=createOfficeMeetingHandler('turn',{guard:()=>null,identity:()=>actor,service:{turn:async(got,input,identity)=>{assert.equal(got,id);assert.deepEqual(input,body);assert.deepEqual(identity,actor);return output;}}});
  const response=await handler(request('POST',body),{params:Promise.resolve({id})});assert.equal(response.status,http);assert.deepEqual(await response.json(),output);
 }
});
test('list reads only explicit lane, limit and opaque cursor',async()=>{
 const handler=createOfficeMeetingHandler('list',{identity:()=>actor,service:{list:async query=>{assert.deepEqual(query,{scope:'personal'});return {status:'ready',meetings:[],nextCursor:null};}}});
 assert.equal((await handler(request())).status,200);
});
