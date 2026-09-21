import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {GET} from './route.js';
import {GET as receipt,POST} from './commands/route.js';
const names=['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','COM_MOON_DEFAULT_WORKSPACE_ID','DEFAULT_WORKSPACE_ID','COM_MOON_HUB_WRITE_SECRET','NODE_ENV'];
const original=Object.fromEntries(names.map(name=>[name,process.env[name]]));
for(const name of names)delete process.env[name];
after(()=>{for(const [name,value] of Object.entries(original)) {if(value===undefined)delete process.env[name];else process.env[name]=value;}});
test('goal read without persistence is honest preview over HTTP 200',async()=>{
  const response=await GET(new Request('http://localhost:3000/api/hub/goals'));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.status,'preview');assert.deepEqual(data.objectives,[]);
});
test('goal write guard runs before JSON parsing',async()=>{
  process.env.NODE_ENV='production';
  const response=await POST(new Request('https://moonlight.example/api/hub/goals/commands',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'malformed'}));
  assert.equal(response.status,403);delete process.env.NODE_ENV;
});
test('authorized missing-persistence command fails without a preview success',async()=>{
  const response=await POST(new Request('http://localhost:3000/api/hub/goals/commands',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({commandId:'33333333-3333-4333-8333-333333333333',action:'create_objective',input:{title:'결과',scope:'personal',periodStart:'2026-09-01',periodEnd:'2026-09-30',timezone:'Asia/Seoul'}})}));
  assert.equal(response.status,503);assert.equal((await response.json()).persisted,false);
});
test('receipt endpoint rejects invalid IDs and preserves unknown persistence',async()=>{
  assert.equal((await receipt(new Request('http://localhost:3000/api/hub/goals/commands?commandId=bad'))).status,400);
  const response=await receipt(new Request('http://localhost:3000/api/hub/goals/commands?commandId=33333333-3333-4333-8333-333333333333'));
  assert.equal(response.status,503);assert.equal((await response.json()).persisted,null);
});
