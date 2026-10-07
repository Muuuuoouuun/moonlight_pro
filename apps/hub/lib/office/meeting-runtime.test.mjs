import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { callOfficeEngine } from './engine-client.js';
import * as runtime from './meeting-runtime.js';
const request={ownerId:'eevee',scope:'personal',mode:'chat',message:'검토',participants:[],history:[],includeProjects:false,lens:null};
const context={source:'provided',scope:'personal',projects:[],note:'입력만 참고'};
const engineOptions={engineUrl:'http://engine.test',secret:'local-test'};
test('transport timeout is unknown only for durable callers and does not retry',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw new DOMException('timed out','TimeoutError');};
 const durable=await callOfficeEngine(request,context,{...engineOptions,fetcher,retries:2,unknownOnTransportFailure:true});
 assert.equal(durable.status,'unknown');assert.equal(calls,1);
 const legacy=await callOfficeEngine(request,context,{...engineOptions,fetcher});assert.equal(legacy.status,'error');
});
test('durable runtime persists the real engine-client timeout as unknown',async()=>{
 const meetingId=randomUUID(),requestId=randomUUID(),identity={workspaceId:randomUUID(),operatorId:'operator'};
 const meeting={meetingId,title:'검토',scope:'personal',ownerId:'eevee',reviewers:[],mode:'chat',revision:1,decisionContext:'',sourceTask:null};
 const detail={status:'ready',persisted:true,meeting,turns:[],skillRequests:[]};let stored;
 const service=runtime.createOfficeMeetingRuntime({engineOptions:{...engineOptions,fetcher:async()=>{throw new TypeError('fetch failed');}},readContext:async()=>context,recordRun:async()=>({persisted:true}),rpc:async(name,params)=>{
  if(name==='office_meeting_get_v1')return detail;
  if(name==='office_meeting_turn_claim_v1')return {...detail,claimed:true,attemptToken:randomUUID(),turn:{id:requestId,request,state:'running'}};
  stored=params.p_result;return {...detail,turn:{id:requestId,request,state:stored.status,result:stored}};
 }});
 const result=await service.turn(meetingId,{requestId,expectedRevision:1,message:'검토'},identity);
 assert.equal(stored.status,'unknown');assert.equal(result.status,'unknown');assert.equal(result.persisted,true);assert.equal(result.turn.state,'unknown');
});
test('a classified provider rejection remains a known failure',async()=>{
 const result=await callOfficeEngine(request,context,{...engineOptions,unknownOnTransportFailure:true,fetcher:async()=>Response.json({status:'error',failure:{phase:'draft',category:'provider'}},{status:502})});
 assert.equal(result.status,'error');assert.equal(result.failure.category,'provider');
});
test('lost response bodies and unclassified gateway failures stay unknown',async()=>{
 for (const fetcher of [async()=>({ok:true,status:200,json:async()=>{throw new TypeError('connection lost');}}),async()=>Response.json({status:'error'},{status:502})]) {
  const result=await callOfficeEngine(request,context,{...engineOptions,unknownOnTransportFailure:true,fetcher});assert.equal(result.status,'unknown');
 }
});
