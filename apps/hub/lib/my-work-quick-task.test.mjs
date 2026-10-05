import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMyWorkQuickTask } from './my-work-quick-task.js';
import { clearSubmittedQuickTaskDraft } from './quick-task-capture.js';
const ID = '11111111-1111-4111-8111-111111111111';
const draft = { title: '  다음 행동  ', dueAt: '2026-10-05T01:00:00Z', priority: 'high' };

test('lost acknowledgement retries one immutable ID/payload and preserves the next edited draft', async () => {
  let attempts = 0, inserts = 0; const rows = new Map(), sent = [];
  const writer = createMyWorkQuickTask({ createId: () => ID });
  const fetchImpl = async (_url, options) => {
    const payload = JSON.parse(options.body); sent.push(payload);
    const duplicate = rows.has(payload.id);
    if (!duplicate) { rows.set(payload.id, payload); inserts++; }
    if (++attempts === 1) throw new DOMException('lost', 'TimeoutError');
    return Response.json({ status: duplicate ? 'duplicate' : 'saved', task: { id: payload.id } });
  };
  assert.equal((await writer.submit(draft, {details:true,fetchImpl})).status,'error');
  const next = {...draft,title:'그다음 할 일'};
  const result = await writer.submit(next,{details:false,fetchImpl});
  assert.equal(result.status,'duplicate'); assert.equal(inserts,1); assert.deepEqual(sent[1],sent[0]);
  assert.equal(sent[0].title,'다음 행동'); assert.equal(sent[0].dueAt,draft.dueAt);
  assert.equal(clearSubmittedQuickTaskDraft(next,result.submittedDraft),next);
  assert.equal(clearSubmittedQuickTaskDraft(draft,result.submittedDraft).title,'');
  assert.equal(writer.getPending(),null);
});

test('concurrent submits join a single request; durable acknowledgement must match the ID', async () => {
  let release, calls=0;
  const fetchImpl = () => { calls++; return new Promise(resolve=>{release=resolve;}); };
  const writer = createMyWorkQuickTask({createId:()=>ID});
  const a=writer.submit(draft,{fetchImpl}), b=writer.submit(draft,{fetchImpl});
  assert.equal(a,b); assert.equal(calls,1);
  release(Response.json({status:'saved',task:{id:'22222222-2222-4222-8222-222222222222'}}));
  assert.equal((await a).status,'error'); assert.equal(writer.getPending().payload.id,ID);
});

test('preview, error, malformed JSON and conflicts retain input and retry ID; rejection releases it', async () => {
  for (const response of [Response.json({status:'preview'}),Response.json({status:'error'},{status:502}),new Response('bad json'),Response.json({status:'conflict'},{status:409})]) {
    const writer=createMyWorkQuickTask({createId:()=>ID});
    const result=await writer.submit(draft,{fetchImpl:async()=>response});
    assert.ok(['error','preview'].includes(result.status)); assert.equal(writer.getPending().payload.id,ID);
  }
  const writer=createMyWorkQuickTask({createId:()=>ID});
  assert.equal((await writer.submit(draft,{fetchImpl:async()=>Response.json({status:'invalid-input'},{status:400})})).status,'error');
  assert.equal(writer.getPending(),null);
  let calls=0;
  assert.equal((await writer.submit({title:''},{fetchImpl:async()=>{calls++;}})).status,'invalid-input');
  assert.equal(calls,0);
});

test('a request that never returns is bounded by its abort signal', async () => {
  const writer=createMyWorkQuickTask({createId:()=>ID});
  const fetchImpl=(_url,{signal})=>new Promise((_,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    // Keep the test alive: AbortSignal.timeout is an unref timer in Node.
    setTimeout(()=>reject(Error('test deadline')),50);
  });
  assert.equal((await writer.submit(draft,{fetchImpl,timeoutMs:5})).status,'error');
  assert.equal(writer.getPending().payload.id,ID);
});


test('an auth rejection after unknown receipt never releases the original dedup ID', async () => {
  let ids=0,calls=0; const rows=new Map(), sent=[];
  const writer=createMyWorkQuickTask({createId:()=>{ids++;return ID;}});
  const fetchImpl=async(_url,{body})=>{
    const payload=JSON.parse(body);sent.push(payload); calls++;
    if(calls===1){rows.set(payload.id,payload);throw new TypeError('lost');}
    if(calls===2)return Response.json({status:'unauthorized'},{status:401});
    return Response.json({status:'duplicate',task:{id:payload.id}});
  };
  await writer.submit(draft,{fetchImpl});await writer.submit(draft,{fetchImpl});
  assert.equal(writer.getPending().payload.id,ID);
  assert.equal((await writer.submit(draft,{fetchImpl})).status,'duplicate');
  assert.equal(ids,1);assert.equal(rows.size,1);assert.deepEqual(sent[0],sent[2]);
});
