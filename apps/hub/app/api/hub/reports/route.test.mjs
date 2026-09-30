import assert from 'node:assert/strict';
import test from 'node:test';
import { GET,POST } from './route.js';
const W='11111111-1111-4111-8111-111111111111';
test('reports read errors use HTTP200 and guarded writes reject before calling storage',async()=>{
  const env={...process.env},fetch=globalThis.fetch;let calls=0;
  Object.assign(process.env,{NODE_ENV:'production',COM_MOON_HUB_WRITE_SECRET:'test-secret',COM_MOON_DEFAULT_WORKSPACE_ID:W,SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'test-db-secret'});
  globalThis.fetch=async()=>{calls++;return new Response('failed',{status:503});};
  try {
    const read=await GET(new Request('https://hub.test/api/hub/reports'));assert.equal(read.status,200);assert.equal((await read.json()).status,'error');
    const before=calls;
    const denied=await POST(new Request('https://hub.test/api/hub/reports',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));assert.equal(denied.status,401);assert.equal(calls,before);
    const invalid=await POST(new Request('https://hub.test/api/hub/reports',{method:'POST',headers:{'content-type':'application/json','x-com-moon-hub-write-secret':'test-secret'},body:'{}'}));assert.equal(invalid.status,400);assert.equal(calls,before);
  } finally {process.env=env;globalThis.fetch=fetch;}
});
