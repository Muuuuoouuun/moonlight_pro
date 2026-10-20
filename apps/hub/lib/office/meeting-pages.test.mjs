import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createMeetingPage, boundMeetingResponse, meetingEnvelopeBytes, MEETING_PAGE_BYTES as B, MEETING_CHUNK_BYTES, MEETING_SNAPSHOT_TTL_MS } from './meeting-pages.js';
import { createOfficeMeetingService, buildMeetingRequest } from './meeting-service.js';
import { createOfficeMeetingHandler } from './meeting-http.js';
import { readOfficeMeeting, sendOfficeMeeting } from '../../components/hub/office-meetings-client.js';
import { createOfficeSessionStore } from '../../components/hub/office-session.js';
const require = createRequire(import.meta.url);
const { createHubClient } = require('../../../desktop/pet/main/pet-hub-client.js');
const { createOfficeApi } = require('../../../desktop/pet/main/pet-office-api.js');
const { createPageAssembly, createMeetingReader, LIMITS } = require('../../../desktop/pet/shared/office-meeting-pages.js');
const id = '10000000-0000-4000-8000-000000000001', scope = 'personal', origin = 'https://office.synthetic.test';
const uuid = n => `30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const identity = {workspaceId:uuid(9000),operatorId:'operator'};
const digest = value => createHash('sha256').update(value).digest('hex');
const now = Date.now(), context = {identity,origin,meetingId:id,scope,now};
globalThis.fetch = async () => assert.fail('External network is prohibited');
function conversation(count=8, { history=false }={}) {
 const detail = { status:'ready',persisted:true,meeting:{meetingId:id,scope,title:'합성 원문 보존',ownerId:'eevee',reviewers:[],mode:'chat',revision:count+1,state:'open',
  decisionContext:'그대로 보존',sourceTask:null,createdAt:'2026-10-19T00:00:00Z',updatedAt:'2026-10-19T00:00:00Z'},turns:[],skillRequests:[] };
 for(let n=1;n<=count;n++) {
  const request = history ? buildMeetingRequest(detail,{requestId:uuid(n),expectedRevision:n,message:'가'.repeat(1000),includeProjects:false})
   : {ownerId:'eevee',scope,mode:'chat',message:'가'.repeat(1000),participants:[],history:[],includeProjects:false};
  detail.turns.push({id:uuid(n),roundNumber:n,state:'generated',request,result:{status:'generated',ownerId:'eevee',scope,mode:'chat',answer:'나'.repeat(10000),nextAction:'확인'},createdAt:'2026-10-19T00:00:00Z',finishedAt:'2026-10-19T00:00:01Z'});
 }
 return detail;
}
function harness(detail,{onRead,clock=()=>Date.now()}={}) {
 const calls=[]; let reads=0;
 const service=createOfficeMeetingService({now:clock,engineConfigured:()=>false,
  rpc:async(name,params)=>{
   assert.equal(params.p_workspace_id,identity.workspaceId);
   if(name==='office_meeting_get_v1') { reads++; onRead?.(reads,detail); return structuredClone(detail); }
   if(name==='office_meeting_turn_claim_v1') {
    const turn=detail.turns.find(turn=>turn.id===params.p_input.requestId);assert.ok(turn,'only an existing original command is replayed');
    assert.deepEqual(params.p_input,{requestId:turn.id,expectedRevision:turn.roundNumber,message:turn.request.message,includeProjects:false});
    return {...structuredClone(detail),claimed:false,turn:structuredClone(turn)};
   }
   assert.fail(`Unexpected RPC ${name}`);
  },generate:()=>assert.fail('Model calls prohibited'),readContext:()=>assert.fail('Context reads prohibited'),recordRun:()=>assert.fail('Run writes prohibited')});
 const handlers={GET:createOfficeMeetingHandler('get',{service,identity:()=>identity}),POST:createOfficeMeetingHandler('turn',{service,identity:()=>identity,guard:()=>null})};
 const fetcher=async(path,init={})=>{
  const method=init.method || 'GET'; const req=new Request(new URL(path,origin),{method,headers:init.headers,...(init.body?{body:init.body}:{})});
  const response=await handlers[method](req,{params:Promise.resolve({id})}); const json=await response.clone().json();
  calls.push({method,path:new URL(path,origin).pathname,query:new URL(path,origin).search,bytes:meetingEnvelopeBytes(json),json,body:init.body?JSON.parse(init.body):null});
  return response;
 };
 return {calls,service,fetcher,api:createOfficeApi(createHubClient({origin,fetch:fetcher}))};
}
async function assembled(detail) {
 const assembly=createPageAssembly({id,scope,digest,now:()=>now}); let cursor=null, result, pages=[];
 do { const page=createMeetingPage(detail,{...context,cursor});pages.push(page);result=await assembly.accept(page);cursor=page.page.nextCursor; }while(cursor);
 return {result,pages,assembly};
}
test('R13 v3 8-turn and canonical-history payloads restore through actual HTTP adapters and both clients',async()=>{
 for(const history of [false,true]) {
  const detail=conversation(8,{history}),h=harness(detail); assert.ok(meetingEnvelopeBytes(detail)>B);
  const desktop=await h.api.detail({id,scope}); const hub=await readOfficeMeeting(id,scope,{fetcher:h.fetcher});
  assert.equal(desktop.historyComplete,true);assert.equal(hub.historyComplete,true);
  assert.deepEqual(desktop.turns.map(t=>t.request),detail.turns.map(t=>t.request));
  assert.deepEqual(desktop.turns.map(t=>t.result),detail.turns.map(t=>t.result));assert.deepEqual(hub.turns,detail.turns);
  assert.ok(h.calls.length>=4);assert.ok(h.calls.every(c=>c.method==='GET' && c.bytes<=B));
 }
});
test('single huge turn, Korean/emoji/JSON escaping and huge receipt are reconstructed without truncation',async()=>{
 const detail=conversation(1); detail.turns[0].result.discussion={original:'한글😀\\"\n'.repeat(40000)};
 detail.skillRequests=[{request:{receipt:{body:'영수증🧾'.repeat(40000)}}}];
 const {result,pages}=await assembled(detail);assert.ok(pages.length>5);
 assert.deepEqual(result.turns,detail.turns);assert.deepEqual(result.skillRequests,detail.skillRequests);
 const h=harness(detail),desktop=await h.api.detail({id,scope});assert.deepEqual(desktop.turns[0].result,detail.turns[0].result);
 assert.deepEqual(desktop.skillRequests,detail.skillRequests);assert.ok(pages.every(p=>meetingEnvelopeBytes(p)<=B));
});
test('negotiated envelopes enforce B-1/B/B+1 while legacy full responses stay compatible',async()=>{
 for(const delta of [-1,0,1]) {
  const detail=conversation(0);detail.padding='한글😀\\"\n';detail.padding+='x'.repeat(B+delta-meetingEnvelopeBytes(detail));assert.equal(meetingEnvelopeBytes(detail),B+delta);
  const h=harness(detail); const response=await h.fetcher(`/api/hub/office/meetings/${id}`);const body=await response.json();
  assert.equal(response.status,200);assert.equal(meetingEnvelopeBytes(body),B+delta);assert.equal(body.status,'ready');
  const bounded=boundMeetingResponse(detail,{read:true,negotiated:true});assert.ok(meetingEnvelopeBytes(bounded)<=B);
  assert.equal(bounded.status,delta<=0?'ready':'error');if(delta>0) assert.equal(bounded.error,'office-meeting-paging-required');
 }
 const error={status:'not-found',padding:''};error.padding='x'.repeat(B-meetingEnvelopeBytes(error));
 const handler=createOfficeMeetingHandler('get',{identity:()=>identity,service:{getPage:async()=>error}});
 const response=await handler(new Request(`${origin}/api/hub/office/meetings/${id}?readVersion=1&scope=personal`),{params:{id}});assert.ok(meetingEnvelopeBytes(await response.json())<=B);
});
test('finish, deadline projection and receipt changes invalidate continuation even when revision is unchanged',()=>{
 for(const change of [d=>{d.turns.at(-1).state='generated';d.turns.at(-1).result.answer='늦은 완료';},d=>{d.turns.at(-1).state='unknown';},d=>{d.skillRequests=[{receipt:{body:'바뀐 영수증'}}];}]) {
  const d=conversation();d.turns.at(-1).state='running';const page=createMeetingPage(d,context);const revision=d.meeting.revision;
  change(d);assert.equal(d.meeting.revision,revision);
  assert.equal(createMeetingPage(d,{...context,cursor:page.page.nextCursor}).error,'office-meeting-snapshot-changed');
 }
});
test('cursor binds owner, origin, meeting, scope and expiry; no auth is granted by a cursor',()=>{
 const d=conversation(),page=createMeetingPage(d,context),cursor=page.page.nextCursor;
 for(const override of [{identity:{...identity,workspaceId:uuid(9001)}},{origin:'https://another.synthetic.test'}]) assert.equal(createMeetingPage(d,{...context,...override,cursor}).error,'office-meeting-page-scope-mismatch');
 assert.equal(createMeetingPage(d,{...context,meetingId:uuid(9002),cursor}).error,'office-meeting-page-identity-mismatch');
 assert.equal(createMeetingPage(d,{...context,scope:'classin',cursor}).error,'office-meeting-page-identity-mismatch');
 assert.equal(createMeetingPage(d,{...context,cursor,now:now+MEETING_SNAPSHOT_TTL_MS}).error,'office-meeting-snapshot-expired');
 for(const bad of ['x'.repeat(2049),'invalid+','e30']) assert.equal(createMeetingPage(d,{...context,cursor:bad}).error,'office-meeting-page-cursor-invalid');
});
test('first page reports unknown outside visible bytes and consumers never accept it as full history',async()=>{
 const d=conversation();d.turns.at(-1).state='unknown';const page=createMeetingPage(d,context);
 assert.deepEqual(page.unresolved,{running:0,unknown:1,total:1,observedAt:new Date(now).toISOString()});
 const a=createPageAssembly({id,scope,digest,now:()=>now});assert.equal(await a.accept(page),null);assert.equal(a.progress.complete,false);assert.equal(a.progress.unresolved.total,1);
 const h=harness(d),restored=await h.api.detail({id,scope});assert.equal(restored.unresolved.total,1);assert.equal(restored.turns.at(-1).state,'unknown');
});
test('duplicate, reordered, missing, corrupt and false terminal pages fail without advancing verified progress',async()=>{
 const d=conversation(16),first=createMeetingPage(d,context),second=createMeetingPage(d,{...context,cursor:first.page.nextCursor});
 for(const mutate of [p=>p.page.index++,p=>p.page.offset++,p=>p.page.nextCursor=null,p=>p.page.totalBytes++,p=>p.page.data='AAAA',p=>p.page.chunkHash='0'.repeat(64),p=>p.page.binding='0'.repeat(64),p=>p.unresolved.total++,p=>p.page.totalTurns=1001]) {
  const a=createPageAssembly({id,scope,digest,now:()=>now});await a.accept(first);const bad=structuredClone(second);mutate(bad);
  await assert.rejects(a.accept(bad));assert.equal(a.progress.verifiedPages,1);
 }
 const a=createPageAssembly({id,scope,digest,now:()=>now});await a.accept(first);await assert.rejects(a.accept(first));assert.equal(a.progress.verifiedPages,1);
});
test('last-page transport failure preserves exact cursor and manual GET resumes once without duplicate rows',async()=>{
 const d=conversation(),h=harness(d);let fail=true;const cursors=[];
 const restore=createMeetingReader({digest,read:async(path)=>{cursors.push(new URL(path,origin).searchParams.get('cursor'));if(cursors.at(-1)&&fail){fail=false;throw new Error('offline');}return (await h.fetcher(path)).json();}});
 await assert.rejects(restore(id,scope),error=>error.progress.verifiedPages===1);
 const result=await restore(id,scope);assert.equal(result.turns.length,8);assert.equal(cursors[1],cursors[2]);assert.equal(new Set(result.turns.map(t=>t.id)).size,8);
 assert.ok(h.calls.every(c=>c.method==='GET'));
});
test('concurrent same-target reads share one chain; changed snapshot restarts only on the next explicit read',async()=>{
 const d=conversation(),h=harness(d);let mutate=true;
 const restore=createMeetingReader({digest,read:async(path)=>{if(new URL(path,origin).searchParams.has('cursor')&&mutate){mutate=false;d.skillRequests=[{receipt:'changed'}];}const data=await (await h.fetcher(path)).json();if(data.status==='error')throw Object.assign(new Error(data.error),{error:data.error});return data;}});
 const results=await Promise.allSettled([restore(id,scope),restore(id,scope)]);assert.ok(results.every(r=>r.status==='rejected'));assert.equal(h.calls.length,2);
 const result=await restore(id,scope);assert.deepEqual(result.skillRequests,d.skillRequests);assert.equal(h.calls.length,4);
});
test('finite total byte/page/turn limits are distinct, with 1000 turns supported and 1001 explicit',async()=>{
 const d=conversation(0);for(let n=1;n<=1000;n++)d.turns.push({id:uuid(n),roundNumber:n,state:'error',request:{message:'검증',ownerId:'eevee',mode:'chat'}});
 assert.equal((await assembled(d)).result.turns.length,1000);
 d.turns.push({...d.turns[0],id:uuid(1001),roundNumber:1001});assert.equal(createMeetingPage(d,context).error,'office-meeting-turn-limit');
 const large=conversation();assert.equal(createMeetingPage(large,context,{maxBytes:100}).error,'office-meeting-restoration-limit');assert.equal(createMeetingPage(large,context,{maxPages:1}).error,'office-meeting-restoration-limit');
 const length=Buffer.byteLength(JSON.stringify(conversation(0)));assert.equal(createMeetingPage(conversation(0),context,{maxBytes:length}).status,'ready');
 const restore=createMeetingReader({digest,limits:{totalBytes:MEETING_CHUNK_BYTES-1},read:async()=>createMeetingPage(large,context)});await assert.rejects(restore(id,scope),/cache-limit/);
});
test('request cancellation and entire restoration deadline terminate even a stalled synthetic reader',async()=>{
 const restore=createMeetingReader({digest,limits:{restoreMs:15},read:async()=>new Promise(()=>{})});await assert.rejects(restore(id,scope),/timeout/);
 const controller=new AbortController();controller.abort();await assert.rejects(restore(id,scope,{signal:controller.signal}),/timeout/);
});
test('oversized negotiated POST returns bounded receipt and GET restores original result with zero regeneration',async()=>{
 const d=conversation(7),last=d.turns.at(-1),h=harness(d);assert.ok(meetingEnvelopeBytes({...d,status:'generated',turn:last})>B);assert.ok(meetingEnvelopeBytes(d)<B);
 const command={id,scope,requestId:last.id,revision:last.roundNumber,message:last.request.message};
 const restored=await h.api.send(command);assert.equal(restored.turns.at(-1).answer,last.result.answer);
 assert.equal(h.calls[0].json.receiptVersion,1);assert.equal(h.calls[0].json.requestId,last.id);
 assert.equal(h.calls.filter(c=>c.method==='POST').length,1);assert.ok(h.calls.slice(1).every(c=>c.method==='GET'&&c.bytes<=B));assert.ok(h.calls[0].bytes<=B);
 const legacy=boundMeetingResponse({...d,status:'generated',turn:last},{read:false,meetingId:id,requestId:last.id});assert.equal(legacy.turn,last);
});
test('Hub negotiated POST receipt recovers through GET and preserves a concurrently edited draft',async()=>{
 const d=conversation(7),last=d.turns.at(-1),h=harness(d),store=createOfficeSessionStore();
 store.restoreMeeting(scope,{...d,turns:d.turns.slice(0,-1),meeting:{...d.meeting,revision:last.roundNumber}});store.update(scope,{draft:last.request.message});
 const fetcher=async(path,init)=>{if(init.method==='POST')store.update(scope,{draft:'사용자가 새로 수정한 초안'});return h.fetcher(path,init);};
 // The production browser includes mode; this synthetic stored command omits
 // it, so use a receipt-only handler for the one explicit POST in this case.
 const recoveryFetch=async(path,init)=>init.method==='POST' ? (store.update(scope,{draft:'사용자가 새로 수정한 초안'}), Response.json(boundMeetingResponse({...d,status:'generated',turn:last},{negotiated:true,meetingId:id,requestId:last.id}))) : fetcher(path,init);
 const result=await sendOfficeMeeting(store,scope,{requestId:last.id,fetcher:recoveryFetch});assert.equal(result.status,'generated');assert.equal(store.get(scope).draft,'사용자가 새로 수정한 초안');assert.ok(h.calls.every(c=>c.method==='GET'));
});
test('portable shared validator has no runtime imports and canonical object-key reorder does not invalidate',async()=>{
 const source=readFileSync(new URL('../../../desktop/pet/shared/office-meeting-pages.js',import.meta.url),'utf8');assert.doesNotMatch(source,/require\s*\(|\bimport\s/);
 const d=conversation(),page=createMeetingPage(d,context),reordered={skillRequests:d.skillRequests,turns:d.turns,meeting:d.meeting,persisted:true,status:'ready'};
 assert.equal(createMeetingPage(reordered,{...context,cursor:page.page.nextCursor}).status,'ready');
 assert.equal(LIMITS.pageBytes,B);assert.equal(LIMITS.chunkBytes,MEETING_CHUNK_BYTES);
});

test('invalidated partial cache is released before a fresh large read, preserving progress metadata',async()=>{
 const d=conversation(),size=meetingEnvelopeBytes(d);let calls=0,changed=false;
 const restore=createMeetingReader({digest,limits:{totalBytes:size+100},read:async path=>{
  const query=new URL(path,origin).searchParams,cursor=query.get('cursor');calls++;
  if(cursor&&!changed){changed=true;d.meeting.title='변경된 회의';throw Object.assign(new Error('office-meeting-snapshot-changed'),{error:'office-meeting-snapshot-changed'});}
  return createMeetingPage(d,{...context,cursor});
 }});
 await assert.rejects(restore(id,scope),error=>error.progress.verifiedPages===1 && error.progress.resumeAvailable===false);
 assert.equal((await restore(id,scope)).turns.length,8);assert.equal(calls,4);
});
test('three valid partial chains are bounded; expired chains release capacity for another meeting',async()=>{
 let clock=now;const attempts=new Map();
 const restore=createMeetingReader({digest,now:()=>clock,read:async path=>{
  const target=new URL(path,origin).pathname.split('/').at(-1),d=conversation();d.meeting.meetingId=target;
  const cursor=new URL(path,origin).searchParams.get('cursor');attempts.set(target,(attempts.get(target)||0)+1);
  if(cursor) throw new Error('offline');return createMeetingPage(d,{...context,meetingId:target,now:clock});
 }});
 for(const target of [uuid(101),uuid(102),uuid(103)]) await assert.rejects(restore(target,scope),/offline/);
 await assert.rejects(restore(uuid(104),scope),/cache-limit/);
 clock+=MEETING_SNAPSHOT_TTL_MS;
 await assert.rejects(restore(uuid(104),scope),/offline/);assert.equal(attempts.get(uuid(104)),2);
});
test('three manual failures exhaust a cursor and the next explicit read starts a fresh GET',async()=>{
 const d=conversation();let fail=true;const cursors=[];
 const restore=createMeetingReader({digest,read:async path=>{const cursor=new URL(path,origin).searchParams.get('cursor');cursors.push(cursor);if(cursor&&fail)throw new Error('offline');return createMeetingPage(d,{...context,cursor});}});
 for(let n=0;n<3;n++) await assert.rejects(restore(id,scope),error=>error.progress.verifiedPages===1 && error.progress.resumeAvailable===(n<2));
 fail=false;assert.equal((await restore(id,scope)).turns.length,8);assert.equal(cursors[4],null);
});
test('duplicate canonical UUIDs and non-increasing rounds fail through HTTP for both consumers, while gaps remain valid',async()=>{
 for(const mutate of [d=>d.turns[1].id=d.turns[0].id.toUpperCase(),d=>d.turns[1].roundNumber=d.turns[0].roundNumber,d=>d.turns.reverse()]) {
  const d=conversation();mutate(d);const h=harness(d);await assert.rejects(h.api.detail({id,scope}));assert.equal((await readOfficeMeeting(id,scope,{fetcher:h.fetcher})).status,'error');
 }
 const d=conversation();d.turns.forEach(t=>t.roundNumber*=2);assert.deepEqual((await assembled(d)).result.turns,d.turns);
});
test('oversized POST receipt with failed GET preserves original command and sends no second POST',async()=>{
 const d=conversation(7),last=d.turns.at(-1),h=harness(d,{onRead:n=>{if(n>1)throw new Error('synthetic read failure');}});
 const command={id,scope,requestId:last.id,revision:last.roundNumber,message:last.request.message},before=structuredClone(command);
 await assert.rejects(h.api.send(command));assert.deepEqual(command,before);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
 assert.equal(h.calls[0].body.expectedRevision,last.roundNumber);assert.equal(h.calls[0].json.requestId,last.id);assert.equal(h.calls.at(-1).method,'GET');
});
test('restoration does not accept a full-response downgrade after partial progress',async()=>{
 const d=conversation();let calls=0;
 const restore=createMeetingReader({digest,read:async()=>++calls===1?createMeetingPage(d,context):conversation(0)});
 await assert.rejects(restore(id,scope),error=>error.progress.verifiedPages===1);assert.equal(calls,2);
});

test('the receiver measures the entire page envelope at B-1/B/B+1, including non-body metadata',async()=>{
 const first=createMeetingPage(conversation(),context);
 for(const delta of [-1,0,1]) {
  const page=structuredClone(first);page.padding='한글😀\\"';page.padding+='x'.repeat(B+delta-meetingEnvelopeBytes(page));
  assert.equal(meetingEnvelopeBytes(page),B+delta);const a=createPageAssembly({id,scope,digest,now:()=>now});
  if(delta>0) await assert.rejects(a.accept(page));else assert.equal(await a.accept(page),null);
 }
});
test('a self-consistent payload digest cannot bypass duplicate-ID and semantic round ordering checks',async()=>{
 for(const mutate of [d=>d.turns[1].id=d.turns[0].id,d=>d.turns[1].roundNumber=1]) {
  const d=conversation(2),page=createMeetingPage(d,context);mutate(d);
  const body=Buffer.from(JSON.stringify(d)),payloadHash=digest(body);assert.ok(body.length<MEETING_CHUNK_BYTES);
  Object.assign(page.page,{payloadHash,snapshotId:digest(JSON.stringify([1,page.page.binding,payloadHash])),totalBytes:body.length,chunkBytes:body.length,chunkHash:payloadHash,data:body.toString('base64')});
  const a=createPageAssembly({id,scope,digest,now:()=>now});await assert.rejects(a.accept(page));
 }
});
test('a discarded Desktop connection stops before requesting the next page',async()=>{
 const d=conversation(),h=harness(d);let current=true;
 const api=createOfficeApi(createHubClient({origin,isCurrent:()=>current,fetch:async(path,init)=>{const response=await h.fetcher(path,init);current=false;return response;}}));
 await assert.rejects(api.detail({id,scope}),error=>error.error==='stale-origin');assert.equal(h.calls.length,1);
});
test('a lost or old oversized POST response is recovered by a separate GET with no resend',async()=>{
 const d=conversation(8),last=d.turns.at(-1),h=harness(d);let posts=0;
 const api=createOfficeApi(createHubClient({origin,fetch:async(path,init)=>{
  if(init.method==='POST'){posts++;return Response.json({...d,status:'generated',turn:last});}
  return h.fetcher(path,init);
 }}));
 const command={id,scope,requestId:last.id,revision:last.roundNumber,message:last.request.message},before=structuredClone(command);
 await assert.rejects(api.send(command));assert.deepEqual(command,before);
 assert.equal((await api.detail({id,scope})).turns.at(-1).id,last.id);assert.equal(posts,1);assert.ok(h.calls.every(c=>c.method==='GET'));
});

test('an already-aborted read releases its pending promise so a later explicit read can complete',async()=>{
 const detail=conversation(),h=harness(detail);let reads=0;
 const restore=createMeetingReader({digest,read:async path=>{reads++;return (await h.fetcher(path)).json();}});
 await assert.rejects(restore(id,scope,{signal:AbortSignal.abort()}),/timeout/);
 assert.equal(reads,0,'an already-cancelled attempt must not start a request');
 const [first,shared]=await Promise.all([restore(id,scope),restore(id,scope)]);
 assert.deepEqual(first.turns,detail.turns);assert.deepEqual(shared.turns,detail.turns);
 assert.equal(reads,first.restoration.pageCount,'the replacement calls share exactly one finite chain');
});
