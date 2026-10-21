import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createMeetingPage, canonicalMeetingJson, boundMeetingResponse, MEETING_CHUNK_BYTES } from '../../../apps/hub/lib/office/meeting-pages.js';
const digest = value => createHash('sha256').update(value).digest('hex');
const id = '10000000-0000-4000-8000-000000000001';
const turnID = n => `abcdef00-0000-4000-8000-${String(n).padStart(12, '0')}`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
export function createNativeMeetingVectors(now = Date.now()) {
 const context = {identity:{workspaceId:turnID(9000),operatorId:'operator'},origin:'https://native.synthetic.test',meetingId:id,scope:'personal',now};
 const detail = {status:'ready',persisted:true,meeting:{meetingId:id,title:'합성 원문',scope:'personal',ownerId:'eevee',reviewers:[],mode:'chat',revision:4,state:'open',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),sourceTask:null},turns:[{id:turnID(1),roundNumber:1,state:'generated',request:{message:'전문 질문',ownerId:'eevee',mode:'chat',scope:'personal',history:[{role:'user',text:'한글😀\\"\n'.repeat(30000)}]},result:{status:'generated',answer:'한글 답변😀',nextAction:'직접 확인',ownerId:'eevee',mode:'chat',scope:'personal',discussion:{original:'전체 보존'},receipt:{original:'영수증🧾'}}}],skillRequests:[{id:turnID(100),receipt:{evidence:'전체 기록',status:'unconfirmed'}}]};
 function pages(body) { const result=[]; let cursor=null; do {const page=createMeetingPage(body,{...context,cursor});if(!page.page)throw new Error(page.error);result.push(page);cursor=page.page.nextCursor;}while(cursor);return result; }
 const good=pages(detail), cases=[];
 function add(name, value, valid, payload=null, readAt=now) {cases.push({name,valid,now:readAt,pages:value.map(encode),payload:payload===null?null:Buffer.from(canonicalMeetingJson(payload)).toString('base64')});}
 add('large-single-turn-full-fields',good,true,detail);
 const unknown=structuredClone(detail);unknown.turns.push({id:turnID(2),roundNumber:4,state:'unknown',request:{message:'확인 중',ownerId:'eevee',scope:'personal',mode:'chat'},result:null});add('unresolved-outside-first-page',pages(unknown),true,unknown);
 const many=structuredClone(detail);many.turns=Array.from({length:1000},(_,n)=>({id:turnID(n+1),roundNumber:n*2+1,state:'error',request:{message:'합성',ownerId:'eevee',mode:'chat'},result:null}));add('1000-turns-with-gaps',pages(many),true,many);
 const mutate=(name,fn)=>{const value=structuredClone(good);fn(value);add(name,value,false);};
 mutate('scope-mismatch',p=>p[0].page.scope='classin');
 mutate('identity-mismatch',p=>p[0].page.meetingId=turnID(50));
 mutate('changed-binding',p=>p[1].page.binding='a'.repeat(64));
 mutate('changed-snapshot',p=>p[1].page.snapshotId='b'.repeat(64));
 mutate('corrupt-chunk',p=>p[0].page.data=p[0].page.data.replace(/^./,'!'));
 mutate('repeated-page',p=>p.splice(1,0,structuredClone(p[0])));
 mutate('missing-page',p=>p.splice(0,1));
 mutate('reordered-page',p=>[p[0],p[1]]=[p[1],p[0]]);
 mutate('false-terminal',p=>p[0].page.nextCursor=null);
 mutate('missing-terminal',p=>delete p.at(-1).page.nextCursor);
 mutate('wrong-unresolved',p=>{p[0].unresolved.unknown=1;p[0].unresolved.total=1;});
 mutate('byte-limit',p=>p[0].padding='x'.repeat(262144));
 mutate('boolean-index',p=>p[0].page.index=false);
 mutate('page-limit',p=>p[0].page.pageCount=2049);
 mutate('payload-limit',p=>p[0].page.totalBytes=256*1024*1024+1);
 mutate('turn-limit',p=>p[0].page.totalTurns=1001);
 add('expired',good,false,null,now+300000);
 add('snapshot-error',[good[0],{status:'error',source:'error',error:'office-meeting-snapshot-changed',historyComplete:false}],false);
 function forged(name,body) {
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(canonicalMeetingJson(body));const payloadHash=digest(bytes),binding=good[0].page.binding,snapshotId=digest(JSON.stringify([1,binding,payloadHash]));const count=Math.ceil(bytes.length/MEETING_CHUNK_BYTES);
  const value=Array.from({length:count},(_,index)=>{const chunk=bytes.subarray(index*MEETING_CHUNK_BYTES,(index+1)*MEETING_CHUNK_BYTES);return {...structuredClone(good[0]),page:{...good[0].page,payloadHash,snapshotId,index,pageCount:count,totalBytes:bytes.length,totalTurns:body.turns?.length??1,offset:index*MEETING_CHUNK_BYTES,chunkBytes:chunk.length,chunkHash:digest(chunk),data:chunk.toString('base64'),nextCursor:index+1<count?`cursor_${index}`:null}};});add(name,value,false);
 }
 const duplicate=structuredClone(detail);duplicate.turns.push({...structuredClone(duplicate.turns[0]),id:duplicate.turns[0].id.toUpperCase(),roundNumber:2});forged('duplicate-logical-id',duplicate);
 const reversed=structuredClone(detail);reversed.turns.push({...structuredClone(reversed.turns[0]),id:turnID(2),roundNumber:1});forged('out-of-order-turns',reversed);
 const unsafe=structuredClone(detail);unsafe.turns[0].roundNumber=9007199254740992;forged('unsafe-round-number',unsafe);
 const wrongBody=structuredClone(detail);wrongBody.meeting.scope='classin';forged('payload-scope-mismatch',wrongBody);
 const booleanRound=structuredClone(detail);booleanRound.turns[0].roundNumber=true;forged('boolean-round',booleanRound);
 const badUUID=structuredClone(detail);badUUID.turns[0].id='{' + badUUID.turns[0].id + '}';forged('noncanonical-turn-id',badUUID);
 forged('invalid-utf8',Buffer.from([0xc3,0x28]));
 const utf16=Buffer.from(canonicalMeetingJson(detail),'utf16le');forged('utf16-payload',utf16);
 const utf32=Buffer.from([...Buffer.from(canonicalMeetingJson(detail))].flatMap(byte=>[byte,0,0,0]));forged('utf32-payload',utf32);
 cases.push({name:'utf16-envelope',valid:false,now,pages:[Buffer.from(JSON.stringify(good[0]),'utf16le').toString('base64')],payload:null});
 cases.push({name:'utf32-envelope',valid:false,now,pages:[Buffer.from([...Buffer.from(JSON.stringify(good[0]))].flatMap(byte=>[byte,0,0,0])).toString('base64')],payload:null});
 const legacy=structuredClone(detail);legacy.turns[0].request.history=[];
 const receipt=boundMeetingResponse({...detail,status:'generated',turn:detail.turns[0]},{negotiated:true,meetingId:id,requestId:turnID(1)});
 return {version:1,id,scope:'personal',requestID:turnID(1),message:detail.turns[0].request.message,revision:3,now,cases,legacy:encode(legacy),receipt:encode(receipt)};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 if (!process.argv[2]) throw new Error('Pass an explicit synthetic fixture output path');
 writeFileSync(process.argv[2],JSON.stringify(createNativeMeetingVectors()));
}
