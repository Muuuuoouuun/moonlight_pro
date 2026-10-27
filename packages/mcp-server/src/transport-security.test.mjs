import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createMoonlightServer} from './server.js';
import {agentRequest} from './agent-client.js';
import {hubGet} from './hub-client.js';

function environment(t){const saved={...process.env};t.after(()=>{process.env=saved;});
  Object.assign(process.env,{COM_MOON_HUB_URL:'http://127.0.0.1:3000',COM_MOON_AGENT_API_TOKEN:'private-agent-credential',COM_MOON_HUB_WRITE_SECRET:'private-hub-credential'});}

test('both transports reject unsafe destinations before transmitting credentials',async t=>{
  environment(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not send credentials');});
  for(const base of ['http://remote.example','https://user:private-password@hub.example','https://hub.example/?secret=value','https://hub.example/subpath','file:///private']){
    process.env.COM_MOON_HUB_URL=base;
    for(const result of [await agentRequest('/capabilities'),await hubGet('/api/hub/tasks')]){
      assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/private-password|secret=value/);
    }
  }
  process.env.COM_MOON_HUB_URL='https://hub.example';
  for(const path of ['https://other.example/api','//other.example/api','/../../outside','/api\\outside']){
    assert.equal((await hubGet(path)).ok,false);
    assert.equal((await agentRequest(path)).ok,false);
  }
  assert.equal(calls,0);
});

test('HTTPS and loopback keep credentials on their intended API and refuse redirects',async t=>{
  environment(t);const urls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{urls.push(String(url));assert.equal(options.redirect,'error');return Response.json({status:'live'});});
  assert.equal((await agentRequest('/capabilities')).ok,true);
  process.env.COM_MOON_HUB_URL='https://hub.example/';
  assert.equal((await hubGet('/api/hub/tasks')).ok,true);
  assert.deepEqual(urls,['http://127.0.0.1:3000/api/agent/v1/capabilities','https://hub.example/api/hub/tasks']);
});

test('legacy responses have a streaming limit and cancel oversized bodies',async t=>{
  environment(t);let cancelled=false;
  t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({
    pull(controller){controller.enqueue(new Uint8Array(128*1024));},cancel(){cancelled=true;},
  })));
  const result=await hubGet('/api/hub/tasks');
  assert.equal(result.ok,false);assert.equal(result.kind,'route-error');
  assert.equal(result.data.error,'response-too-large');assert.equal(cancelled,true);
});

test('actual MCP responses hide provider and server credentials in text and structured content',async t=>{
  environment(t);
  t.mock.method(globalThis,'fetch',async()=>Response.json({status:'live',data:{
    accessToken:'private-provider-access',nested:[{refresh_token:'private-provider-refresh',clientSecret:'private-client-secret'}],
    note:'private-agent-credential private-hub-credential',hasAccessToken:true,expiresAt:'2026-12-26T00:00:00Z',recoveryToken:'signed-recovery-receipt',
  }}));
  const {server}=createMoonlightServer({profile:'core',mode:'agent'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  const client=new Client({name:'security-test',version:'1'});
  await server.connect(serverTransport);await client.connect(clientTransport);
  try{
    const result=await client.callTool({name:'list_tasks',arguments:{limit:1}});
    const serialized=JSON.stringify(result);
    for(const secret of ['private-provider-access','private-provider-refresh','private-client-secret','private-agent-credential','private-hub-credential'])assert.equal(serialized.includes(secret),false,secret);
    assert.equal(result.structuredContent.data.hasAccessToken,true);
    assert.equal(result.structuredContent.data.recoveryToken,'signed-recovery-receipt');
    assert.deepEqual(JSON.parse(result.content[0].text),result.structuredContent);
  }finally{await client.close();await server.close();}
});
