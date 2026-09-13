import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as client from './codex-jobs-client.js';
const {requestCodexJobs}=client;
test('interrupted draft and apply jobs require reconciliation, including cancellation before thread creation',()=>{
 assert.equal(typeof client.requiresCodexReconciliation,'function');
 for(const mode of ['read','draft','apply'])for(const state of ['succeeded','failed','cancelled','needs_attention'])assert.equal(client.requiresCodexReconciliation({mode,state,threadId:null}),mode!=='read'&&state!=='succeeded');
 assert.equal(client.validCodexReconciliationNote('확인'),false);
 assert.equal(client.validCodexReconciliationNote('변경된 파일과 중단 상태를 모두 확인했습니다.'),true);
 assert.equal(client.validCodexReconciliationNote('한'.repeat(700)),false);
});
test('a HTTP 200 error remains an error and a preview is not treated as a saved job',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async()=>Response.json({status:'error',error:'offline'});
 await assert.rejects(()=>requestCodexJobs('list'),/offline/);
 globalThis.fetch=async()=>Response.json({status:'preview',persisted:false,jobs:[]});
 assert.equal((await requestCodexJobs('list')).persisted,false);
});
test('browser retries reuse supplied request ID and no secret is sent',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const requests=[];
 globalThis.fetch=async(url,init)=>{requests.push({url,...init});return Response.json({status:'accepted',job:{id:'1'}});};
 for(let i=0;i<2;i++)await requestCodexJobs('submit',{requestId:'same',projectId:'p',prompt:'검토'});
 assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers.authorization,undefined);
});
