import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { GET, POST } from './route.js';
const original={...process.env};afterEach(()=>{process.env={...original};});
test('run GET reports preview at200 without configured DB and no raw evidence',async()=>{
  delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  const result=await GET(new Request('https://hub.test/api/hub/research/runs'));assert.equal(result.status,200);const body=await result.json();assert.equal(body.status,'preview');assert.deepEqual(body.runs,[]);assert.equal(body.settings.costCapUsd,null);
});
test('research run POST is guarded before parsing or any paid work',async()=>{
  process.env.NODE_ENV='production';process.env.COM_MOON_HUB_WRITE_SECRET='test-secret';
  const result=await POST(new Request('https://hub.test/api/hub/research/runs',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));assert.equal(result.status,401);
});
test('authorized run requests reject client AI provenance at400',async()=>{
  process.env.NODE_ENV='production';process.env.COM_MOON_HUB_WRITE_SECRET='test-secret';
  const result=await POST(new Request('https://hub.test/api/hub/research/runs',{method:'POST',headers:{'content-type':'application/json','x-com-moon-hub-write-secret':'test-secret'},body:JSON.stringify({requestId:'11111111-1111-4111-8111-111111111111',brand:'22nomad',origin:'research-ai'})}));assert.equal(result.status,400);
});
