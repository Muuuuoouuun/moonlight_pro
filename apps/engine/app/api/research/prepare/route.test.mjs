import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test, after, afterEach } from 'node:test';
const hooks=registerHooks({resolve(specifier,context,next){return next(specifier==='next/server.js'?'next/server.js':specifier,context);}});after(()=>hooks.deregister());
const {POST}=await import('./route.ts'),original={...process.env};afterEach(()=>{process.env={...original};});
test('Engine rejects open webhook mode and missing shared credential before reading body',async()=>{
  delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;process.env.NODE_ENV='development';process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS='true';
  const result=await POST(new Request('https://engine.test/api/research/prepare',{method:'POST',body:'{}'}));assert.equal(result.status,401);
});
test('Engine rejects cross workspace input and oversized payload without a model claim',async()=>{
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET='engine-test';process.env.COM_MOON_DEFAULT_WORKSPACE_ID='11111111-1111-4111-8111-111111111111';
  const req=body=>new Request('https://engine.test/api/research/prepare',{method:'POST',headers:{'x-com-moon-shared-secret':'engine-test'},body});
  assert.equal((await POST(req(JSON.stringify({workspaceId:'22222222-2222-4222-8222-222222222222',preparationId:'33333333-3333-4333-8333-333333333333'})))).status,400);
  assert.equal((await POST(req('x'.repeat(4097)))).status,413);
});
