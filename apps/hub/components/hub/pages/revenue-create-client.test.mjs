import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fixture, createId, workspace } from '../../../../../scripts/audits/revenue-create-rest.mjs';
import { saveRevenueCreate, rememberRevenueDraft, pendingRevenueCreates, hasPendingRevenueCreate, mergeRevenueDrafts } from './revenue-create-client.js';
import { newRevenueCreateId, REVENUE_CREATE_KINDS, CREATE_UNKNOWN_MESSAGE } from '../../../lib/sales-os/revenue-create-command.js';
registerHooks({ resolve(specifier, context, next) { return next(specifier === 'next/server' ? 'next/server.js' : specifier, context); } });
const routes = Object.fromEntries(await Promise.all(['lead','deal','account','case'].map(async kind => [kind, (await import(`../../../app/api/hub/revenue/${kind}/route.js`)).POST])));
const source = readFileSync(new URL('./revenue-core.jsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('export async function saveRevenueRecord('), source.indexOf('\nexport function LeadEnrichmentPanel')).replace('export ', '');
const save = new Function('saveRevenueCreate','REVENUE_CREATE_KINDS','CREATE_UNKNOWN_MESSAGE', `${body}; return saveRevenueRecord;`)(saveRevenueCreate, REVENUE_CREATE_KINDS, CREATE_UNKNOWN_MESSAGE);
const kinds = [['lead','leads'],['deal','deals'],['account','customer_accounts'],['case','operation_cases']];

function boundary(t, kind, table, options = {}) {
  const io = fixture(t, table, options), restFetch = globalThis.fetch, operations = [];
  const old = process.env.COM_MOON_HUB_WRITE_SECRET;
  process.env.COM_MOON_HUB_WRITE_SECRET = 'synthetic-route-secret';
  t.after(() => { old === undefined ? delete process.env.COM_MOON_HUB_WRITE_SECRET : process.env.COM_MOON_HUB_WRITE_SECRET = old; });
  let loseReply = options.loseBrowserReply;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('/api/hub/revenue/')) {
      assert.equal(input, `/api/hub/revenue/${kind}`);
      const payload = JSON.parse(init.body); operations.push(payload.op);
      const response = await routes[kind](new Request(`https://synthetic.invalid${input}`, { ...init,
        headers: { ...init.headers, 'x-com-moon-hub-write-secret': 'synthetic-route-secret' } }));
      if (loseReply) { loseReply = false; throw Error('synthetic BFF reply lost AFTER commit'); }
      return response;
    }
    return restFetch(input, init);
  };
  return { ...io, operations };
}
for (const [kind,table] of kinds) {
  test(`${kind}: actual UI adapter + guarded route + persistence recover lost BFF response without duplicate`, async t => {
    const io=boundary(t,kind,table,{loseBrowserReply:true});
    const record={createId,id:`local-${kind}`,name:'Original',title:'Original'};
    const first=await save(kind,'create',record); assert.equal(first.status,'unknown'); assert.equal(first.ok,false);
    assert.equal(io.rows.size,1); assert.equal(io.operations.length,1);
    const result=await save(kind,'create',record); assert.equal(result.ok,true); assert.equal(result.id,createId); assert.equal(io.rows.size,1);
    assert.deepEqual(io.operations,['create','create']); assert.equal(hasPendingRevenueCreate(kind,record),false);
  });
  test(`${kind}: changed input after unknown is verified read-only, then explicit Save updates the same row`, async t=>{
    const io=boundary(t,kind,table,{loseBrowserReply:true});
    const original={createId,id:`local-${kind}`,name:'Original',title:'Original',type:'company'};
    await save(kind,'create',original);
    const edited={...original,name:'Edited',title:'Edited'};
    const checked=await save(kind,'create',edited);
    assert.equal(checked.ok,false); assert.equal(checked.reason,'original-create-confirmed');
    assert.deepEqual(io.operations,['create','confirm-create']); assert.equal(io.rows.size,1);
    assert.equal(io.rows.get(createId).name || io.rows.get(createId).title,'Original');
    assert.equal(pendingRevenueCreates(kind).find(row=>row.createId===createId).name,'Edited');
    // Replace only the REST PATCH boundary; the real UI and route update path still run.
    const previous=globalThis.fetch;
    globalThis.fetch=async(input,init={})=>{
      if (String(input).startsWith('https://synthetic.invalid/rest/') && init.method==='PATCH') {
        const url=new URL(String(input));assert.equal(url.searchParams.get('id'),`eq.${createId}`);
        assert.equal(url.searchParams.get('workspace_id'),`eq.${workspace}`);
        const row=io.rows.get(createId);assert.equal(url.searchParams.get('meta'),`eq.${JSON.stringify(row.meta)}`);
        const updated={...row,...JSON.parse(init.body)};io.rows.set(createId,updated);
        return new Response(JSON.stringify([updated]),{status:200});
      }
      return previous(input,init);
    };
    const updated=await save(kind,'create',edited);assert.equal(updated.ok,true);assert.equal(updated.id,createId);
    assert.deepEqual(io.operations,['create','confirm-create','update']);assert.equal(io.rows.size,1);
    assert.equal(io.rows.get(createId).name || io.rows.get(createId).title,'Edited');
  });
  test(`${kind}: unauthorized create/confirmation and missing command id never reach REST`,async t=>{
    const io=boundary(t,kind,table);
    for(const op of ['create','confirm-create']){
      const request=new Request(`https://synthetic.invalid/api/hub/revenue/${kind}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,createId,name:'Original',title:'Original'})});
      assert.equal((await routes[kind](request)).status,401);
    }
    const result=await save(kind,'create',{name:'Original',title:'Original'});assert.equal(result.status,'error');assert.equal(io.calls.length,0);
  });
}

test('same-frame repeated create clicks share one request and preserve in-flight changed input', async()=>{
  const id=newRevenueCreateId(),record={createId:id,name:'Original'};let release,writes=0;
  const gate=new Promise(resolve=>release=resolve);
  const send=async()=>{writes++;await gate;return{ok:true,status:'saved',id};};
  const first=saveRevenueCreate('lead',record,send),second=saveRevenueCreate('lead',record,send);
  assert.equal(first,second);rememberRevenueDraft('lead',{...record,name:'Typed while saving'});release();
  const result=await first;assert.equal(result.ok,false);assert.equal(result.reason,'original-create-confirmed');assert.equal(writes,1);
  assert.equal(pendingRevenueCreates('lead').find(row=>row.createId===id).name,'Typed while saving');
  assert.equal((await saveRevenueCreate('lead',{...record,name:'Typed while saving'},async op=>{assert.equal(op,'update');return{ok:true,status:'saved',id};})).ok,true);
});

test('changed unknown draft with no confirmed row offers explicit original retry, never a hidden insert',async()=>{
  const id=newRevenueCreateId(),original={createId:id,name:'Original'},edited={...original,name:'Edited'},calls=[];
  const send=async(op,payload)=>{calls.push({op,payload});return{ok:false,status:'unknown'};};
  await saveRevenueCreate('lead',original,send);const result=await saveRevenueCreate('lead',edited,send);
  assert.deepEqual(calls.map(c=>c.op),['create','confirm-create']);assert.equal(typeof result.retryOriginal,'function');
  await result.retryOriginal();assert.deepEqual(calls.map(c=>c.op),['create','confirm-create','create']);assert.equal(calls[2].payload.name,'Original');
  assert.equal(pendingRevenueCreates('lead').find(row=>row.createId===id).name,'Edited');
});

test('draft memory restores unresolved inputs and hides a matching live alias, without persistent browser storage',async()=>{
  const id=newRevenueCreateId(),record={createId:id,id:`local-lead-${id}`,name:'Original'};
  await saveRevenueCreate('lead',record,async()=>({ok:false,status:'unknown'}));rememberRevenueDraft('lead',{...record,name:'Retained edits'});
  const restored=pendingRevenueCreates('lead').find(row=>row.createId===id);assert.equal(restored.name,'Retained edits');
  restored.name='Untrusted caller mutation';assert.equal(pendingRevenueCreates('lead').find(row=>row.createId===id).name,'Retained edits');
  const rows=mergeRevenueDrafts([{id,name:'Server original'},{id:'other',name:'Other'}],[record]);
  assert.equal(rows.length,2);assert.equal(rows[0].id,record.id);
});

test('definitive rejection permits corrected payload; malformed saved acknowledgement remains unknown',async t=>{
  const io=boundary(t,'lead','leads',{rejectFirst:400});const record={createId,name:'Original'};
  assert.equal((await save('lead','create',record)).status,'failed');assert.equal(hasPendingRevenueCreate('lead',record),false);
  assert.equal((await save('lead','create',{...record,name:'Corrected'})).ok,true);assert.equal(io.rows.size,1);
  const id=newRevenueCreateId();const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;});
  globalThis.fetch=async()=>new Response(JSON.stringify({status:'saved',id:null}),{status:200});
  assert.equal((await save('lead','create',{createId:id,name:'Unknown'})).status,'unknown');
});

test('an unresolved create cannot be reused in a different workspace or overwrite its retained original scope',async()=>{
  const id=newRevenueCreateId(),original={createId:id,name:'Original',workspace:'classin'};let calls=0;
  const send=async()=>{calls++;return{ok:false,status:'unknown'};};await saveRevenueCreate('lead',original,send);
  const other={...original,name:'Other scope edit',workspace:'personal'};rememberRevenueDraft('lead',other);
  const result=await saveRevenueCreate('lead',other,send);assert.equal(result.reason,'create-scope-changed');assert.equal(calls,1);
  const retained=pendingRevenueCreates('lead').find(row=>row.createId===id);assert.equal(retained.workspace,'classin');assert.equal(retained.name,'Original');
});
