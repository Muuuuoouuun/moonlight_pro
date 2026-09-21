import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {requestOffice,officeHistory} from './office-client.js';
import {LEGACY_REDIRECTS,NAV_TREE} from './hub-data.js';
import {SIDEBAR_ANCHORS} from './hub-nav.js';
import {OFFICE_VERSION} from '@com-moon/agent-contracts/office';
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
 assert.equal(LEGACY_REDIRECTS['dashboard/agents/office'].to,'dashboard/agents/chat');
 assert.ok(JSON.stringify(NAV_TREE).includes('dashboard/agents/office-council'));
 assert.ok(JSON.stringify(SIDEBAR_ANCHORS).includes('dashboard/agents/office-council'));
});
test('visible checkboxes use labeled rows and request results keep their original identity',()=>{
 const source=fs.readFileSync(new URL('./pages/office-council.jsx',import.meta.url),'utf8');
 assert.match(source, /CheckboxRow text="현재 범위의 최근 프로젝트 참고"/);
 assert.match(source,/useOfficeSession\(scope\)/);
 assert.match(source,/person\.id === result\.ownerId/);
 assert.match(source,/item\.key === result\.mode/);
 assert.match(source,/단일 AI의 관점 시뮬레이션/);
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
