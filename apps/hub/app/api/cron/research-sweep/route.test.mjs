import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { GET } from './route.js';
const original={...process.env};afterEach(()=>{process.env={...original};});
test('research cron uses its own secret and disabled cron performs no work',async()=>{
  process.env.CRON_SECRET='cron-test';process.env.COM_MOON_RESEARCH_ENABLED='false';
  const url='https://hub.test/api/cron/research-sweep';assert.equal((await GET(new Request(url))).status,401);
  const result=await GET(new Request(url,{headers:{authorization:'Bearer cron-test'}}));assert.equal(result.status,200);assert.equal((await result.json()).status,'disabled');
});
