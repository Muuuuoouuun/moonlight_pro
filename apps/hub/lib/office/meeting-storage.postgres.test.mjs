import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOfficeMeetingService } from './meeting-service.js';
import { createOfficeMeetingHandler } from './meeting-http.js';
import { createSkillRequestService } from '../skill-requests.js';
import { createOfficeSessionStore } from '../../components/hub/office-session.js';
import { sendOfficeMeeting, readOfficeMeeting, listOfficeMeetings } from '../../components/hub/office-meetings-client.js';
const enabled = process.env.OFFICE_MEETING_POSTGRES_TEST === '1' && process.getuid?.() !== 0 && ['initdb','pg_ctl','psql'].every(n => spawnSync(n,['--version'],{stdio:'ignore'}).status===0);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
test('durable meetings preserve rounds, isolation, concurrency and skill provenance in PostgreSQL', {skip:!enabled}, async t => {
 const directory=mkdtempSync(join(tmpdir(),'moon-meeting-pg-')), data=join(directory,'data'), port=String(56000+Math.floor(Math.random()*3000));
 const env={...process.env,LC_ALL:'C'}, args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',directory,'-p',port,'-U','meeting_test','-d','postgres'];
 const run=(name,argv,input)=>{const r=spawnSync(name,argv,{input,encoding:'utf8',env,timeout:30000});assert.equal(r.status,0,r.stderr||r.error||r.stdout);return r.stdout.trim();};
 const sql=input=>run('psql',args,input);
 const asyncSql=input=>new Promise((resolve,reject)=>{const p=spawn('psql',args,{env}),out=[],err=[];p.stdout.on('data',x=>out.push(x));p.stderr.on('data',x=>err.push(x));p.on('close',code=>code?reject(new Error(Buffer.concat(err).toString())):resolve(Buffer.concat(out).toString().trim()));p.stdin.end(input);});
 const workspace=randomUUID(), other=randomUUID(), taskId=randomUUID();
 const stmt=(name,values)=>`set role service_role; select public.${name}(${values.join(',')});`;
 const call=(name,values)=>JSON.parse(sql(stmt(name,values)));
 const base=(id,w=workspace)=>[quote(w),quote('operator'),quote(id)];
 const create=(body,w=workspace)=>call('office_meeting_create_v1',[quote(w),quote('operator'),json(body)]);
 const get=(id,w=workspace)=>call('office_meeting_get_v1',base(id,w));
 const input=()=>({meetingId:randomUUID(),title:'검토할 안건',scope:'personal',ownerId:'eevee',reviewers:[],mode:'chat',decisionContext:'정해 둔 범위',sourceTaskId:taskId});
 const turnInput=()=>({requestId:randomUUID(),expectedRevision:1,message:'검토해 주세요'});
 const canonical=()=>({ownerId:'eevee',scope:'personal',mode:'chat',message:'검토해 주세요',participants:[],history:[],includeProjects:false,lens:null});
 const claim=(id,body)=>call('office_meeting_turn_claim_v1',[...base(id),json(body),json(canonical())]);
 const finish=(id,turn,token,result={status:'generated',answer:'검토 결과',nextAction:'확인'})=>call('office_meeting_turn_finish_v1',[...base(id),quote(turn),quote(token),json(result)]);
 let running=false;
 try {
  run('initdb',['-D',data,'-U','meeting_test','-A','trust','--no-locale','--encoding=UTF8']);run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-F -k ${directory} -p ${port} -c listen_addresses=''`,'-w','start']);running=true;
  sql(`create role anon;create role authenticated;create role service_role bypassrls; create table workspaces(id uuid primary key);
   create table tasks(id uuid primary key,workspace_id uuid references workspaces(id),scope text,title text,description text,next_action text,status text,updated_at timestamptz default now());
   create table agent_command_receipts(workspace_id uuid,actor_id text,command_id uuid,action text,target_id uuid);
   create function operating_goal_entity_scope_v1(uuid,text,uuid) returns text language sql as $$select case scope when 'classin' then 'company' else scope end from tasks where workspace_id=$1 and id=$3$$;
   insert into workspaces values(${quote(workspace)}),(${quote(other)});insert into tasks(id,workspace_id,scope,title,description,next_action,status) values(${quote(taskId)},${quote(workspace)},'personal','원래 할 일','상세 설명','다음 행동','todo');`);
  sql(readFileSync(new URL('../../../../supabase/migrations/20260925_0047_local_skill_requests.sql',import.meta.url),'utf8'));
  const migration=readFileSync(new URL('../../../../supabase/migrations/20261007_0069_office_meetings.sql',import.meta.url),'utf8');sql(migration);sql(migration);
  await t.test('create validates lane/owner, idempotency and immutable server source',()=>{
   const body=input(), saved=create(body);assert.equal(saved.status,'ready');assert.equal(saved.meeting.sourceTask.title,'원래 할 일');assert.equal(saved.meeting.sourceTask.workspace,'brand');assert.ok(saved.meeting.sourceTask.importedAt);assert.equal(create(body).replayed,true);
   assert.equal(create({...body,title:'바꿈'}).status,'conflict');assert.equal(create({...input(),scope:'classin'}).status,'invalid-input');assert.equal(create({...input(),scope:'all'}).status,'invalid-input');assert.equal(create({...input(),sourceTask:{title:'위조'}}).status,'invalid-input');assert.equal(get(body.meetingId,other).status,'not-found');
  });
  await t.test('parallel requests reserve once, never replace terminal result and recover by stable id',async()=>{
   const body=input();create(body);const r=turnInput();const source=stmt('office_meeting_turn_claim_v1',[...base(body.meetingId),json(r),json(canonical())]);
   const rows=await Promise.all(Array.from({length:5},()=>asyncSql(source).then(JSON.parse)));assert.equal(rows.filter(x=>x.claimed).length,1);
   const first=rows.find(x=>x.claimed);assert.equal(first.meeting.revision,2);assert.equal(claim(body.meetingId,{...r,message:'다름'}).status,'conflict');assert.equal(claim(body.meetingId,{...turnInput(),expectedRevision:2}).claimed,false);
   assert.equal(finish(body.meetingId,r.requestId,randomUUID()).status,'conflict');assert.equal(finish(body.meetingId,r.requestId,first.attemptToken).turn.state,'generated');
   assert.equal(finish(body.meetingId,r.requestId,first.attemptToken).replayed,true);assert.equal(finish(body.meetingId,r.requestId,first.attemptToken,{status:'generated',answer:'덮기'}).status,'conflict');
   assert.equal(get(body.meetingId).meeting.turnCount,1);assert.equal(get(body.meetingId).turns[0].id,r.requestId);assert.equal(get(body.meetingId).turns[0].result.answer,'검토 결과');assert.equal(get(body.meetingId).attemptToken,undefined);
  });
  await t.test('expired unresolved turn blocks a fresh request without claiming generation',()=>{
   const body=input();create(body);const r=turnInput(), first=claim(body.meetingId,r);
   sql(`update office_meeting_turns set deadline_at=now()-interval '1 second' where id=${quote(r.requestId)}`);
   const blocked=claim(body.meetingId,{...turnInput(),expectedRevision:2});assert.equal(blocked.claimed,false);assert.equal(blocked.turn.state,'unknown');assert.equal(blocked.turn.id,r.requestId);
   assert.equal(get(body.meetingId).turns.length,1);assert.equal(finish(body.meetingId,r.requestId,first.attemptToken).turn.state,'generated');
  });
  await t.test('stale edits fail and closed meetings remain discoverable and readable',()=>{
   const body=input();create(body);const update=patch=>call('office_meeting_update_v1',[...base(body.meetingId),json(patch)]);
   assert.equal(update({expectedRevision:1,decisionContext:'확정 문맥'}).meeting.revision,2);assert.equal(update({expectedRevision:1,title:'과거'}).status,'conflict');assert.equal(update({expectedRevision:2,state:'closed'}).status,'ready');
   const list=call('office_meeting_list_v1',[quote(workspace),quote('operator'),quote('personal'),'20','null']);assert.equal(list.meetings.find(m=>m.meetingId===body.meetingId)?.state,'closed');assert.equal(get(body.meetingId).meeting.decisionContext,'확정 문맥');
  });
  await t.test('skills accept legacy or same-meeting generated turn only and receipt remains live',()=>{
   const body=input();create(body);const r=turnInput(), claimed=claim(body.meetingId,r);finish(body.meetingId,r.requestId,claimed.attemptToken);
   const request={requestId:randomUUID(),taskId,scope:'personal',instruction:'범위 안 정리',expectedEvidence:'경로'};
   const skill=x=>call('local_skill_request_create_v1',[quote(workspace),quote('operator'),json(x)]);
   assert.equal(skill(request).status,'ready');assert.equal(skill({...request,requestId:randomUUID(),meetingId:body.meetingId}).status,'invalid-input');
   assert.equal(skill({...request,requestId:randomUUID(),meetingId:body.meetingId,officeTurnId:randomUUID()}).status,'invalid-input');
   const linked=skill({...request,requestId:randomUUID(),meetingId:body.meetingId,officeTurnId:r.requestId});assert.equal(linked.status,'ready');assert.equal(linked.request.officeTurnId,r.requestId);
   assert.equal(get(body.meetingId).skillRequests.length,1);assert.equal(get(body.meetingId).skillRequests[0].meetingId,body.meetingId);
  });
  await t.test('Hub client, HTTP, service and real SQL agree on restored rounds and linked execution receipts',async()=>{
   const valueSql=value=>value===null?'null':typeof value==='object'?json(value):typeof value==='number'?String(value):quote(value);
   const rpc=async(name,params)=>call(name,Object.values(params).map(valueSql));
   const generatedRequests=[];
   const service=createOfficeMeetingService({rpc,readContext:async()=>({source:'provided'}),generate:async request=>{
    generatedRequests.push(request);
    return {status:'generated',scope:request.scope,ownerId:request.ownerId,mode:request.mode,answer:'저장된 판단',nextAction:'원문 확인'};
   }});
   const identity=()=>({workspaceId:workspace,operatorId:'operator'});
   const fetcher=async(path,init={})=>{
    const url=new URL(path,'http://localhost'),segments=url.pathname.split('/');
    const id=segments[5],action=segments[6]==='turns'?'turn':id?'get':init.method==='POST'?'create':'list';
    return createOfficeMeetingHandler(action,{service,identity,guard:()=>null})(new Request(url,init),{params:{id}});
   };
   const store=createOfficeSessionStore(), id=randomUUID(), round=randomUUID();
   store.update('personal',{draft:'원문을 보고 검토해 주세요',decisionContext:'합의된 조건을 지킨다',agenda:{title:'실행 연결 검토',taskId,taskWorkspace:'brand'}});
   const sent=await sendOfficeMeeting(store,'personal',{requestId:round,meetingId:id,fetcher});
   assert.equal(sent.status,'generated');assert.equal(store.get('personal').turns[0].id,round);assert.equal(store.get('personal').draft,'');
   assert.ok(generatedRequests[0].history.some(item=>item.text.includes('합의된 조건을 지킨다')));
   assert.ok(generatedRequests[0].history.some(item=>item.text.includes('원래 할 일')));
   const restored=createOfficeSessionStore();
   const detail=await readOfficeMeeting(id,'personal',{fetcher});assert.equal(detail.status,'ready');restored.restoreMeeting('personal',detail);
   restored.update('personal',{draft:'앞선 판단을 이어서 검토'});
   assert.equal((await sendOfficeMeeting(restored,'personal',{requestId:randomUUID(),fetcher})).status,'generated');
   assert.equal(generatedRequests.length,2);assert.ok(generatedRequests[1].history.some(item=>item.role==='assistant'&&item.text.includes('저장된 판단')));
   assert.equal((await listOfficeMeetings('personal',{fetcher})).meetings.find(item=>item.meetingId===id).turnCount,2);
   const skills=createSkillRequestService({workspace:()=>workspace,rpc:async(name,params)=>({ok:true,data:await rpc(name,params)})});
   const requestId=randomUUID();
   assert.equal((await skills.create({requestId,taskId,scope:'personal',instruction:'지정된 범위 확인',expectedEvidence:'검토 결과',meetingId:id,officeTurnId:round})).data.status,'ready');
   assert.equal((await skills.record(requestId,{state:'completed',summary:'확인 결과를 기록함',evidence:[{kind:'note',value:'확인한 결과'}]},{actorId:'codex'})).data.status,'ready');
   const final=await readOfficeMeeting(id,'personal',{fetcher});restored.restoreMeeting('personal',final);
   const receipt=restored.get('personal').skillRequests[0];assert.equal(receipt.officeTurnId,round);assert.equal(receipt.state,'completed');assert.equal(receipt.receiptActorId,'codex');
   assert.equal(receipt.receipt.commandReceiptVerified,false,'execution receipt alone never claims task completion');
  });
  await t.test('retained source survives task deletion and privileges restrict all callers',()=>{
   const body=input();create(body);sql(`delete from tasks where id=${quote(taskId)}`);assert.equal(get(body.meetingId).meeting.sourceTask.title,'원래 할 일');
   for(const table of ['office_meetings','office_meeting_turns'])assert.equal(sql(`select has_table_privilege('service_role','${table}','INSERT,UPDATE,DELETE,TRUNCATE')`),'f');
   assert.equal(sql("select has_function_privilege('anon','office_meeting_get_v1(uuid,text,uuid)','EXECUTE') or has_function_privilege('authenticated','office_meeting_create_v1(uuid,text,jsonb)','EXECUTE')"),'f');
  });
 } finally {if(running)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(directory,{recursive:true,force:true});}
});
