import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {requestOffice,officeHistory} from './office-client.js';
import {LEGACY_REDIRECTS,NAV_TREE} from './hub-data.js';
import {SIDEBAR_ANCHORS} from './hub-nav.js';
import {OFFICE_VERSION,OFFICE_DISCUSSION_VERSION,parseOfficeDeliberation} from '@com-moon/agent-contracts/office';
test('dedicated browser request uses Office path; legacy IDs never reach the network',async()=>{
 let calls=0;const fetcher=async(url,init)=>{calls++;assert.equal(url,'/api/hub/office/chat');assert.equal(JSON.parse(init.body).ownerId,'eevee');return Response.json({status:'preview',error:'미연결'},{status:202});};
 assert.equal((await requestOffice({message:'hello'},{fetcher})).status,'preview');
 assert.equal((await requestOffice({message:'hello',ownerId:'guru'},{fetcher})).status,'error');assert.equal(calls,1);
});
test('bounded recent history never injects system roles or overflows the contract',()=>{
 const history=officeHistory(Array.from({length:20},()=>({message:'a'.repeat(8000),result:{answer:'b'.repeat(20000)}})));
 assert.equal(history.length,8);assert.ok(JSON.stringify(history).length<20000);assert.ok(history.every(t=>['user','assistant'].includes(t.role)));
});
test('new Office destination preserves legacy office alias and has navigation ownership',()=>{
 assert.equal(LEGACY_REDIRECTS['dashboard/agents/office'].to,'dashboard/agents/office-council');
 assert.ok(JSON.stringify(NAV_TREE).includes('dashboard/agents/office-council'));
 assert.ok(JSON.stringify(SIDEBAR_ANCHORS).includes('dashboard/agents/office-council'));
});
test('visible checkboxes use labeled rows and request results keep their original identity',()=>{
 const source=fs.readFileSync(new URL('./pages/office-council.jsx',import.meta.url),'utf8');
 assert.match(source, /CheckboxRow text="현재 범위의 최근 프로젝트 참고"/);
 assert.match(source,/useOfficeSession\(scope\)/);
 assert.match(source,/person\.id === result\.ownerId/);
 assert.match(source,/item\.key === result\.mode/);
 assert.match(source,/같은 모델의 역할별 개별 검토/);
 assert.match(source,/<OfficeDiscussion result=\{result\} request=\{turn.request\}/);
});

test('council completion requires the requested settings and complete recorded turns',async()=>{
 const participants=['eevee','umbreon'];
 const deliberation=parseOfficeDeliberation({profile:'urgent',influence:{umbreon:3}},participants);
 const request={message:'검토해 주세요',ownerId:'eevee',scope:'personal',mode:'council',participants,deliberation};
 const discussion={version:OFFICE_DISCUSSION_VERSION,settings:deliberation,modelCalls:3,turns:participants.map(ownerId=>({ownerId,round:'position',position:'제공한 조건에 한해 검토합니다.',evidence:['입력한 조건'],objection:'',revisionCondition:'추가 근거가 있으면 재검토합니다.',changed:false,replyTo:[],changeReason:''}))};
 const result={status:'generated',version:OFFICE_VERSION,ownerId:'eevee',scope:'personal',mode:'council',lens:null,simulation:true,participants,answer:'조건을 확인한 뒤 진행합니다.',nextAction:'추가 행동 없음',recommendation:'조건을 확인한 뒤 진행합니다.',evidence:['입력한 조건'],dissent:[],context:{source:'provided',scope:'personal',projects:[],note:'제공한 자료만 참고했습니다.'},discussion};
 const call=body=>requestOffice(request,{fetcher:async(_,init)=>{assert.deepEqual(JSON.parse(init.body).deliberation,deliberation);return Response.json(body);}});
 assert.equal((await call(result)).status,'generated');
 for(const changed of [undefined,{...discussion,settings:{...deliberation,warmth:3}},{...discussion,turns:discussion.turns.slice(1)},{...discussion,modelCalls:7}]) {
  const rejected=await call({...result,discussion:changed});
  assert.equal(rejected.status,'error');assert.equal(rejected.discussion,undefined);
 }
 const failed=await call({...result,status:'error'});
 assert.equal(failed.status,'error');assert.equal(failed.discussion,undefined);
});

test('browser rejects old policy, foreign scope context, and mismatched participant responses',async()=>{
 const request={message:'정리해 주세요',ownerId:'eevee',scope:'personal',mode:'chat'};
 const valid={status:'generated',version:OFFICE_VERSION,ownerId:'eevee',scope:'personal',mode:'chat',lens:null,simulation:false,participants:[],answer:'확인할 항목입니다.',nextAction:'추가 행동 없음',context:{source:'provided',scope:'personal',projects:[],note:'제공한 자료만 참고했습니다.'}};
 const call=body=>requestOffice(request,{fetcher:async()=>Response.json(body)});
 assert.equal((await call(valid)).status,'generated');
 for(const changes of [{version:'older-policy'},{scope:'classin'},{participants:['umbreon']},{context:{...valid.context,scope:'classin'}}]){
  assert.equal((await call({...valid,...changes})).status,'error');
 }
});

test('⌘J and the top-bar sparkle open the Office page instead of the legacy global widget', () => {
  const app = fs.readFileSync(new URL('./hub-app.jsx', import.meta.url), 'utf8');
  const topbar = fs.readFileSync(new URL('./hub-topbar.jsx', import.meta.url), 'utf8');
  assert.match(app, /navigate\('dashboard\/agents\/office-council'\)/);
  assert.doesNotMatch(app, /FloatingMentorWidget/);
  assert.match(topbar, /tooltip="Office \(⌘J\)"/);
});

test('an untraced result carries an explicit certainty badge on both Office surfaces', () => {
  const badge = /sourceCheck === 'untraced' \? <CertaintyBadge state="unknown" label="근거 확인 안 됨" \/> : null/;
  assert.match(fs.readFileSync(new URL('./pages/office-council.jsx', import.meta.url), 'utf8'), badge);
  assert.match(fs.readFileSync(new URL('./office-workflow-panel.jsx', import.meta.url), 'utf8'), badge);
});

test('Office shows a seven-day usage line that honors the read envelope', () => {
  const page = fs.readFileSync(new URL('./pages/office-council.jsx', import.meta.url), 'utf8');
  assert.match(page, /fetch\('\/api\/hub\/office\/usage'/);
  assert.match(page, /usage\.status === 'preview'/);
  assert.match(page, /usage\.status !== 'live'/);
  assert.match(page, /<OfficeUsageLine refreshKey=\{session\.turns\.length\} \/>/);
  assert.match(page, /OFFICE_FAILURE_LABELS/);
});
