import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpHandler,clientStore} from './http.js';
import {createClient,revokeClient} from './clients.js';

const HUB_TOKEN='fixture-agent-token';
const payload={status:'live',source:'fixture',schemaVersion:'1.0',data:{resource:'tasks',rows:[]},page:{returnedCount:0,hasMore:false,nextCursor:null}};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));

// Fake Hub + MCP HTTP server on loopback; the MCP process holds the Agent token, clients hold their own.
async function harness(t,{ratePerMinute=120,allowedHosts=[]}={}){
  const hubAuth=[];
  const hub=http.createServer((req,res)=>{hubAuth.push(req.headers.authorization);res.setHeader('content-type','application/json');res.end(JSON.stringify(payload));});
  const hubPort=await listen(hub);
  const saved={token:process.env.COM_MOON_AGENT_API_TOKEN,url:process.env.COM_MOON_HUB_URL};
  process.env.COM_MOON_AGENT_API_TOKEN=HUB_TOKEN;process.env.COM_MOON_HUB_URL=`http://127.0.0.1:${hubPort}`;
  const file=join(mkdtempSync(join(tmpdir(),'moonlight-http-')),'clients.json');
  const logs=[];
  const handler=createHttpHandler({getClients:clientStore(file),allowedHosts,ratePerMinute,log:line=>logs.push(line)});
  const mcp=http.createServer((req,res)=>{handler(req,res);});
  const port=await listen(mcp);
  const clients=[];
  t.after(async()=>{
    for(const client of clients)await client.close().catch(()=>{});
    await new Promise(resolve=>mcp.close(resolve));await new Promise(resolve=>hub.close(resolve));
    process.env.COM_MOON_AGENT_API_TOKEN=saved.token;process.env.COM_MOON_HUB_URL=saved.url;
    if(saved.token===undefined)delete process.env.COM_MOON_AGENT_API_TOKEN;
    if(saved.url===undefined)delete process.env.COM_MOON_HUB_URL;
  });
  const url=`http://127.0.0.1:${port}/mcp`;
  const connect=async(token,{path=url,headers={}}={})=>{
    const client=new Client({name:'http-test',version:'1.0'},{capabilities:{}});clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(path),{requestInit:{headers:{...(token?{authorization:`Bearer ${token}`}:{}),...headers}}}));
    return client;
  };
  const raw=({method='POST',path='/mcp',headers={},body}={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,method,path,headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...headers}},res=>{let text='';res.on('data',c=>{text+=c;});res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});
    req.on('error',reject);if(body!==undefined)req.end(body);else req.end();
  });
  return {file,logs,hubAuth,url,port,connect,raw};
}
const INIT=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'raw',version:'1'}}});

test('a registered client lists its profile and reaches the Hub with the server-held token only',async t=>{
  const h=await harness(t);
  const {token}=createClient(h.file,{name:'n8n',profile:'core'});
  const client=await h.connect(token);
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(tool=>tool.name).sort(),['complete_task','create_task','get_command_receipt','get_daily_brief','get_hub_health','get_skill_request','get_task','list_tasks','record_skill_receipt','update_task']);
  const result=await client.callTool({name:'list_tasks',arguments:{limit:1,status:'todo'}});
  assert.deepEqual(result.structuredContent,payload);
  assert.ok(h.hubAuth.length>0);
  assert.ok(h.hubAuth.every(value=>value===`Bearer ${HUB_TOKEN}`),'the client token is never forwarded to the Hub');
  const audit=h.logs.find(line=>line.includes('tools/call:list_tasks'));
  assert.match(audit,/client=n8n tools\/call:list_tasks status=200 ms=\d+/);
  assert.equal(h.logs.some(line=>line.includes('todo')||line.includes(token)),false,'arguments and tokens stay out of the audit log');
});

test('read-only clients never see write tools',async t=>{
  const h=await harness(t);
  const {token}=createClient(h.file,{name:'zapier',profile:'all',readOnly:true});
  const {tools}=await (await h.connect(token)).listTools();
  assert.ok(tools.length>5);
  for(const tool of tools)assert.equal(tool.annotations?.readOnlyHint,true,`${tool.name} must be read-only`);
  assert.equal(tools.some(tool=>/^(create|update|complete|record|decide|start|cancel|resume|request)_/.test(tool.name)),false);
});

