import test from 'node:test';
import assert from 'node:assert/strict';
import { noteToDraft, noteFingerprint, buildNoteSave, selectedNoteExcerpt, createJournalWriter, journalSourceHref } from './journal-client.js';
const id='11111111-1111-4111-8111-111111111111', requestId='22222222-2222-4222-8222-222222222222';
const entry={id,body:'  첫 관찰\n😀 같은 말 / 같은 말  ',title:'',occurredAt:'2026-09-13T02:00:00.000Z',noteMeta:{kind:'idea',enhancement:'어제 본 장면'},revision:3,contexts:[{type:'project',id, label:'기획',href:'/dashboard/work/projects'}],links:[]};
test('manual note save preserves raw text and keeps enhancement separate',()=>{
  const draft=noteToDraft(entry), request=buildNoteSave(draft,requestId);
  assert.equal(request?.body,entry.body); assert.deepEqual(request.noteMeta,entry.noteMeta);
  assert.equal(request.expectedRevision,3); assert.deepEqual(request.contexts,[{type:'project',id}]);
  assert.equal(noteFingerprint(draft),noteFingerprint({...draft,contexts:[{type:'project',id,label:'이름 변경'}]}));
});
test('an empty selection never silently sends the entire personal memo',()=>{
  assert.equal(selectedNoteExcerpt(entry.body,0,0),null);
  assert.equal(selectedNoteExcerpt(entry.body,0,2),null);
  const start=entry.body.lastIndexOf('같은 말'),selected=selectedNoteExcerpt(entry.body,start,start+4);
  assert.equal(selected?.text,'같은 말'); assert.equal(selected.prefix+selected.text+selected.suffix,entry.body);
  assert.equal(selectedNoteExcerpt('x'.repeat(3501),0,3501),null);
  assert.equal(selectedNoteExcerpt('😀',0,1),null);
});
test('journal source links only accept journal UUIDs',()=>{
  assert.equal(journalSourceHref({type:'journal',journal_id:id}),`/dashboard/work/memos?note=${id}`);
  assert.equal(journalSourceHref({type:'journal',journal_id:'javascript:alert(1)',href:'https://bad.invalid'}),null);
});
function harness({send,persist=()=>{},initialPending=null,isCurrent=()=>true}={}) {
  let state={draft:noteToDraft(entry),entry,pending:initialPending}; const changes=[];
  const writer=createJournalWriter({get:()=>state,persist,send,isCurrent,update:patch=>{state={...state,...patch};changes.push(patch);}});
  return {writer,get:()=>state,changes};
}
test('no mutation is sent when the browser cannot durably save its receipt',async()=>{
  let calls=0; const h=harness({send:async()=>{calls++;},persist:()=>{throw Error('quota');}});
  const outcome=await h.writer.run({action:'save',requestId,entryId:id});
  assert.equal(outcome?.status,'local-error'); assert.equal(calls,0);
});
test('a lost response retains one immutable request and retries it across writer recreation',async()=>{
  const sent=[];let stored=null;
  const h=harness({persist:x=>{stored=structuredClone(x);},send:async request=>{sent.push(request);throw Error('lost');}});
  const request={action:'save',requestId,entryId:id};
  assert.equal((await h.writer.run(request))?.status,'error');
  assert.deepEqual(stored.pending,request);
  const h2=harness({initialPending:stored.pending,persist:x=>{stored=x;},send:async request=>{sent.push(request);return {status:'duplicate',entry:{...entry,revision:4}};}});
  assert.equal((await h2.writer.run({action:'save',requestId:'different'}))?.status,'duplicate');
  assert.deepEqual(sent,[request,request]); assert.equal(h2.get().pending,null); assert.equal(h2.get().draft.expectedRevision,4);
});
test('HTTP 200 error envelopes and malformed saved envelopes cannot appear saved',async()=>{
  for(const result of [{status:'error'},{status:'saved',entry:null},{status:'saved',entry:{...entry,id:requestId}}]) {
    const h=harness({send:async()=>result}); await h.writer.run({action:'save',requestId,entryId:id});
    assert.notEqual(h.get().saveState,'saved'); assert.ok(h.get().pending);
  }
});
test('a conflicting newer note preserves local text and releases definitively rejected request',async()=>{
  const latest={...entry,body:'다른 창에서 작성',revision:4};
  const h=harness({send:async()=>({status:'conflict',error:'stale-revision',entry:latest})});
  await h.writer.run({action:'save',requestId,entryId:id});
  assert.equal(h.get().pending,null);assert.equal(h.get().draft.body,entry.body);assert.equal(h.get().conflict?.body,latest.body);
});
test('double submit shares one in-flight promise and stale navigation never mutates the new document',async()=>{
  let release, calls=0,current=true;const persisted=[];
  const h=harness({isCurrent:()=>current,persist:x=>persisted.push(x),send:()=>{calls++;return new Promise(resolve=>release=resolve);}});
  const request={action:'save',requestId,entryId:id};const first=h.writer.run(request),second=h.writer.run(request);
  assert.equal(first,second); assert.equal(calls,1);
  current=false;release({status:'saved',entry:{...entry,revision:4}});await first;
  assert.equal(h.get().draft.expectedRevision,3);assert.equal(persisted.length,1);
});
