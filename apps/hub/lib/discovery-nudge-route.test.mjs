import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {GET,POST} from '../app/api/hub/discovery/nudge/route.js';
const id='11111111-1111-4111-8111-111111111111';
const originalFetch=globalThis.fetch;const keys=['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','COM_MOON_DEFAULT_WORKSPACE_ID','DEFAULT_WORKSPACE_ID','COM_MOON_HUB_WRITE_SECRET'];const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
after(()=>{globalThis.fetch=originalFetch;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}});
const context={recordId:id,recordRevision:1,stateRevision:0,today:'2026-09-13',candidate:{ruleId:'evidence',triggerKey:'evidence:abc',field:'evidence'},suppression:null,visible:true};
const command={recordId:id,requestId:id,expectedRevision:0,triggerKey:'evidence:abc',action:'dismiss',until:null};
function setup(){for(const k of keys)delete process.env[k];process.env.SUPABASE_URL='https://nudge.example';process.env.SUPABASE_SERVICE_ROLE_KEY='test';process.env.COM_MOON_DEFAULT_WORKSPACE_ID=id;process.env.COM_MOON_HUB_WRITE_SECRET='test-secret';}
const req=body=>new Request('https://hub.example/api/hub/discovery/nudge',{method:'POST',headers:{'content-type':'application/json','x-com-moon-hub-write-secret':'test-secret'},body:JSON.stringify(body)});
test('read is scoped to server workspace; malformed200 is honest HTTP200 error',async()=>{
 setup();let call;globalThis.fetch=async(url,options)=>{call={url,body:JSON.parse(options.body)};return Response.json({status:'live',context});};
 const r=await GET(new Request(`https://hub.example/api/hub/discovery/nudge?id=${id}&workspace=foreign`));assert.equal((await r.json()).status,'live');assert.equal(call.body.p_workspace_id,id);assert.equal(call.body.p_record_id,id);
 globalThis.fetch=async()=>Response.json({status:'live',context:{...context,recordId:'foreign'}});const bad=await GET(new Request(`https://hub.example/api/hub/discovery/nudge?id=${id}`));assert.equal(bad.status,200);assert.equal((await bad.json()).status,'error');
});
test('writes enforce guard, exact input, persisted envelopes and conflict',async()=>{
 setup();let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({status:'saved',context});};
 assert.equal((await POST(new Request('https://hub.example/api/hub/discovery/nudge',{method:'POST',headers:{origin:'https://evil.example'},body:JSON.stringify(command)}))).status,401);
 assert.equal((await POST(req({...command,until:'bad'}))).status,400);assert.equal(calls,0);
 const saved=await POST(req(command));assert.equal(saved.status,200);assert.equal((await saved.json()).status,'saved');
 globalThis.fetch=async()=>Response.json({status:'conflict',context});assert.equal((await POST(req(command))).status,409);
 globalThis.fetch=async()=>Response.json({status:'saved',context:null});assert.equal((await POST(req(command))).status,502);
});
test('unconfigured environment gives preview for read and refuses durable writes',async()=>{
 setup();delete process.env.SUPABASE_SERVICE_ROLE_KEY;const r=await GET(new Request(`https://hub.example/api/hub/discovery/nudge?id=${id}`));assert.equal((await r.json()).status,'preview');assert.equal((await POST(req(command))).status,503);
});
