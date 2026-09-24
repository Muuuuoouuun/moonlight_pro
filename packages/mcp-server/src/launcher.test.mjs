import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createClient} from './clients.js';
import {version} from './server.js';

const LAUNCHER=fileURLToPath(new URL('../bin/moonlight-mcp.js',import.meta.url));
const payload={status:'live',source:'fixture',data:{resource:'tasks',rows:[]},page:{returnedCount:0,hasMore:false,nextCursor:null}};

// The launcher is what client configs run: no --env-file, no cwd, only its own absolute path.
async function fixture(t){
  const seen=[];
  const hub=http.createServer((req,res)=>{seen.push(req.headers.authorization);res.setHeader('content-type','application/json');res.end(JSON.stringify(payload));});
  await new Promise(resolve=>hub.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>hub.close(resolve)));
  const dir=mkdtempSync(join(tmpdir(),'moonlight-launcher-'));
  const envFile=join(dir,'.env.local');
  writeFileSync(envFile,`COM_MOON_AGENT_API_TOKEN=file-agent-token\nCOM_MOON_HUB_URL=http://127.0.0.1:${hub.address().port}\nGEMINI_API_KEY=not-for-mcp\n`);
  return {seen,dir,env:{PATH:process.env.PATH,HOME:dir,COM_MOON_MCP_ENV_FILE:envFile}};
}

test('stdio: loads credentials from the Hub env file and honours --profile/--read-only',async t=>{
  const {seen,env}=await fixture(t);
  const client=new Client({name:'launcher-test',version:'1.0'},{capabilities:{}});
  t.after(()=>client.close());
  await client.connect(new StdioClientTransport({command:process.execPath,args:[LAUNCHER,'--profile','core','--read-only'],cwd:'/',env,stderr:'pipe'}),{timeout:10_000});
  assert.equal(client.getServerVersion()?.version,version);
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(tool=>tool.name).sort(),['get_command_receipt','get_daily_brief','get_hub_health','get_skill_request','get_task','list_tasks']);
  const result=await client.callTool({name:'list_tasks',arguments:{limit:1}});
  assert.deepEqual(result.structuredContent,payload);
  assert.deepEqual(seen,['Bearer file-agent-token']);
});

test('stdio: rejects an unknown profile with a usage message',async()=>{
  const child=spawn(process.execPath,[LAUNCHER,'--profile','root'],{env:{PATH:process.env.PATH}});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  const code=await new Promise(resolve=>child.on('exit',resolve));
  assert.equal(code,2);
  assert.match(stderr,/Unknown profile: root/);
});

test('http: serves registered clients on an ephemeral loopback port',async t=>{
  const {seen,dir,env}=await fixture(t);
  const clientsFile=join(dir,'clients.json');
  const {token}=createClient(clientsFile,{name:'automation',profile:'core'});
  const child=spawn(process.execPath,[LAUNCHER,'--http','--port','0'],{env:{...env,COM_MOON_MCP_CLIENTS_FILE:clientsFile},stdio:['ignore','ignore','pipe']});
  t.after(()=>child.kill());
  const url=await new Promise((resolve,reject)=>{
    let stderr='';const timer=setTimeout(()=>reject(new Error(`no listen line: ${stderr}`)),10_000);
    child.stderr.on('data',chunk=>{stderr+=chunk;const match=/(http:\/\/127\.0\.0\.1:\d+\/mcp), clients=1/.exec(stderr);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  const client=new Client({name:'launcher-http',version:'1.0'},{capabilities:{}});
  t.after(()=>client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers:{authorization:`Bearer ${token}`}}}));
  assert.equal((await client.listTools()).tools.length,10);
  assert.deepEqual((await client.callTool({name:'list_tasks',arguments:{limit:1}})).structuredContent,payload);
  assert.deepEqual(seen,['Bearer file-agent-token']);
});
