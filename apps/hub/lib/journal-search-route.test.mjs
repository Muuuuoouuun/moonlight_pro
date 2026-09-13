import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';
const stub=`export async function getJournalSearch(input){const s=globalThis.__journalSearchRoute;s.calls.push(input);if(s.fail)throw new Error('private secret');return s.result;}`;
registerHooks({resolve(specifier,context,next){return specifier==='@/lib/repositories/journal-search-ledger'?{url:`data:text/javascript,${encodeURIComponent(stub)}`,shortCircuit:true}:next(specifier,context);}});
const route=await import('../app/api/hub/journal/search/route.js');
let state;
beforeEach(()=>{state=globalThis.__journalSearchRoute={calls:[],fail:false,result:{status:'live',entries:[],nextCursor:null}};});
after(()=>delete globalThis.__journalSearchRoute);
test('dynamic GET forwards only supported filters and always preserves HTTP200 read envelopes',async()=>{
  assert.equal(route.runtime,'nodejs');assert.equal(route.dynamic,'force-dynamic');
  for(const status of ['live','preview','error']){
    state.result.status=status;
    const response=await route.GET(new Request('http://localhost/api/hub/journal/search?q=needle&dateFrom=2026-09-13&dateTo=2026-09-14&kind=idea&contextType=project&contextId=id&used=used&cursor=opaque&limit=3&workspaceId=foreign'));
    assert.equal(response.status,200);assert.deepEqual(await response.json(),state.result);
  }
  assert.deepEqual(state.calls[0],{q:'needle',dateFrom:'2026-09-13',dateTo:'2026-09-14',kind:'idea',contextType:'project',contextId:'id',used:'used',cursor:'opaque',limit:'3'});
});
test('unexpected GET errors contain safe error state instead of exposing details',async()=>{
  state.fail=true;
  const response=await route.GET(new Request('http://localhost/api/hub/journal/search'));
  const data=await response.json();assert.equal(response.status,200);assert.equal(data.status,'error');assert.deepEqual(data.entries,[]);assert.equal(data.nextCursor,null);assert.equal(JSON.stringify(data).includes('private'),false);
});
