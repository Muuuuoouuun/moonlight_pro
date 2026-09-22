import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as client from './journal-client.js';
import { createJournalStore, journalTabId } from './journal-browser-store.js';

// Run the actual hook with deterministic effects and deferred network responses.
// This exercises editor replacement while a prior request is still unresolved.
const source = fs.readFileSync(new URL('../components/hub/pages/use-memos.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const loadHook = new Function('React', 'initialMemoContexts', 'buildNoteSave', 'createJournalWriter', 'isJournalEntry', 'noteFingerprint', 'noteToDraft', 'createJournalStore', 'journalTabId', source + '\nreturn useMemoDocument;');
const id='11111111-1111-4111-8111-111111111111',workspaceId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333';
const entry={id,body:'original',title:'',occurredAt:'2026-09-13T02:00:00.000Z',noteMeta:{kind:'note',enhancement:''},revision:1,contexts:[],links:[]};
function harness(t) {
  const nativeFetch=globalThis.fetch, nativeStorage=globalThis.sessionStorage;
  const disk=new Map(); globalThis.sessionStorage={get length(){return disk.size;},key:i=>[...disk.keys()][i],getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
  const requests=[],saved=[];
  globalThis.fetch=(_url,options)=>new Promise(resolve=>requests.push({payload:JSON.parse(options.body),resolve:result=>resolve({ok:true,json:async()=>result})}));
  t.after(()=>{globalThis.fetch=nativeFetch;if(nativeStorage===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=nativeStorage;});
  const store=createJournalStore({storage:sessionStorage,workspaceId,tabId:journalTabId()}),draft={...client.noteToDraft(entry),body:'first requested edit'};
  store.write(id,{entry,draft,dirty:true,pending:client.buildNoteSave(draft,requestId)});
  const cells=[];let cursor=0,effects=[],needsRender=false,model;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const React={
    useState(initial){const i=cursor++;if(!cells[i])cells[i]={value:typeof initial==='function'?initial():initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v;needsRender=true;}];},
    useRef(value){const i=cursor++;return cells[i]||={current:value};},
    useCallback(fn,deps){const i=cursor++;if(!cells[i]||!same(cells[i].deps,deps))cells[i]={deps,value:fn};return cells[i].value;},
    useEffect(fn,deps){const i=cursor++,prior=cells[i];if(!prior||!same(prior.deps,deps)){cells[i]={deps,cleanup:prior?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn();});}},
  };
  const useMemoDocument=loadHook(React,client.initialMemoContexts,client.buildNoteSave,client.createJournalWriter,client.isJournalEntry,client.noteFingerprint,client.noteToDraft,createJournalStore,journalTabId);
  let props={id,isNew:false,workspaceId,workspaceConfirmed:true,source:'error',entry:null,onSaved:e=>saved.push(e)};
  function render(patch={}){props={...props,...patch};do{needsRender=false;cursor=0;effects=[];model=useMemoDocument(props);const queue=effects;effects=[];for(const effect of queue)effect();}while(needsRender);return model;}
  render();return {render,get:()=>model,requests,store,saved};
}
test('a replaced writer cannot overwrite new input or recovery after a newer retry is confirmed',async t=>{
  const h=harness(t),first=h.get().retry();h.render({source:'loading'});h.render({source:'live',entry});
  const second=h.get().retry();h.render();assert.equal(h.requests.length,2);
  const latest={...entry,body:'first requested edit',revision:2};
  h.requests[1].resolve({status:'duplicate',entry:latest});await second;h.render({entry:latest});
  h.get().edit({body:'new unsaved input after confirmation'});h.render();
  h.requests[0].resolve({status:'saved',entry:latest});await first;h.render();
  assert.equal(h.get().draft.body,'new unsaved input after confirmation');assert.equal(h.get().dirty,true);
  assert.equal(h.store.read(id).draft.body,'new unsaved input after confirmation');assert.equal(h.saved.length,1);
  const third=h.get().save();h.requests[2].resolve({status:'saved',entry:{...latest,body:'new unsaved input after confirmation',revision:3}});await third;h.render();
  assert.equal(h.get().draft.expectedRevision,3);assert.equal(h.get().dirty,false);
});
test('a connection reload cannot start a pending retry before its read finishes',async t=>{
  const h=harness(t);h.render({source:'loading'});const attempt=h.get().retry();
  assert.equal(h.requests.length,0);assert.equal((await attempt).status,'unconfirmed-workspace');assert.ok(h.store.read(id).pending);
});
