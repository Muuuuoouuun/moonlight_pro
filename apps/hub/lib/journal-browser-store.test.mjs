import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournalStore } from './journal-browser-store.js';
const workspaceId='11111111-1111-4111-8111-111111111111',entryId='22222222-2222-4222-8222-222222222222';
function storage(){const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
const doc={draft:{id:entryId,body:'잊지 않을 문장'},dirty:true,pending:{requestId:entryId}};
test('reload recovers the exact draft and pending receipt in the same tab and workspace',()=>{
  const disk=storage(),first=createJournalStore({storage:disk,workspaceId,tabId:'tab-a'});first.write(entryId,doc);
  const reloaded=createJournalStore({storage:disk,workspaceId,tabId:'tab-a'});
  assert.deepEqual(reloaded.read(entryId).pending,doc.pending);assert.equal(reloaded.read(entryId).draft.body,doc.draft.body);
  assert.equal(reloaded.list().length,1);
});
test('two tabs and two workspaces cannot replace each others recovery copies',()=>{
  const disk=storage(),a=createJournalStore({storage:disk,workspaceId,tabId:'a'}),b=createJournalStore({storage:disk,workspaceId,tabId:'b'});
  a.write(entryId,doc);b.write(entryId,{...doc,draft:{...doc.draft,body:'다른 창'}});
  assert.equal(a.read(entryId).draft.body,doc.draft.body);
  assert.equal(createJournalStore({storage:disk,workspaceId:entryId,tabId:'a'}).read(entryId),null);
});
test('successful notes leave the unfinished list and storage failures stay explicit',()=>{
  const disk=storage(),s=createJournalStore({storage:disk,workspaceId,tabId:'a'});
  s.write(entryId,{...doc,dirty:false,pending:null});assert.equal(s.list().length,0);
  disk.setItem=()=>{throw Error('full');};assert.throws(()=>s.write(entryId,doc),/full/);
});

test('quota failure preserves the open draft in memory for same-session navigation', () => {
  const disk=storage(),store=createJournalStore({storage:disk,workspaceId,tabId:'volatile'});
  store.write(entryId,doc);disk.setItem=()=>{throw Error('full');};
  assert.throws(()=>store.write(entryId,{...doc,draft:{...doc.draft,body:'새로 입력한 내용'}}),/full/);
  const reopened=createJournalStore({storage:disk,workspaceId,tabId:'volatile'});
  assert.equal(reopened.read(entryId).draft.body,'새로 입력한 내용');
  assert.equal(reopened.read(entryId).volatile,true);
  assert.equal(reopened.list()[0].draft.body,'새로 입력한 내용');
});
