import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {requestOffice,officeHistory} from './office-client.js';
import {LEGACY_REDIRECTS,NAV_TREE} from './hub-data.js';
import {SIDEBAR_ANCHORS} from './hub-nav.js';
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
test('visible checkboxes use labeled rows; scope and owner isolate conversation state',()=>{
 const source=fs.readFileSync(new URL('./pages/office-council.jsx',import.meta.url),'utf8');
 assert.match(source, /CheckboxRow text="현재 범위의 최근 프로젝트 참고"/);
 assert.match(source,/\$\{scope\}:\$\{ownerId\}:\$\{mode\}/);
 assert.match(source,/단일 AI의 관점 시뮬레이션/);
});
