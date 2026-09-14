import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';
const stub = `
export async function getJournalLedger(options) { const s=globalThis.__journalRoute; s.reads.push(options); if(s.throwRead)throw new Error('private secret'); return s.readResult; }
export async function getJournalContexts(options) { const s=globalThis.__journalRoute; s.searches.push(options); if(s.throwRead)throw new Error('private secret'); return s.searchResult; }
export async function writeJournal(input) { const s=globalThis.__journalRoute; s.writes.push(input); if(s.throwWrite)throw new Error('private secret'); return s.writeResult; }
`;
registerHooks({ resolve(specifier, context, next) { return specifier === '@/lib/repositories/journal-ledger' ? { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true } : next(specifier, context); } });
const route = await import('../app/api/hub/journal/route.js');
const contexts = await import('../app/api/hub/journal/contexts/route.js');
const endpoint = 'http://localhost:3000/api/hub/journal';
const keys = ['NODE_ENV','VERCEL_ENV','COM_MOON_HUB_WRITE_SECRET','COM_MOON_HUB_URL','NEXT_PUBLIC_APP_URL'];
const env = Object.fromEntries(keys.map((k) => [k,process.env[k]]));
let state;
beforeEach(() => {
  keys.forEach((k) => delete process.env[k]); process.env.NODE_ENV='test';
  state = globalThis.__journalRoute = { reads: [], searches: [], writes: [], throwRead: false, throwWrite: false, readResult: { status: 'live', configured: true, entries: [], entry: null, nextCursor: null }, searchResult: { status: 'live', contexts: [], hasMore: false }, writeResult: { status: 'saved', entry: { id: 'id', revision: 1 } } };
});
after(() => { delete globalThis.__journalRoute; for(const k of keys){ if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]; } });
const post = (body = '{}', headers = {}) => new Request(endpoint,{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3000',...headers},body});

test('journal routes are dynamic and GET forwards allowed query fields without workspace', async () => {
  for (const mod of [route, contexts]) { assert.equal(mod.runtime, 'nodejs'); assert.equal(mod.dynamic,'force-dynamic'); }
  for (const status of ['live','preview','error']) {
    state.readResult.status=status;
    const response = await route.GET(new Request(`${endpoint}?note=id&before=iso&beforeId=cursor&workspaceId=foreign`));
    assert.equal(response.status,200); assert.deepEqual(await response.json(),state.readResult);
  }
  assert.deepEqual(state.reads[0],{note:'id',before:'iso',beforeId:'cursor'});
  await route.GET(new Request(endpoint));
  assert.deepEqual(state.reads.at(-1),{note:null,before:null,beforeId:null});
  await contexts.GET(new Request(`${endpoint}/contexts?type=account&q=find&id=exact&workspaceId=foreign`));
  assert.deepEqual(state.searches[0],{type:'account',q:'find',id:'exact'});
});
test('both GET failures stay HTTP200 with safe nonempty error state',async()=>{
  state.throwRead=true;
  for(const mod of [route,contexts]) {
    const response=await mod.GET(new Request(endpoint)); const result=await response.json();
    assert.equal(response.status,200); assert.equal(result.status,'error'); assert.equal(JSON.stringify(result).includes('private'),false);
  }
});
test('write guard rejects cross-origin and malformed bodies before persistence',async()=>{
  assert.equal((await route.POST(post('{}',{origin:'https://foreign.example'}))).status,403);
  assert.equal((await route.POST(post('{'))).status,400);
  assert.equal((await route.POST(post('x'.repeat(131073)))).status,413);
  assert.equal(state.writes.length,0);
});
test('complete Korean memo snapshots fit the explicit JSON byte limit',async()=>{
  const payload={body:'가'.repeat(20000),noteMeta:{kind:'note',enhancement:'나'.repeat(4000)}};
  assert.equal((await route.POST(post(JSON.stringify(payload)))).status,200);
  assert.deepEqual(state.writes[0],payload);
});
test('POST accepts server secret and maps save duplicate conflict invalid and persistence results',async()=>{
  process.env.COM_MOON_HUB_WRITE_SECRET='test-secret';
  for(const [status,httpStatus] of [['saved',200],['duplicate',200],['conflict',409],['invalid-input',400],['error',503],['error',502]]) {
    state.writeResult={status,httpStatus,entry:null};
    const response=await route.POST(post('{}',{origin:'https://server.invalid','x-com-moon-hub-write-secret':'test-secret'}));
    const result=await response.json(); assert.equal(response.status,httpStatus); assert.equal(result.status,status); assert.equal('httpStatus' in result,false);
  }
});
test('unexpected POST failure is retryable 502 without private exception text',async()=>{
  state.throwWrite=true;
  const response=await route.POST(post()); const result=await response.json();
  assert.equal(response.status,502);assert.equal(result.retryable,true);assert.equal(result.entry,null);assert.equal(JSON.stringify(result).includes('private'),false);
});