test('rejects missing or wrong credentials before touching MCP',async t=>{
  const h=await harness(t);
  createClient(h.file,{name:'cursor'});
  const missing=await h.raw({body:INIT});
  assert.equal(missing.status,401);
  assert.equal(missing.headers['www-authenticate'],'Bearer realm="moonlight"');
  assert.equal((await h.raw({body:INIT,headers:{authorization:'Bearer mlm_wrong'}})).status,401);
  await assert.rejects(h.connect('mlm_wrong'));
  assert.equal(h.hubAuth.length,0);
});

test('blocks DNS rebinding: foreign Host or Origin is refused even with a valid token',async t=>{
  const h=await harness(t,{allowedHosts:['moonlight.example.com']});
  const {token}=createClient(h.file,{name:'cursor'});
  const auth={authorization:`Bearer ${token}`};
  assert.equal((await h.raw({body:INIT,headers:{...auth,host:'evil.example'}})).status,403);
  assert.equal((await h.raw({body:INIT,headers:{...auth,origin:'https://evil.example'}})).status,403);
  assert.equal((await h.raw({body:INIT,headers:{...auth,host:'moonlight.example.com'}})).status,200);
  assert.equal((await h.raw({body:INIT,headers:{...auth,host:`localhost:${h.port}`}})).status,200);
});

test('URL tokens work only for clients created with allowUrl',async t=>{
  const h=await harness(t);
  const header=createClient(h.file,{name:'header-only'});
  const url=createClient(h.file,{name:'claude-web',profile:'core',readOnly:true,allowUrl:true});
  assert.equal((await h.raw({path:`/mcp/${header.token}`,body:INIT})).status,401);
  const client=await h.connect(null,{path:`${h.url}/${url.token}`});
  assert.equal((await client.listTools()).tools.length,6);
  assert.equal(h.logs.some(line=>line.includes(url.token)),false);
});

test('URL-token access stays read-only even if the registry is edited by hand',async t=>{
  const h=await harness(t);
  const {token}=createClient(h.file,{name:'edited',profile:'core',readOnly:true,allowUrl:true});
  const {readFileSync,writeFileSync}=await import('node:fs');
  const data=JSON.parse(readFileSync(h.file,'utf8'));data.clients[0].readOnly=false;writeFileSync(h.file,JSON.stringify(data));
  const viaUrl=await h.connect(null,{path:`${h.url}/${token}`});
  assert.equal((await viaUrl.listTools()).tools.some(tool=>tool.name==='create_task'),false);
  const viaHeader=await h.connect(token);
  assert.equal((await viaHeader.listTools()).tools.some(tool=>tool.name==='create_task'),true);
});

test('revoking a client takes effect on the next request without a restart',async t=>{
  const h=await harness(t);
  const {token}=createClient(h.file,{name:'temp'});
  assert.equal((await h.raw({body:INIT,headers:{authorization:`Bearer ${token}`}})).status,200);
  revokeClient(h.file,'temp');
  assert.equal((await h.raw({body:INIT,headers:{authorization:`Bearer ${token}`}})).status,401);
});

test('POST only, bounded bodies, per-client rate limit and a public health check',async t=>{
  const h=await harness(t,{ratePerMinute:3});
  const {token}=createClient(h.file,{name:'loop'});
  const auth={authorization:`Bearer ${token}`};
  const health=await h.raw({method:'GET',path:'/healthz'});
  assert.equal(health.status,200);
  assert.equal(JSON.parse(health.text).ok,true);
  assert.equal((await h.raw({method:'GET',headers:auth})).status,405);
  assert.equal((await h.raw({body:'{',headers:auth})).status,400);
  assert.equal((await h.raw({body:JSON.stringify({pad:'x'.repeat(600*1024)}),headers:auth})).status,413);
  // 400 and 413 above count toward the window of 3; the third POST passes, the fourth is limited.
  assert.equal((await h.raw({body:INIT,headers:auth})).status,200);
  const limited=await h.raw({body:INIT,headers:auth});
  assert.equal(limited.status,429);
  assert.match(limited.headers['retry-after'],/^\d+$/);
  assert.equal((await h.raw({path:'/other',headers:auth,body:INIT})).status,404);
});

test('an unreadable registry fails closed',async t=>{
  const h=await harness(t);
  const {token}=createClient(h.file,{name:'x'});
  const {writeFileSync}=await import('node:fs');
  writeFileSync(h.file,'{not json');
  assert.equal((await h.raw({body:INIT,headers:{authorization:`Bearer ${token}`}})).status,401);
});
