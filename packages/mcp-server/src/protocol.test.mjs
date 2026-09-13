import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

test('real MCP client accepts structured Agent results and preserves all schema fields',async t=>{
 const payload={status:'live',source:'fixture',schemaVersion:'1.0',data:{resource:'tasks',rows:[]},page:{returnedCount:0,hasMore:false,nextCursor:null}};
 const server=http.createServer((req,res)=>{assert.equal(req.headers.authorization,'Bearer fixture-token');res.setHeader('content-type','application/json');res.end(JSON.stringify(payload));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const client=new Client({name:'contract-test',version:'1.0'},{capabilities:{}});
 t.after(async()=>{await client.close();await new Promise(resolve=>server.close(resolve));});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./index.js',import.meta.url))],env:{PATH:process.env.PATH,COM_MOON_AGENT_API_TOKEN:'fixture-token',COM_MOON_HUB_URL:`http://127.0.0.1:${server.address().port}`},stderr:'pipe'}),{timeout:5000});
 const {tools}=await client.listTools();assert.ok(tools.length<=9);
 const result=await client.callTool({name:'list_tasks',arguments:{limit:1}});
 assert.deepEqual(result.structuredContent,payload);
});
